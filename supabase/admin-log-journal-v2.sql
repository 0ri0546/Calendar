-- Journal administrateur V2
-- Enregistre automatiquement les propositions d'activités,
-- y compris lorsqu'elles sont faites par un membre.

create or replace function public.log_activity_proposal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.status = 'pending' and new.created_by is not null then
        insert into public.admin_logs (
            actor_id,
            action,
            target_type,
            target_id,
            details
        )
        values (
            new.created_by,
            'activity_created',
            'activity',
            new.id,
            jsonb_build_object(
                'title', new.title,
                'date', new.date,
                'activity_type', new.activity_type,
                'location', new.location,
                'created_by', new.created_by
            )
        );
    end if;

    return new;
end;
$$;

drop trigger if exists trg_log_activity_proposal on public.activities;

create trigger trg_log_activity_proposal
after insert on public.activities
for each row
execute function public.log_activity_proposal();

revoke all on function public.log_activity_proposal() from public, anon, authenticated;
