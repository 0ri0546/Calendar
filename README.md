# Calendar — Étape 1 + responsive + événements

Version v4 — cache 20260909-22.

Corrections :
- bouton de fermeture de la modale événement centré avec flex + dimensions fixes ;
- grille événements mobile conservée en 2 colonnes ;
- cartes compactées pour permettre d'afficher une liste pouvant contenir jusqu'à 10 événements par section sur mobile ;
- titre et détails des cartes protégés contre les débordements ;
- image de la modale mobile plus haute.


Version responsive : 20260909-23. Page Événements : grille 4 colonnes desktop, 1 colonne mobile, sans limite artificielle du nombre d'événements rendus.


Correction 20260909-26 : image de la modale mobile du calendrier non contrainte par les anciennes règles de 34px.


## Étape 6
- Les administrateurs voient un bouton « Valider » sur la page de proposition.
- Le bouton « Proposer » reste le bouton normal.
- « Valider » crée l'activité puis utilise la fonction RPC d'approbation existante.
- Le contrôle admin est effectué côté client pour l'affichage et côté RPC pour la sécurité.


## Étape 8
- Système d'amis par code unique.
- Demandes d'amis avec acceptation/refus.
- Liste d'amis dans un bouton à côté des notifications.
- Bouton WhatsApp pour ouvrir une discussion privée avec un ami.
- Numéro WhatsApp stocké dans private.user_contacts, jamais exposé par la table publique profiles.
- Code ami affiché dans le profil et dans le panneau Amis.
