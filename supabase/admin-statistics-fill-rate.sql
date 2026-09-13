-- Statistiques admin : 8 périodes (période précédente, période en cours, puis 6 périodes futures)
-- et taux moyen de remplissage des activités à capacité limitée.

create or replace function public.get_admin_statistics(p_period text)
returns table (
    bucket_start date,
    activity_count bigint,
    participation_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_period text := lower(trim(p_period));
    v_local_now timestamp;
begin
    if (select auth.uid()) is null then
        raise exception 'You must be logged in';
    end if;

    if not exists (
        select 1 from public.profiles
        where id = (select auth.uid()) and role = 'admin'
    ) then
        raise exception 'You must be an administrator';
    end if;

    if v_period not in ('day', 'week', 'month') then
        raise exception 'Invalid statistics period';
    end if;

    v_local_now := now() at time zone 'Europe/Paris';

    return query
    with periods as (
        select generate_series(
            date_trunc(v_period, v_local_now) - case v_period
                when 'day' then interval '1 day'
                when 'week' then interval '1 week'
                else interval '1 month'
            end,
            date_trunc(v_period, v_local_now) + case v_period
                when 'day' then interval '6 days'
                when 'week' then interval '6 weeks'
                else interval '6 months'
            end,
            case v_period
                when 'day' then interval '1 day'
                when 'week' then interval '1 week'
                else interval '1 month'
            end
        )::date as bucket_start
    ), counts as (
        select
            date_trunc(v_period, occurred_at at time zone 'Europe/Paris')::date as bucket_start,
            count(*) filter (where event_type = 'activity_approved') as activity_count,
            count(*) filter (where event_type = 'activity_joined') as participation_count
        from public.admin_statistics_events
        group by 1
    )
    select p.bucket_start,
           coalesce(c.activity_count, 0)::bigint,
           coalesce(c.participation_count, 0)::bigint
    from periods p
    left join counts c using (bucket_start)
    order by p.bucket_start;
end;
$$;

create or replace function public.get_admin_fill_statistics(p_period text)
returns table (
    bucket_start date,
    average_fill_rate numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_period text := lower(trim(p_period));
    v_local_now timestamp;
begin
    if (select auth.uid()) is null then
        raise exception 'You must be logged in';
    end if;

    if not exists (
        select 1 from public.profiles
        where id = (select auth.uid()) and role = 'admin'
    ) then
        raise exception 'You must be an administrator';
    end if;

    if v_period not in ('day', 'week', 'month') then
        raise exception 'Invalid statistics period';
    end if;

    v_local_now := now() at time zone 'Europe/Paris';

    return query
    with periods as (
        select generate_series(
            date_trunc(v_period, v_local_now) - case v_period
                when 'day' then interval '1 day'
                when 'week' then interval '1 week'
                else interval '1 month'
            end,
            date_trunc(v_period, v_local_now) + case v_period
                when 'day' then interval '6 days'
                when 'week' then interval '6 weeks'
                else interval '6 months'
            end,
            case v_period
                when 'day' then interval '1 day'
                when 'week' then interval '1 week'
                else interval '1 month'
            end
        )::date as bucket_start
    ), activity_fill as (
        select
            a.id,
            date_trunc(v_period, a.date::timestamp)::date as bucket_start,
            least(
                100::numeric,
                greatest(
                    0::numeric,
                    (count(p.user_id)::numeric / nullif(a.max_players, 0)::numeric) * 100
                )
            ) as fill_rate
        from public.activities a
        left join public.participations p on p.activity_id = a.id
        where a.status = 'approved'
          and a.max_players is not null
          and a.max_players > 0
        group by a.id, a.date, a.max_players
    ), averages as (
        select bucket_start, avg(fill_rate) as average_fill_rate
        from activity_fill
        group by bucket_start
    )
    select p.bucket_start,
           coalesce(round(avg.average_fill_rate, 1), 0)::numeric
    from periods p
    left join averages avg using (bucket_start)
    order by p.bucket_start;
end;
$$;

revoke all on function public.get_admin_fill_statistics(text) from public, anon;
grant execute on function public.get_admin_fill_statistics(text) to authenticated;
