-- Présence aux jeux divers : une ligne par utilisateur et par journée.
create table if not exists public.day_presence (
    day date not null,
    user_id uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (day, user_id)
);

create index if not exists day_presence_user_id_idx
    on public.day_presence(user_id);

alter table public.day_presence enable row level security;

grant select, insert, delete on public.day_presence to authenticated;

-- Lecture : un membre ne voit que sa présence, un admin voit toutes les présences.
drop policy if exists "Users can view own day presence" on public.day_presence;
create policy "Users can view own day presence"
on public.day_presence for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Admins can view all day presence" on public.day_presence;
create policy "Admins can view all day presence"
on public.day_presence for select to authenticated
using (public.is_admin());

drop policy if exists "Users can add own day presence" on public.day_presence;
create policy "Users can add own day presence"
on public.day_presence for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Users can remove own day presence" on public.day_presence;
create policy "Users can remove own day presence"
on public.day_presence for delete to authenticated
using (user_id = (select auth.uid()));

-- Ecriture atomique : évite les upsert concurrents et les états incohérents
-- quand l'utilisateur clique plusieurs fois rapidement.
create or replace function public.set_day_presence(
    p_day date,
    p_present boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null then
        raise exception 'You must be authenticated';
    end if;

    if p_present then
        insert into public.day_presence (day, user_id)
        values (p_day, (select auth.uid()))
        on conflict (day, user_id) do nothing;
    else
        delete from public.day_presence
        where day = p_day
          and user_id = (select auth.uid());
    end if;

    return p_present;
end;
$$;

revoke all on function public.set_day_presence(date, boolean) from public, anon;
grant execute on function public.set_day_presence(date, boolean) to authenticated;

-- Lecture admin fiable : la fonction joint directement profiles en SECURITY DEFINER.
-- Cela évite que les politiques RLS de profiles fassent disparaître les noms des
-- membres dans le récapitulatif, notamment sur mobile.
create or replace function public.get_day_presence_admin(
    p_start_date date,
    p_end_date date
)
returns table (
    day date,
    user_id uuid,
    pseudo text,
    avatar_url text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
    if (select auth.uid()) is null then
        raise exception 'You must be authenticated';
    end if;

    if not public.is_admin() then
        raise exception 'Admin access required';
    end if;

    return query
    select
        dp.day,
        dp.user_id,
        p.pseudo::text,
        p.avatar_url::text
    from public.day_presence dp
    left join public.profiles p on p.id = dp.user_id
    where dp.day between p_start_date and p_end_date
    order by dp.day asc, p.pseudo asc nulls last;
end;
$$;

revoke all on function public.get_day_presence_admin(date, date) from public, anon;
grant execute on function public.get_day_presence_admin(date, date) to authenticated;

alter publication supabase_realtime add table public.day_presence;
