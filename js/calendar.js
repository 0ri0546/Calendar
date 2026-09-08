import { supabase } from "./supabase.js";

const calendarContainer = document.getElementById("calendar");
const calendarPeriod = document.getElementById("calendar-period");


/*
 * Retourne une date au format YYYY-MM-DD.
 */
function formatDateForDatabase(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


/*
 * Retourne une date lisible en français.
 *
 * Exemple :
 * 2026-09-08 -> mardi 8 septembre
 */
function formatDateForDisplay(dateString) {
    const date = new Date(`${dateString}T00:00:00`);

    return new Intl.DateTimeFormat("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long"
    }).format(date);
}


/*
 * Calcule la période du calendrier :
 *
 * aujourd'hui -> exactement un mois plus tard
 */
function getCalendarPeriod() {
    const today = new Date();

    today.setHours(0, 0, 0, 0);

    const endDate = new Date(today);
    endDate.setMonth(endDate.getMonth() + 1);

    return {
        today,
        endDate
    };
}


/*
 * Récupère toutes les activités approuvées
 * comprises dans la période du calendrier.
 */
async function loadActivities() {
    const { today, endDate } = getCalendarPeriod();

    const startDate = formatDateForDatabase(today);
    const finalDate = formatDateForDatabase(endDate);

    const { data, error } = await supabase
        .from("activities")
        .select(`
            id,
            title,
            description,
            date,
            start_time,
            end_time,
            min_players,
            max_players
        `)
        .eq("status", "approved")
        .gte("date", startDate)
        .lte("date", finalDate)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true });

    if (error) {
        console.error(
            "Erreur récupération activités :",
            error
        );

        throw error;
    }

    return data;
}


/*
 * Groupe les activités par date.
 *
 * Exemple :
 *
 * {
 *   "2026-09-10": [activité1, activité2],
 *   "2026-09-12": [activité3]
 * }
 */
function groupActivitiesByDate(activities) {
    const grouped = new Map();

    for (const activity of activities) {
        if (!grouped.has(activity.date)) {
            grouped.set(activity.date, []);
        }

        grouped.get(activity.date).push(activity);
    }

    return grouped;
}


/*
 * Crée l'affichage d'une activité.
 */
function createActivityElement(activity) {
    const article = document.createElement("article");

    article.className = "calendar-activity";

    const title = document.createElement("h3");
    title.textContent = activity.title;

    article.appendChild(title);

    const time = document.createElement("p");
    time.textContent =
        `${activity.start_time} → ${activity.end_time}`;

    article.appendChild(time);

    const players = document.createElement("p");
    players.textContent =
        `${activity.min_players} à ${activity.max_players} joueurs`;

    article.appendChild(players);

    if (activity.description) {
        const description = document.createElement("p");
        description.textContent = activity.description;

        article.appendChild(description);
    }

    return article;
}


/*
 * Affiche le calendrier.
 */
function renderCalendar(activities) {
    const { today, endDate } = getCalendarPeriod();

    calendarContainer.replaceChildren();

    const groupedActivities =
        groupActivitiesByDate(activities);

    /*
     * Affichage de la période.
     */
    calendarPeriod.textContent =
        `Du ${today.toLocaleDateString("fr-FR")} au ${endDate.toLocaleDateString("fr-FR")}`;


    /*
     * On parcourt chaque jour de la période.
     */
    const currentDate = new Date(today);

    while (currentDate <= endDate) {
        const dateString =
            formatDateForDatabase(currentDate);

        const dayElement =
            document.createElement("section");

        dayElement.className = "calendar-day";

        const heading =
            document.createElement("h2");

        heading.textContent =
            formatDateForDisplay(dateString);

        dayElement.appendChild(heading);

        const activitiesForDay =
            groupedActivities.get(dateString) ?? [];

        /*
         * Aucun événement ce jour-là.
         */
        if (activitiesForDay.length === 0) {
            const empty =
                document.createElement("p");

            empty.textContent =
                "Aucune activité prévue.";

            dayElement.appendChild(empty);
        }

        /*
         * Une ou plusieurs activités.
         */
        for (const activity of activitiesForDay) {
            dayElement.appendChild(
                createActivityElement(activity)
            );
        }

        calendarContainer.appendChild(dayElement);

        currentDate.setDate(
            currentDate.getDate() + 1
        );
    }
}


/*
 * Initialisation.
 */
async function init() {
    try {
        const activities =
            await loadActivities();

        renderCalendar(activities);

    } catch (error) {
        console.error(
            "Impossible de charger le calendrier :",
            error
        );

        calendarContainer.textContent =
            "Impossible de charger le calendrier.";
    }
}


init();