import { supabase } from "./supabase.js?v=20260909-07";

const eventsContainer = document.getElementById("events-list");
const eventsPeriod = document.getElementById("events-period");

function formatDate(dateString) {
    return new Intl.DateTimeFormat("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    }).format(new Date(`${dateString}T00:00:00`));
}

function formatTime(time) {
    return time ? time.slice(0, 5) : "";
}

function createEventCard(activity, isPast) {
    const article = document.createElement("article");
    article.className = `event-card${isPast ? " event-card-past" : ""}`;

    if (activity.image_url) {
        const image = document.createElement("img");
        image.className = "event-card-image";
        image.src = activity.image_url;
        image.alt = `Illustration de ${activity.title}`;
        image.loading = "lazy";
        article.appendChild(image);
    }

    const content = document.createElement("div");
    content.className = "event-card-content";

    const heading = document.createElement("div");
    heading.className = "event-card-heading";

    const title = document.createElement("h3");
    title.textContent = activity.title;
    heading.appendChild(title);

    const badge = document.createElement("span");
    badge.className = isPast ? "event-status-badge past" : "event-status-badge upcoming";
    badge.textContent = isPast ? "Passé" : "À venir";
    heading.appendChild(badge);
    content.appendChild(heading);

    const details = document.createElement("div");
    details.className = "event-card-details";

    const date = document.createElement("p");
    date.textContent = `📅 ${formatDate(activity.date)}`;
    details.appendChild(date);

    if (activity.start_time || activity.end_time) {
        const time = document.createElement("p");
        time.textContent = `🕐 ${formatTime(activity.start_time)} → ${formatTime(activity.end_time)}`;
        details.appendChild(time);
    }

    if (activity.location) {
        const location = document.createElement("p");
        location.textContent = `📍 ${activity.location}`;
        details.appendChild(location);
    }

    content.appendChild(details);

    if (activity.description) {
        const description = document.createElement("p");
        description.className = "event-card-description";
        description.textContent = activity.description;
        content.appendChild(description);
    }

    const link = document.createElement("a");
    link.className = "event-card-link";
    link.textContent = "Voir dans le calendrier";
    link.href = `calendar.html?activity=${encodeURIComponent(activity.id)}`;
    content.appendChild(link);

    article.appendChild(content);
    return article;
}

function renderSection(titleText, activities, isPast) {
    const section = document.createElement("section");
    section.className = "events-section";

    const title = document.createElement("h2");
    title.textContent = titleText;
    section.appendChild(title);

    const list = document.createElement("div");
    list.className = "events-grid";

    if (activities.length === 0) {
        const empty = document.createElement("p");
        empty.className = "events-empty";
        empty.textContent = isPast
            ? "Aucun événement passé pour le moment."
            : "Aucun événement à venir pour le moment.";
        list.appendChild(empty);
    } else {
        for (const activity of activities) {
            list.appendChild(createEventCard(activity, isPast));
        }
    }

    section.appendChild(list);
    return section;
}

async function loadEvents() {
    const { data, error } = await supabase
        .from("activities")
        .select("id, title, description, date, start_time, end_time, location, image_url")
        .eq("status", "approved")
        .eq("is_event", true)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true });

    if (error) {
        console.error("Erreur récupération événements :", error);
        throw error;
    }

    return data ?? [];
}

async function init() {
    try {
        eventsContainer.textContent = "Chargement des événements...";

        const events = await loadEvents();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const past = [];
        const upcoming = [];

        for (const event of events) {
            const date = new Date(`${event.date}T00:00:00`);
            if (date < today) past.push(event);
            else upcoming.push(event);
        }

        past.reverse();

        eventsPeriod.textContent = `${events.length} événement${events.length > 1 ? "s" : ""} enregistré${events.length > 1 ? "s" : ""}`;
        eventsContainer.replaceChildren(
            renderSection("À venir", upcoming, false),
            renderSection("Événements passés", past, true)
        );
    } catch (error) {
        console.error("Impossible de charger les événements :", error);
        eventsContainer.textContent = "Impossible de charger les événements.";
    }
}

init();
