import { supabase } from "./supabase.js?v=20260910-1";

const activitiesContainer = document.getElementById("home-today-activities");
const dateLabel = document.getElementById("home-today-date");

function formatDateForDatabase(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatTodayLabel(date) {
    return new Intl.DateTimeFormat("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long"
    }).format(date);
}

function formatTime(value) {
    if (!value) return "";
    return String(value).slice(0, 5);
}

function createActivityCard(activity) {
    const link = document.createElement("a");
    link.className = "home-today-activity";
    link.href = `pages/calendar.html?activity=${encodeURIComponent(activity.id)}`;
    link.setAttribute("aria-label", `Voir l'activité ${activity.title} dans le calendrier`);

    const top = document.createElement("div");
    top.className = "home-today-activity-top";

    const title = document.createElement("h3");
    title.textContent = activity.title;
    top.appendChild(title);

    if (activity.is_event) {
        const badge = document.createElement("span");
        badge.className = "home-today-event";
        badge.textContent = "⭐";
        badge.title = "Événement important";
        badge.setAttribute("aria-label", "Événement important");
        top.appendChild(badge);
    }

    link.appendChild(top);

    const details = document.createElement("div");
    details.className = "home-today-details";

    if (activity.activity_type === "free") {
        const type = document.createElement("span");
        type.className = "home-today-type";
        type.textContent = "🃏 Jeu libre";
        details.appendChild(type);
    } else if (activity.start_time) {
        const time = document.createElement("span");
        time.textContent = `🕐 ${formatTime(activity.start_time)}${activity.end_time ? ` → ${formatTime(activity.end_time)}` : ""}`;
        details.appendChild(time);
    }

    if (activity.location) {
        const location = document.createElement("span");
        location.textContent = `📍 ${activity.location}`;
        details.appendChild(location);
    }

    link.appendChild(details);

    const more = document.createElement("span");
    more.className = "home-today-more";
    more.textContent = "Voir dans le calendrier →";
    link.appendChild(more);

    return link;
}

async function loadTodayActivities() {
    if (!activitiesContainer) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dateLabel) {
        dateLabel.textContent = formatTodayLabel(today);
    }

    const todayString = formatDateForDatabase(today);

    const { data, error } = await supabase
        .from("activities")
        .select(`
            id,
            title,
            date,
            start_time,
            end_time,
            location,
            is_event,
            activity_type
        `)
        .eq("status", "approved")
        .eq("date", todayString)
        .order("start_time", { ascending: true, nullsFirst: false })
        .order("title", { ascending: true });

    activitiesContainer.replaceChildren();

    if (error) {
        console.error("Erreur récupération activités du jour :", error);

        const message = document.createElement("p");
        message.className = "home-today-empty";
        message.textContent = "Impossible de charger les activités du jour.";
        activitiesContainer.appendChild(message);
        return;
    }

    if (!data?.length) {
        const message = document.createElement("p");
        message.className = "home-today-empty";
        message.textContent = "Aucune activité prévue aujourd’hui.";
        activitiesContainer.appendChild(message);
        return;
    }

    data.forEach(activity => {
        activitiesContainer.appendChild(createActivityCard(activity));
    });
}

loadTodayActivities();
