-- Étape 8 : amis par code + contact WhatsApp
alter table public.profiles
    add column if not exists friend_code text;

update public.profiles
set friend_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where friend_code is null;

alter table public.profiles
    alter column friend_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

create unique index if not exists profiles_friend_code_idx
    on public.profiles(friend_code);

create table if not exists public.friend_requests (
    id uuid primary key default gen_random_uuid(),
    requester_id uuid not null references public.profiles(id) on delete cascade,
    addressee_id uuid not null references public.profiles(id) on delete cascade,
    status text not null default 'pending' check (status in ('pending','accepted','rejected')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (requester_id <> addressee_id)
);

create unique index if not exists friend_requests_pair_pending_idx
    on public.friend_requests(least(requester_id, addressee_id), greatest(requester_id, addressee_id))
    where status in ('pending','accepted');

alter table public.friend_requests enable row level security;
revoke all on public.friend_requests from anon, authenticated;

create policy "Users can view their own friend requests"
on public.friend_requests
for select
to authenticated
using ((select auth.uid()) = requester_id or (select auth.uid()) = addressee_id);

create or replace function public.send_friend_request(p_friend_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
    me uuid := auth.uid();
    target uuid;
    existing public.friend_requests;
begin
    if me is null then
        raise exception 'not_authenticated';
    end if;

    select id into target
    from public.profiles
    where upper(friend_code) = upper(trim(p_friend_code))
    limit 1;

    if target is null then
        raise exception 'friend_code_not_found';
    end if;

    if target = me then
        raise exception 'cannot_add_self';
    end if;

    select * into existing
    from public.friend_requests
    where least(requester_id, addressee_id) = least(me, target)
      and greatest(requester_id, addressee_id) = greatest(me, target)
      and status in ('pending','accepted')
    limit 1;

    if existing.id is not null then
        if existing.status = 'accepted' then
            raise exception 'already_friends';
        end if;
        raise exception 'request_already_exists';
    end if;

    insert into public.friend_requests(requester_id, addressee_id)
    values (me, target);

    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.get_friend_requests()
returns table (
    id uuid,
    requester_id uuid,
    requester_pseudo text,
    requester_avatar_url text,
    created_at timestamptz
)
language sql
security definer
set search_path = public, private
as $$
    select
        fr.id,
        fr.requester_id,
        p.pseudo,
        p.avatar_url,
        fr.created_at
    from public.friend_requests fr
    join public.profiles p on p.id = fr.requester_id
    where fr.addressee_id = auth.uid()
      and fr.status = 'pending'
    order by fr.created_at desc;
$$;

create or replace function public.respond_friend_request(p_request_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
    request_row public.friend_requests;
begin
    select * into request_row
    from public.friend_requests
    where id = p_request_id
      and addressee_id = auth.uid()
      and status = 'pending'
    for update;

    if request_row.id is null then
        raise exception 'friend_request_not_found';
    end if;

    update public.friend_requests
    set status = case when p_accept then 'accepted' else 'rejected' end,
        updated_at = now()
    where id = p_request_id;

    return jsonb_build_object('ok', true, 'accepted', p_accept);
end;
$$;

create table if not exists private.user_contacts (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    phone text,
    updated_at timestamptz not null default now()
);
revoke all on private.user_contacts from public, anon, authenticated;

create or replace function public.set_my_phone(p_phone text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
    if auth.uid() is null then raise exception 'not_authenticated'; end if;
    if nullif(trim(p_phone), '') is null then raise exception 'phone_required'; end if;
    insert into private.user_contacts(user_id, phone, updated_at)
    values (auth.uid(), trim(p_phone), now())
    on conflict (user_id) do update set phone = excluded.phone, updated_at = now();
end;
$$;

create or replace function public.get_my_phone()
returns text
language sql
security definer
set search_path = public, private
as $$
    select phone from private.user_contacts where user_id = auth.uid();
$$;

create or replace function public.get_friends()
returns table (
    id uuid,
    pseudo text,
    avatar_url text,
    phone text,
    friend_code text
)
language sql
security definer
set search_path = public, private
as $$
    select p.id, p.pseudo, p.avatar_url, c.phone, p.friend_code
    from public.friend_requests fr
    join public.profiles p
      on p.id = case when fr.requester_id = auth.uid() then fr.addressee_id else fr.requester_id end
    left join private.user_contacts c on c.user_id = p.id
    where (fr.requester_id = auth.uid() or fr.addressee_id = auth.uid())
      and fr.status = 'accepted'
    order by lower(coalesce(p.pseudo, ''));
$$;

revoke execute on function public.send_friend_request(text) from public, anon;
revoke execute on function public.get_friend_requests() from public, anon;
revoke execute on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke execute on function public.get_friends() from public, anon;
revoke execute on function public.set_my_phone(text) from public, anon;
revoke execute on function public.get_my_phone() from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.get_friend_requests() to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.get_friends() to authenticated;
grant execute on function public.set_my_phone(text) to authenticated;
grant execute on function public.get_my_phone() to authenticated;

-- Autorise chaque utilisateur à mettre à jour son numéro, mais pas son rôle.

