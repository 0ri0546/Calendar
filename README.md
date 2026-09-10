# Calendar - tags de journées

## Modifications
- Les samedis 1 à 4 gardent leur thème habituel et reçoivent le tag `privilégié`.
- Le 5e samedi du mois reçoit `privilégié` et `activité privilégié non définie`.
- Les tags d'une journée sont visibles dans le calendrier et dans le récapitulatif d'une journée.
- Les administrateurs peuvent modifier les tags depuis le récapitulatif d'une journée, avec plusieurs tags séparés par des virgules.
- Les tags personnalisés sont persistés dans Supabase.

## Base de données
La migration `supabase/calendar-day-tags.sql` crée `calendar_day_tags`, ses politiques RLS et la fonction `is_admin()`.
La migration a été appliquée au projet Supabase utilisé par l'application.
