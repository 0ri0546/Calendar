# Étape 7 — Préférence de notifications

La préférence est stockée dans `auth.users.user_metadata.notifications_enabled` via `supabase.auth.updateUser()`.

Valeur par défaut : `true` si la propriété n'existe pas.

## Envoi des e-mails

Le fichier `notification-email-preference.sql` ajoute un trigger `BEFORE INSERT` sur `public.notification_events`.

- si `notifications_enabled` vaut `false`, l'événement est marqué `sent` avant le webhook ;
- l'Edge Function `notify-place-opened` voit donc un événement déjà traité et n'envoie aucun e-mail ;
- l'événement reste présent dans `notification_events`, afin que les notifications internes du site continuent de fonctionner ;
- si la préférence n'existe pas, elle est considérée comme activée.
