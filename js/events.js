import { supabase } from "./supabase.js?v=20260909-27";

const eventsContainer = document.getElementById("events-list");
const eventsPeriod = document.getElementById("events-period");

function formatDate(dateString) {
    return new Intl.DateTimeFormat("fr-FR", {
        weekday: "long", day: "numeric", month: "long", year: "numeric"
    }).format(new Date(`${dateString}T00:00:00`));
}

function formatTime(time) { return time ? time.slice(0, 5) : ""; }

function createEventCard(activity, isPast) {
    const article = document.createElement("article");
    article.className = `event-card${isPast ? " event-card-past" : ""}`;
    article.tabIndex = 0;
    article.setAttribute("role", "button");
    article.setAttribute("aria-label", `Voir les détails de ${activity.title}`);

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

    article.appendChild(content);

    const open = () => openEventModal(activity, isPast);
    article.addEventListener("click", open);
    article.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            open();
        }
    });
    return article;
}

let modal;
function ensureModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "events-modal";
    modal.hidden = true;
    modal.innerHTML = `
        <button class="events-modal-backdrop" type="button" aria-label="Fermer"></button>
        <section class="events-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="events-modal-title">
            <div class="events-modal-media"></div>
            <div class="events-modal-content">
                <div class="events-modal-header">
                    <h2 id="events-modal-title"></h2>
                    <button class="events-modal-close" type="button" aria-label="Fermer">×</button>
                </div>
                <div class="events-modal-details"></div>
                <p class="events-modal-description"></p>
                <a class="events-modal-link" href="#">Voir dans le calendrier</a>
            </div>
        </section>`;
    document.body.appendChild(modal);

    const close = () => closeEventModal();
    modal.querySelector(".events-modal-backdrop").addEventListener("click", close);
    modal.querySelector(".events-modal-close").addEventListener("click", close);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && modal && !modal.hidden) close();
    });
    return modal;
}

function openEventModal(activity, isPast) {
    const root = ensureModal();
    const media = root.querySelector(".events-modal-media");
    const title = root.querySelector("#events-modal-title");
    const details = root.querySelector(".events-modal-details");
    const description = root.querySelector(".events-modal-description");
    const link = root.querySelector(".events-modal-link");

    media.replaceChildren();
    if (activity.image_url) {
        const image = document.createElement("img");
        image.className = "events-modal-image";
        image.src = activity.image_url;
        image.alt = `Illustration de ${activity.title}`;
        media.appendChild(image);
    }

    title.textContent = activity.title;
    details.replaceChildren();
    const rows = [
        `📅 ${formatDate(activity.date)}`,
        activity.start_time || activity.end_time ? `🕐 ${formatTime(activity.start_time)} → ${formatTime(activity.end_time)}` : "",
        activity.location ? `📍 ${activity.location}` : "",
        isPast ? "Événement passé" : "Événement à venir"
    ].filter(Boolean);
    for (const row of rows) {
        const p = document.createElement("p");
        p.textContent = row;
        details.appendChild(p);
    }
    description.textContent = activity.description || "Aucune description.";
    link.href = `calendar.html?activity=${encodeURIComponent(activity.id)}`;

    root.hidden = false;
    document.body.classList.add("events-modal-open");
    root.querySelector(".events-modal-close").focus();
}

function closeEventModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("events-modal-open");
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
        empty.textContent = isPast ? "Aucun événement passé pour le moment." : "Aucun événement à venir pour le moment.";
        list.appendChild(empty);
    } else {
        for (const activity of activities) list.appendChild(createEventCard(activity, isPast));
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
    if (error) throw error;
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
            if (date < today) past.push(event); else upcoming.push(event);
        }
        past.reverse();
        eventsPeriod.textContent = `${events.length} événement${events.length > 1 ? "s" : ""} enregistré${events.length > 1 ? "s" : ""}`;
        eventsContainer.replaceChildren(renderSection("À venir", upcoming, false), renderSection("Événements passés", past, true));
    } catch (error) {
        console.error("Impossible de charger les événements :", error);
        eventsContainer.textContent = "Impossible de charger les événements.";
    }
}

init();
