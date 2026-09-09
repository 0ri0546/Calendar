# Étape 7 — Préférence de notifications

La préférence est stockée dans `auth.users.user_metadata.notifications_enabled` via `supabase.auth.updateUser()`.
Aucune modification SQL n’est nécessaire pour cette étape.

Valeur par défaut : `true` si la propriété n’existe pas.
