-- À exécuter dans Supabase SQL Editor avant de tester les boutons
-- rejoindre/quitter/suivre/ne plus suivre.
--
-- Les fonctions sont appelées via supabase.rpc(), donc elles restent dans
-- public, mais leur exécution est réservée aux utilisateurs authentifiés.
-- SECURITY DEFINER leur permet d'écrire dans les tables malgré RLS, tandis
-- que les contrôles métier sont effectués ici.

create or replace function public.join_activity(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_max_players integer;
    v_current_players integer;
    v_status text;
begin
    if (select auth.uid()) is null then
        raise exception 'You must be authenticated';
    end if;

    select max_players, status
    into v_max_players, v_status
    from public.activities
    where id = p_activity_id
    for update;

    if not found then
        raise exception 'Activity not found';
    end if;

    if v_status <> 'approved' then
        raise exception 'Activity is not available';
    end if;

    if exists (
        select 1
        from public.participations
        where activity_id = p_activity_id
          and user_id = (select auth.uid())
    ) then
        raise exception 'You are already participating';
    end if;

    select count(*)
    into v_current_players
    from public.participations
    where activity_id = p_activity_id;

    if v_current_players >= v_max_players then
        raise exception 'Activity is full';
    end if;

    insert into public.participations (activity_id, user_id)
    values (p_activity_id, (select auth.uid()));
end;
$$;

create or replace function public.leave_activity(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null then
        raise exception 'You must be authenticated';
    end if;

    delete from public.participations
    where activity_id = p_activity_id
      and user_id = (select auth.uid());

    if not found then
        raise exception 'You are not participating in this activity';
    end if;
end;
$$;

create or replace function public.follow_activity(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null then
        raise exception 'You must be authenticated';
    end if;

    if not exists (
        select 1
        from public.activities
        where id = p_activity_id
          and status = 'approved'
    ) then
        raise exception 'Activity not found';
    end if;

    insert into public.followers (activity_id, user_id)
    values (p_activity_id, (select auth.uid()))
    on conflict (activity_id, user_id) do nothing;
end;
$$;

create or replace function public.unfollow_activity(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
 as $$
begin
    if (select auth.uid()) is null then
        raise exception 'You must be authenticated';
    end if;

    delete from public.followers
    where activity_id = p_activity_id
      and user_id = (select auth.uid());
end;
$$;

revoke execute on function public.join_activity(uuid) from public, anon;
revoke execute on function public.leave_activity(uuid) from public, anon;
revoke execute on function public.follow_activity(uuid) from public, anon;
revoke execute on function public.unfollow_activity(uuid) from public, anon;

grant execute on function public.join_activity(uuid) to authenticated;
grant execute on function public.leave_activity(uuid) to authenticated;
grant execute on function public.follow_activity(uuid) to authenticated;
grant execute on function public.unfollow_activity(uuid) to authenticated;

-- Permet à l'utilisateur connecté de savoir s'il suit déjà une activité.
create policy "Users can view their own follows"
on public.followers
for select
to authenticated
using ((select auth.uid()) = user_id);
