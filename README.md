# L'oise aux Jeux

> Plateforme web de gestion et d'organisation des activités de l'association L'oise aux Jeux.

[![Website](https://img.shields.io/badge/Website-GitHub%20Pages-222222?logo=github)](https://L'oise auxjeux.github.io/)
[![Frontend](https://img.shields.io/badge/Frontend-HTML%20%2F%20CSS%20%2F%20JavaScript-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/fr/docs/Web/JavaScript)
[![Database](https://img.shields.io/badge/Database-Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)

---

## À propos

**L'oise aux Jeux** est une application web conçue pour faciliter l'organisation des activités de l'association et permettre à ses membres de retrouver facilement les événements et activités proposés.

La plateforme centralise notamment :

- le calendrier hebdomadaire ;
- les activités prévues ;
- les propositions d'activités des membres ;
- les événements ;
- les participations ;
- les présences aux journées ;
- les amis et leur statut en ligne ;
- les notifications ;
- la gestion des membres ;
- les fonctionnalités d'administration.

L'application propose une interface responsive pensée pour une utilisation aussi bien sur ordinateur que sur téléphone.

---

## Fonctionnalités

### 📅 Calendrier

Le calendrier permet de consulter les activités organisées semaine par semaine.

Les membres peuvent notamment :

- consulter les activités d'une journée ;
- rejoindre ou quitter une activité ;
- rejoindre une file d'attente lorsque celle-ci est complète ;
- indiquer leur présence pour les jeux divers ;
- consulter le récapitulatif détaillé d'une journée.

L'affichage est adapté aux petits écrans afin de conserver une navigation confortable sur mobile.

### 🎲 Activités

Deux types de propositions sont disponibles :

- **Jeu préparé**
- **Activité**

Une activité peut notamment comporter :

- un titre ;
- une description ;
- une date ;
- une heure de début ;
- une heure de fin ;
- un lieu ;
- un nombre de participants ;
- une indication d'événement.

Les activités sans limite de participants sont également prises en charge.

### ⭐ Événements

Les activités peuvent être marquées comme événements afin d'apparaître dans la section dédiée.

### 👥 Membres et participations

La plateforme permet de gérer les inscriptions aux activités et les présences.

La visibilité des informations dépend du rôle de l'utilisateur :

- les membres voient les informations nécessaires au fonctionnement des activités ;
- les administrateurs disposent d'une visibilité étendue sur les participants et les présences.

### 🟢 Amis en ligne

Les membres peuvent retrouver leurs amis et identifier rapidement ceux qui sont actuellement en ligne.

### 🔔 Notifications

Le système de notifications permet d'informer les membres des événements et actions nécessitant leur attention.

### 🛠️ Administration

Les administrateurs disposent d'une interface dédiée permettant notamment de :

- gérer les activités ;
- valider ou refuser les propositions ;
- gérer les membres ;
- modifier certaines informations du calendrier ;
- consulter les présences ;
- consulter les participants ;
- consulter les logs administratifs.

Les logs permettent notamment de savoir :

> **Qui** a effectué une action, **quand**, **quelle action** a été réalisée et **sur quoi ou qui** elle porte.

---

## Gestion des rôles

### Membre

Un membre peut :

- consulter le calendrier ;
- consulter les activités ;
- participer aux activités ;
- quitter une activité ;
- indiquer sa présence aux jeux divers ;
- proposer une activité ;
- consulter ses amis ;
- recevoir des notifications.

### Administrateur

Un administrateur dispose en plus de fonctionnalités de gestion et d'une visibilité étendue sur les participants et les présences.

---

## Technologies

### Frontend

- HTML5
- CSS3
- JavaScript
- Interface responsive
- Aucun framework frontend lourd

### Backend / données

- [Supabase](https://supabase.com/)
- PostgreSQL
- Authentification Supabase
- Fonctions SQL sécurisées
- Gestion des rôles et permissions
- Données temps réel lorsque nécessaire

### Hébergement

Le frontend est déployé avec **GitHub Pages**.

---

## Structure du projet

```text
.
├── assets/
│   └── images/
│       └── logo.webp
│
├── css/
│   └── style.css
│
├── js/
│   ├── activity-media.js
│   ├── admin-activity.js
│   ├── admin.js
│   ├── auth.js
│   ├── calendar.js
│   ├── events.js
│   ├── friends.js
│   ├── home.js
│   ├── login.js
│   ├── main.js
│   ├── notifications.js
│   ├── profile.js
│   ├── propose.js
│   ├── supabase.js
│   ├── ui-messages.js
│   └── ui.js
│
├── pages/
│   ├── admin.html
│   ├── calendar.html
│   ├── events.html
│   ├── login.html
│   ├── mentions-legales.html
│   ├── politique-confidentialite.html
│   ├── profile.html
│   └── propose.html
│
├── supabase/
│   ├── admin-log-journal-v2.sql
│   ├── calendar-day-tags.sql
│   ├── day-presence.sql
│   ├── notification-email-preference.sql
│   ├── security-functions.sql
│   └── step8-friends.sql
│
└── index.html
```

---

## Base de données

Les fonctionnalités backend sont principalement regroupées dans le dossier `supabase/`.

On y retrouve notamment les fonctionnalités liées :

- à la sécurité ;
- aux rôles administrateurs ;
- aux activités ;
- aux participations ;
- aux présences journalières ;
- aux tags du calendrier ;
- aux amis ;
- aux notifications ;
- aux logs administratifs.

Les fonctions SQL sensibles utilisent des contrôles d'accès afin d'éviter qu'un utilisateur puisse effectuer des opérations réservées aux administrateurs.

---

## Responsive design

L'application est conçue pour s'adapter aux différentes tailles d'écran.

### Desktop

L'interface exploite davantage l'espace disponible afin d'afficher plus d'informations simultanément.

### Mobile

L'interface privilégie :

- des cartes plus compactes ;
- une navigation simplifiée ;
- des informations essentielles ;
- des fiches détaillées accessibles individuellement ;
- un calendrier adapté aux écrans étroits.

Une attention particulière est portée aux très petits écrans afin d'éviter les débordements horizontaux.

---

## Sécurité

La gestion des utilisateurs et des permissions repose sur Supabase.

Les fonctionnalités sensibles sont protégées côté base de données afin que les restrictions ne reposent pas uniquement sur l'interface JavaScript.

Les actions administratives sont également journalisées afin de conserver une trace des opérations importantes.

> ⚠️ Les clés et informations sensibles de configuration ne doivent jamais être commit dans le dépôt.

---

## Déploiement

Le site peut être déployé sur GitHub Pages.

Le déploiement est automatisé via GitHub Actions.

Une fois la branche configurée pour le déploiement, chaque mise à jour validée peut être publiée automatiquement sur GitHub Pages.

---

## Développement

Pour travailler localement sur le projet :

1. Cloner le dépôt.
2. Ouvrir le projet dans son éditeur.
3. Servir le dossier avec un serveur HTTP local.
4. Configurer les informations de connexion Supabase nécessaires.
5. Tester les fonctionnalités sur desktop et mobile.

> L'application utilise des fichiers HTML/JS/CSS statiques : un simple serveur HTTP local suffit pour le frontend.

---

## Documentation légale

Le site contient également :

- une page **Mentions légales** ;
- une page **Politique de confidentialité**.

Ces pages sont accessibles depuis le footer du site.

Les informations propres à l'association doivent être complétées avant la mise en production définitive.

---

## Projet

Développé pour l'association **L'oise aux Jeux**.

L'objectif du projet est de proposer un outil simple, moderne et accessible permettant aux membres de l'association de découvrir les activités, organiser leur participation et rester informés de la vie de l'association.

---

## Licence

Ce projet est destiné à l'association **L'oise aux Jeux**.

Les conditions de réutilisation, modification et redistribution du code sont définies par les responsables du dépôt.
