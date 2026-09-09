-- Désactive l'envoi d'e-mails pour les utilisateurs ayant désactivé
-- « Recevoir les notifications » dans leur compte.
--
-- La préférence est stockée dans auth.users.raw_user_meta_data sous
-- la clé notifications_enabled. Si la clé n'existe pas, la valeur
-- par défaut reste true.
--
-- Le trigger laisse malgré tout l'événement dans notification_events
-- afin que les notifications internes du site continuent de fonctionner.
-- Il marque simplement l'événement comme traité avant que le webhook
-- ne déclenche l'Edge Function d'envoi d'e-mail.

create schema if not exists private;

create or replace function private.skip_notification_email_when_disabled()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
    if exists (
        select 1
        from auth.users u
        where u.id = new.user_id
          and coalesce((u.raw_user_meta_data ->> 'notifications_enabled')::boolean, true) = false
    ) then
        new.status := 'sent';
        new.sent_at := now();
    end if;

    return new;
end;
$$;

revoke execute on function private.skip_notification_email_when_disabled() from public;
revoke execute on function private.skip_notification_email_when_disabled() from anon;
revoke execute on function private.skip_notification_email_when_disabled() from authenticated;

drop trigger if exists "notification-email-preference" on public.notification_events;

create trigger "notification-email-preference"
before insert on public.notification_events
for each row
execute function private.skip_notification_email_when_disabled();
