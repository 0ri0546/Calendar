-- Statistiques administrateur persistantes.
-- Les événements statistiques sont séparés du journal admin (nettoyé après 14 jours)
-- afin de conserver les tendances sans conserver le détail des actions.

create table if not exists public.admin_statistics_events (
    id bigint generated always as identity primary key,
    event_type text not null check (event_type in ('activity_approved', 'activity_joined')),
    occurred_at timestamptz not null default now(),
    activity_id uuid
);

create index if not exists admin_statistics_events_occurred_at_idx
    on public.admin_statistics_events (occurred_at);

create index if not exists admin_statistics_events_type_occurred_at_idx
    on public.admin_statistics_events (event_type, occurred_at);

alter table public.admin_statistics_events enable row level security;

revoke all on table public.admin_statistics_events from anon, authenticated;

create or replace function public.record_admin_statistic(
    p_event_type text,
    p_occurred_at timestamptz default now(),
    p_activity_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_event_type not in ('activity_approved', 'activity_joined') then
        raise exception 'Invalid statistics event type';
    end if;

    insert into public.admin_statistics_events(event_type, occurred_at, activity_id)
    values (p_event_type, coalesce(p_occurred_at, now()), p_activity_id);
end;
$$;

revoke all on function public.record_admin_statistic(text, timestamptz, uuid) from public, anon, authenticated;

create or replace function public.audit_activity_statistics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'UPDATE'
       and old.status = 'pending'
       and new.status = 'approved' then
        perform public.record_admin_statistic('activity_approved', now(), new.id);
    end if;
    return new;
end;
$$;

drop trigger if exists trg_statistics_activity_approval on public.activities;
create trigger trg_statistics_activity_approval
after update of status on public.activities
for each row execute function public.audit_activity_statistics();

revoke all on function public.audit_activity_statistics() from public, anon, authenticated;

create or replace function public.audit_participation_statistics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'INSERT' then
        perform public.record_admin_statistic('activity_joined', new.joined_at, new.activity_id);
    end if;
    return new;
end;
$$;

drop trigger if exists trg_statistics_participation on public.participations;
create trigger trg_statistics_participation
after insert on public.participations
for each row execute function public.audit_participation_statistics();

revoke all on function public.audit_participation_statistics() from public, anon, authenticated;

-- Rattrapage des participations existantes.
insert into public.admin_statistics_events(event_type, occurred_at, activity_id)
select 'activity_joined', p.joined_at, p.activity_id
from public.participations p
where not exists (
    select 1
    from public.admin_statistics_events s
    where s.event_type = 'activity_joined'
      and s.activity_id = p.activity_id
      and s.occurred_at = p.joined_at
);

-- Rattrapage des validations encore présentes dans le journal admin.
insert into public.admin_statistics_events(event_type, occurred_at, activity_id)
select 'activity_approved', l.created_at, l.target_id
from public.admin_logs l
where l.action = 'activity_approved'
  and not exists (
    select 1
    from public.admin_statistics_events s
    where s.event_type = 'activity_approved'
      and s.activity_id = l.target_id
      and s.occurred_at = l.created_at
);

create or replace function public.get_admin_statistics(p_period text)
returns table (
    bucket_start date,
    activity_count bigint,
    participation_count bigint,
    fill_rate numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_period text := lower(trim(p_period));
    v_start timestamptz;
    v_end timestamptz;
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

    -- 8 colonnes : la période précédente, la période en cours, puis
    -- les 6 prochaines périodes. La période en cours est donc toujours
    -- la deuxième colonne du graphique.
    v_start := case v_period
        when 'day' then (date_trunc('day', v_local_now) - interval '1 day') at time zone 'Europe/Paris'
        when 'week' then (date_trunc('week', v_local_now) - interval '1 week') at time zone 'Europe/Paris'
        else (date_trunc('month', v_local_now) - interval '1 month') at time zone 'Europe/Paris'
    end;

    v_end := case v_period
        when 'day' then (date_trunc('day', v_local_now) + interval '7 days') at time zone 'Europe/Paris'
        when 'week' then (date_trunc('week', v_local_now) + interval '7 weeks') at time zone 'Europe/Paris'
        else (date_trunc('month', v_local_now) + interval '7 months') at time zone 'Europe/Paris'
    end;

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
        where occurred_at >= v_start
          and occurred_at < v_end
        group by 1
    ), activity_fill as (
        select
            date_trunc(v_period, a.date::timestamp)::date as bucket_start,
            avg(
                least(
                    100::numeric,
                    (coalesce(p.participant_count, 0)::numeric * 100)
                    / nullif(a.max_players, 0)
                )
            ) as fill_rate
        from public.activities a
        left join (
            select activity_id, count(*) as participant_count
            from public.participations
            group by activity_id
        ) p on p.activity_id = a.id
        where a.status = 'approved'
          and a.max_players is not null
          and a.max_players > 0
          and a.date >= v_start::date
          and a.date < v_end::date
        group by 1
    )
    select
        periods.bucket_start,
        coalesce(counts.activity_count, 0)::bigint,
        coalesce(counts.participation_count, 0)::bigint,
        coalesce(activity_fill.fill_rate, 0)::numeric
    from periods
    left join counts using (bucket_start)
    left join activity_fill using (bucket_start)
    order by periods.bucket_start;
end;
$$;

revoke all on function public.get_admin_statistics(text) from public, anon;
grant execute on function public.get_admin_statistics(text) to authenticated;
