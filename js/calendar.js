import { supabase } from "./supabase.js?v=20260911-60";
import { showUserError } from "./ui-messages.js?v=20260911-60";
import { renderDescriptionWithLinks } from "./ui.js?v=20260911-60";

const calendarContainer = document.getElementById("calendar");
const calendarPeriod = document.getElementById("calendar-period");

let realtimeChannel = null;

// État persistant du calendrier. Les changements de semaine doivent
// uniquement changer la vue, jamais repartir des anciennes données.
const calendarState = {
    activities: [],
    participations: [],
    followers: [],
    currentUser: null,
    followedActivityIds: new Set(),
    selectedWeekStart: null,
    dayTags: new Map(),
    dayPresence: new Set(),
    dayPresenceMembers: new Map(),
    dayPresenceOps: new Map()
};


/*
 * Date -> YYYY-MM-DD
 */
function formatDateForDatabase(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


/*
 * YYYY-MM-DD -> date française lisible.
 */
function formatDateForDisplay(dateString, options = {}) {
    const date = new Date(`${dateString}T00:00:00`);

    return new Intl.DateTimeFormat("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        ...options
    }).format(date);
}


/*
 * Période fixe de 6 mois : du premier jour du mois actuel
 * au dernier jour du sixième mois.
 */
function getCalendarPeriod() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 6, 0);

    return { today, startDate, endDate };
}


function cloneDate(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}


function startOfWeek(date) {
    const result = cloneDate(date);
    const day = result.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    result.setDate(result.getDate() + mondayOffset);
    return result;
}


function endOfWeek(date) {
    const result = startOfWeek(date);
    result.setDate(result.getDate() + 6);
    return result;
}


function isDateWithinPeriod(date, startDate, endDate) {
    const value = cloneDate(date).getTime();
    return value >= startDate.getTime() && value <= endDate.getTime();
}


function getSaturdayTags(date) {
    if (date.getDay() !== 6) {
        return [];
    }

    const rank = Math.ceil(date.getDate() / 7);

    const types = {
        1: "Familial",
        2: "Peinture figurines / Wargames",
        3: "Gros jeu",
        4: "Jeu de rôle"
    };

    if (rank === 5) {
        return ["activité privilégié non définie"];
    }

    return types[rank] ? [`${types[rank]} privilégié`] : [];
}

function getDayTags(date) {
    const dateString = formatDateForDatabase(date);
    if (calendarState.dayTags.has(dateString)) {
        return calendarState.dayTags.get(dateString);
    }

    return getSaturdayTags(date);
}


function formatMonthTitle(date) {
    return new Intl.DateTimeFormat("fr-FR", {
        month: "long",
        year: "numeric"
    }).format(date);
}


function formatWeekRange(weekStart, weekEnd) {
    const sameMonth = weekStart.getMonth() === weekEnd.getMonth();

    if (sameMonth) {
        return `${weekStart.getDate()} → ${weekEnd.getDate()} ${new Intl.DateTimeFormat("fr-FR", {
            month: "long",
            year: "numeric"
        }).format(weekEnd)}`;
    }

    const formatter = new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });

    return `${formatter.format(weekStart)} → ${formatter.format(weekEnd)}`;
}


/*
 * Récupère l'utilisateur connecté.
 */
async function getCurrentUser() {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
        // Un visiteur non connecté n'a simplement pas de session.
        if (error.name === "AuthSessionMissingError") {
            return null;
        }

        console.error("Erreur récupération utilisateur :", error);
        return null;
    }

    return data.user;
}


/*
 * Récupère les activités approuvées sur les 6 mois affichés.
 */
async function loadActivities() {
    const { startDate, endDate } = getCalendarPeriod();

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
            max_players,
            location,
            is_event,
            image_url,
            activity_type
        `)
        .eq("status", "approved")
        .gte("date", formatDateForDatabase(startDate))
        .lte("date", formatDateForDatabase(endDate))
        .order("date", { ascending: true })
        .order("start_time", { ascending: true });

    if (error) {
        console.error("Erreur récupération activités :", error);
        throw error;
    }

    return data;
}


/*
 * Récupère toutes les participations des activités affichées.
 */
async function loadDayTags() {
    const { startDate, endDate } = getCalendarPeriod();

    const { data, error } = await supabase
        .from("calendar_day_tags")
        .select("day, tags")
        .gte("day", formatDateForDatabase(startDate))
        .lte("day", formatDateForDatabase(endDate));

    if (error) {
        console.warn("Tags de journées indisponibles :", error);
        return [];
    }

    return data ?? [];
}


async function loadDayPresence(currentUser) {
    if (!currentUser) return [];

    const { startDate, endDate } = getCalendarPeriod();

    if (currentUser.profileRole === "admin") {
        const { data, error } = await supabase.rpc("get_day_presence_admin", {
            p_start: formatDateForDatabase(startDate),
            p_end: formatDateForDatabase(endDate)
        });

        if (error) {
            console.error("Erreur récupération présences admin :", error);
            return [];
        }

        return (data ?? []).map(row => ({
            day: row.day,
            user_id: row.user_id,
            profiles: {
                pseudo: row.pseudo,
                avatar_url: row.avatar_url
            }
        }));
    }

    const { data, error } = await supabase
        .from("day_presence")
        .select("day, user_id")
        .eq("user_id", currentUser.id)
        .gte("day", formatDateForDatabase(startDate))
        .lte("day", formatDateForDatabase(endDate));

    if (error) {
        console.error("Erreur récupération ma présence :", error);
        return [];
    }

    return data ?? [];
}


async function saveDayPresenceOnServer(day, present) {
    const { data, error } = await supabase.rpc("set_day_presence", {
        p_day: day,
        p_present: present
    });

    if (error) throw error;
    return Boolean(data);
}


function applyLocalDayPresence(day, present) {
    if (present) calendarState.dayPresence.add(day);
    else calendarState.dayPresence.delete(day);

    updateOpenDayRecapPresence(day);
}


async function processDayPresence(day) {
    const operation = calendarState.dayPresenceOps.get(day);
    if (!operation || operation.running) return;

    operation.running = true;
    calendarState.dayPresenceOps.set(day, operation);

    try {
        while (operation.desired !== operation.server) {
            const desired = operation.desired;
            const confirmed = await saveDayPresenceOnServer(day, desired);
            operation.server = confirmed;

            // Un clic supplémentaire peut être arrivé pendant la requête.
            // Dans ce cas, on envoie uniquement le dernier état demandé.
            if (operation.desired === confirmed) {
                applyLocalDayPresence(day, confirmed);
            }
        }

        if (calendarState.currentUser?.profileRole === "admin") {
            await refreshDayPresenceMembers();
        }
    } catch (error) {
        console.error("Erreur présence jeux divers :", error);

        // On revient à la dernière valeur réellement connue du serveur.
        applyLocalDayPresence(day, operation.server);
        showUserError(error);
    } finally {
        operation.running = false;
        if (calendarState.dayPresenceOps.get(day) === operation) {
            calendarState.dayPresenceOps.delete(day);
        }

        const button = document.querySelector(
            `.calendar-day-presence-button[data-day="${CSS.escape(day)}"]`
        );
        if (button) {
            button.disabled = false;
            button.removeAttribute("aria-busy");
            updateOpenDayRecapPresence(day);
        }
    }
}


function setDayPresence(date, present) {
    const user = calendarState.currentUser;
    if (!user) return;

    const day = formatDateForDatabase(date);
    let operation = calendarState.dayPresenceOps.get(day);

    if (!operation) {
        operation = {
            server: calendarState.dayPresence.has(day),
            desired: calendarState.dayPresence.has(day),
            running: false
        };
        calendarState.dayPresenceOps.set(day, operation);
    }

    operation.desired = present;
    applyLocalDayPresence(day, present);

    const button = document.querySelector(
        `.calendar-day-presence-button[data-day="${CSS.escape(day)}"]`
    );
    if (button) {
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
    }

    void processDayPresence(day);
}

async function refreshDayPresenceMembers() {
    if (!calendarState.currentUser) return;

    const rows = await loadDayPresence(calendarState.currentUser);
    const members = new Map();

    for (const row of rows) {
        if (!members.has(row.day)) members.set(row.day, []);
        members.get(row.day).push(row);
    }

    calendarState.dayPresenceMembers = members;
}


function getAdminDayTotal(dateString) {
    const participations = groupParticipations(calendarState.participations);
    const activities = calendarState.activities.filter(activity => activity.date === dateString);
    const presenceMembers = calendarState.dayPresenceMembers.get(dateString) ?? [];
    const uniqueIds = new Set(presenceMembers.map(member => member.user_id));

    for (const activity of activities) {
        for (const participant of participations.get(activity.id) ?? []) {
            uniqueIds.add(participant.user_id);
        }
    }

    return uniqueIds.size;
}


function updateOpenDayRecapPresence(dateString) {
    const modal = document.querySelector(".calendar-day-recap-modal");
    if (!modal || modal.dataset.date !== dateString) return;

    const isAdmin = calendarState.currentUser?.profileRole === "admin";
    const title = modal.querySelector(".calendar-day-recap-header h2");
    if (title && isAdmin) {
        const count = title.querySelector(".calendar-day-recap-title-count");
        if (count) count.textContent = `(${getAdminDayTotal(dateString)})`;
    }

    const button = modal.querySelector(".calendar-day-presence-button");
    if (button && calendarState.currentUser) {
        const present = calendarState.dayPresence.has(dateString);
        button.textContent = present
            ? "✓ Je serai présent pour les jeux divers"
            : "Je serai présent pour les jeux divers";
        button.classList.toggle("is-active", present);
        button.setAttribute("aria-pressed", String(present));
    }

    if (isAdmin) {
        const adminTitle = modal.querySelector(".calendar-day-presence-admin h4");
        if (adminTitle) {
            const members = calendarState.dayPresenceMembers.get(dateString) ?? [];
            adminTitle.textContent = `Jeux divers (${members.length})`;
        }

        const list = modal.querySelector(".calendar-day-presence-members");
        if (list) {
            list.replaceChildren();
            const members = calendarState.dayPresenceMembers.get(dateString) ?? [];
            for (const member of members) {
                const item = document.createElement("span");
                item.className = "calendar-day-presence-member";
                item.textContent = member.profiles?.pseudo ?? "Utilisateur";
                list.appendChild(item);
            }
        }
    }
}


async function loadCurrentUserRole(currentUser) {
    if (!currentUser) return null;

    const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", currentUser.id)
        .maybeSingle();

    if (error) {
        console.warn("Rôle utilisateur indisponible :", error);
        return null;
    }

    return data?.role ?? null;
}


async function saveDayTags(date, tags) {
    if (!calendarState.currentUser || calendarState.currentUser.profileRole !== "admin") {
        return false;
    }

    const day = formatDateForDatabase(date);
    const normalized = [...new Set(
        tags
            .map(tag => tag.trim())
            .filter(Boolean)
    )];

    let error;

    if (normalized.length === 0) {
        ({ error } = await supabase
            .from("calendar_day_tags")
            .delete()
            .eq("day", day));
        calendarState.dayTags.delete(day);
    } else {
        ({ error } = await supabase
            .from("calendar_day_tags")
            .upsert({
                day,
                tags: normalized,
                updated_by: calendarState.currentUser.id,
                updated_at: new Date().toISOString()
            }, { onConflict: "day" }));

        if (!error) {
            calendarState.dayTags.set(day, normalized);
        }
    }

    if (error) {
        console.error("Erreur sauvegarde tags de journée :", error);
        showUserError(error);
        return false;
    }

    return true;
}


async function loadParticipations(activityIds) {
    if (activityIds.length === 0) return [];

    const { data, error } = await supabase
        .from("participations")
        .select(`
            activity_id,
            user_id,
            joined_at,
            profiles (pseudo, avatar_url)
        `)
        .in("activity_id", activityIds)
        .order("joined_at", { ascending: true });

    if (error) {
        console.error("Erreur récupération participants :", error);
        throw error;
    }

    return data;
}


/*
 * Récupère les personnes en file d'attente.
 */
async function loadFollowers(activityIds) {
    if (activityIds.length === 0) return [];

    const { data, error } = await supabase
        .from("followers")
        .select(`
            activity_id,
            user_id,
            followed_at,
            profiles (pseudo, avatar_url)
        `)
        .in("activity_id", activityIds)
        .order("followed_at", { ascending: true });

    if (error) {
        // La file d'attente est secondaire : elle ne doit jamais empêcher
        // le calendrier public de s'afficher.
        console.warn("File d'attente indisponible :", error);
        return [];
    }

    return data;
}


async function loadMyFollows(currentUser, activityIds) {
    if (!currentUser || activityIds.length === 0) return [];

    const { data, error } = await supabase
        .from("followers")
        .select("activity_id")
        .eq("user_id", currentUser.id)
        .in("activity_id", activityIds);

    if (error) {
        console.error("Erreur récupération suivis :", error);
        throw error;
    }

    return data;
}


function createFollowSet(follows) {
    return new Set(follows.map(follow => follow.activity_id));
}


function groupParticipations(participations) {
    const grouped = new Map();

    for (const participation of participations) {
        if (!grouped.has(participation.activity_id)) {
            grouped.set(participation.activity_id, []);
        }
        grouped.get(participation.activity_id).push(participation);
    }

    return grouped;
}


function groupFollowers(followers) {
    const grouped = new Map();

    for (const follower of followers) {
        if (!grouped.has(follower.activity_id)) {
            grouped.set(follower.activity_id, []);
        }
        grouped.get(follower.activity_id).push(follower);
    }

    return grouped;
}


function formatTime(time) {
    return time ? time.slice(0, 5) : "";
}


function createParticipantsElement(activity, participants) {
    const container = document.createElement("div");
    container.className = "calendar-participants";

    const isAdmin = calendarState.currentUser?.profileRole === "admin";

    // Les activités proposées sont sans limite de participants.
    // Les membres ne voient pas leur liste de participants.
    // Les administrateurs, eux, voient les noms comme pour les jeux préparés.
    if (activity.activity_type === "free" && !isAdmin) {
        const info = document.createElement("p");
        info.className = "calendar-free-participants-info";
        info.textContent = "Nombre de places non défini, choix des activités sur place.";
        container.appendChild(info);
        return container;
    }

    const title = document.createElement("h4");

    if (activity.activity_type === "free") {
        title.textContent = `Participants (${participants.length})`;
    } else {
        title.textContent = `Participants (${participants.length}/${activity.max_players})`;
    }

    container.appendChild(title);

    if (participants.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "Aucun participant pour le moment.";
        container.appendChild(empty);
        return container;
    }

    const list = document.createElement("div");
    list.className = "calendar-participant-tags";

    for (const participant of participants) {
        const item = document.createElement("span");
        item.className = "calendar-participant-tag";
        item.textContent = participant.profiles?.pseudo ?? "Utilisateur";
        list.appendChild(item);
    }

    container.appendChild(list);
    return container;
}


function createWaitingQueueElement(followers) {
    const container = document.createElement("div");
    container.className = "calendar-waiting-queue";

    const title = document.createElement("h4");
    title.textContent = `File d'attente (${followers.length})`;
    container.appendChild(title);

    const list = document.createElement("ol");

    for (const follower of followers) {
        const item = document.createElement("li");
        item.textContent = follower.profiles?.pseudo ?? "Utilisateur";
        list.appendChild(item);
    }

    container.appendChild(list);
    return container;
}


function createActivityActions(activity, participants, currentUser, followedActivityIds) {
    const actions = document.createElement("div");

    actions.className = "calendar-actions";

    if (!currentUser) {
        const message = document.createElement("p");
        message.textContent = "Connectez-vous pour participer.";
        actions.appendChild(message);
        return actions;
    }

    const isParticipant = participants.some(participant => participant.user_id === currentUser.id);

    if (isParticipant) {
        const button = document.createElement("button");
        button.textContent = "Quitter";
        button.addEventListener("click", async () => await leaveActivity(activity.id));
        actions.appendChild(button);
        return actions;
    }

    const isUnlimited = activity.activity_type === "free" || activity.max_players == null;
    const isFull = !isUnlimited && participants.length >= activity.max_players;

    if (isFull) {
        const isFollowing = followedActivityIds.has(activity.id);
        const button = document.createElement("button");
        button.textContent = isFollowing
            ? "🔕 Ne plus me prévenir"
            : "🔔 Me prévenir si une place se libère";
        button.addEventListener("click", async () => {
            if (isFollowing) await unfollowActivity(activity.id);
            else await followActivity(activity.id);
        });
        actions.appendChild(button);
        return actions;
    }

    const button = document.createElement("button");
    button.textContent = "Rejoindre";
    button.addEventListener("click", async () => await joinActivity(activity.id));
    actions.appendChild(button);

    return actions;
}


async function refreshActivityDisplay(activityId) {
    const activity = calendarState.activities.find(item => item.id === activityId);
    if (!activity) return;

    const [participations, followers] = await Promise.all([
        loadParticipations([activityId]),
        loadFollowers([activityId])
    ]);

    calendarState.participations = [
        ...calendarState.participations.filter(item => item.activity_id !== activityId),
        ...participations
    ];
    calendarState.followers = [
        ...calendarState.followers.filter(item => item.activity_id !== activityId),
        ...followers
    ];

    const nextElement = createActivityElement(
        activity,
        participations,
        followers,
        calendarState.currentUser,
        calendarState.followedActivityIds,
        true
    );

    const currentElement = document.getElementById(`activity-${activityId}`);
    if (currentElement) {
        currentElement.replaceWith(nextElement);
    }

    // Si le détail mobile est ouvert, actualise uniquement son contenu.
    const dialog = document.querySelector(
        ".calendar-mobile-activity-dialog[data-activity-id=\"" + activityId + "\"]"
    );
    if (dialog) {
        const oldContent = dialog.querySelector(".calendar-mobile-activity-dialog-content");
        if (oldContent) {
            const newContent = createActivityElement(
                activity,
                participations,
                followers,
                calendarState.currentUser,
                calendarState.followedActivityIds,
                false
            );
            newContent.classList.add("calendar-mobile-activity-dialog-content");
            newContent.removeAttribute("id");
            newContent.removeAttribute("role");
            newContent.removeAttribute("tabindex");
            newContent.removeAttribute("aria-label");
            oldContent.replaceWith(newContent);
        }
    }
}


async function joinActivity(activityId) {
    try {
        const { error } = await supabase.rpc("join_activity", { p_activity_id: activityId });
        if (error) {
            showUserError(error);
            return;
        }
        // Synchronisation serveur de cette seule activité.
        await refreshActivityDisplay(activityId);
    } catch (error) {
        console.error(error);
        alert("Une erreur est survenue.");
    }
}


async function leaveActivity(activityId) {
    try {
        const { error } = await supabase.rpc("leave_activity", { p_activity_id: activityId });
        if (error) {
            showUserError(error);
            return;
        }
        await refreshActivityDisplay(activityId);
    } catch (error) {
        console.error(error);
        alert("Une erreur est survenue.");
    }
}


async function followActivity(activityId) {
    try {
        const { error } = await supabase.rpc("follow_activity", { p_activity_id: activityId });
        if (error) {
            showUserError(error);
            return;
        }
        calendarState.followedActivityIds.add(activityId);
        await refreshActivityDisplay(activityId);
    } catch (error) {
        console.error(error);
        alert("Une erreur est survenue.");
    }
}


async function unfollowActivity(activityId) {
    try {
        const { error } = await supabase.rpc("unfollow_activity", { p_activity_id: activityId });
        if (error) {
            showUserError(error);
            return;
        }
        calendarState.followedActivityIds.delete(activityId);
        await refreshActivityDisplay(activityId);
    } catch (error) {
        console.error(error);
        alert("Une erreur est survenue.");
    }
}


function createActivityElement(activity, participants, followers, currentUser, followedActivityIds, compactWeek = false, showActions = true) {
    const article = document.createElement("article");
    article.className = "calendar-activity";
    article.id = `activity-${activity.id}`;

    if (activity.image_url) {
        const image = document.createElement("img");
        image.className = "calendar-activity-image";
        image.src = activity.image_url;
        image.alt = `Illustration de ${activity.title}`;
        image.loading = "lazy";
        article.appendChild(image);
    }

    const header = document.createElement("div");
    header.className = "calendar-activity-header";

    const title = document.createElement("h3");
    title.textContent = activity.title;
    header.appendChild(title);

    if (activity.is_event) {
        const badge = document.createElement("span");
        badge.className = "calendar-event-badge";
        badge.textContent = "⭐";
        badge.title = "Activité marquée comme événement important";
        badge.setAttribute("aria-label", "Événement important");
        header.appendChild(badge);
    }

    article.appendChild(header);

    const details = document.createElement("div");
    details.className = "calendar-activity-details";

    if (activity.activity_type === "free") {
        const time = document.createElement("p");
        time.textContent = `🕐 ${formatTime(activity.start_time)} → ${formatTime(activity.end_time)}`;
        details.appendChild(time);

        const unlimited = document.createElement("p");
        unlimited.className = "calendar-availability is-open";
        unlimited.textContent = "🟢 Participants illimités";
        details.appendChild(unlimited);
    } else {
        const time = document.createElement("p");
        time.textContent = `🕐 ${formatTime(activity.start_time)} → ${formatTime(activity.end_time)}`;
        details.appendChild(time);

        const players = document.createElement("p");
        players.textContent = `👥 ${activity.min_players} à ${activity.max_players} joueurs`;
        details.appendChild(players);

        const remaining = Math.max(0, activity.max_players - participants.length);
        const availability = document.createElement("p");
        availability.className = "calendar-availability";
        if (remaining === 0) {
            availability.textContent = "🔴 Complet";
            availability.classList.add("is-full");
        } else if (remaining === 1) {
            availability.textContent = "🟠 1 place restante";
            availability.classList.add("is-last-place");
        } else {
            availability.textContent = `🟢 ${remaining} places disponibles`;
            availability.classList.add("is-open");
        }
        details.appendChild(availability);

        if (followers.length > 0) {
            const queueSummary = document.createElement("p");
            queueSummary.className = "calendar-queue-summary";
            queueSummary.textContent = `👥 ${followers.length} personne${followers.length > 1 ? "s" : ""} en attente`;
            details.appendChild(queueSummary);
        }
    }

    if (activity.location) {
        const location = document.createElement("p");
        location.textContent = `📍 ${activity.location}`;
        details.appendChild(location);
    }

    article.appendChild(details);

    if (activity.description) {
        const description = document.createElement("p");
        description.className = "calendar-activity-description";
        renderDescriptionWithLinks(description, activity.description);
        article.appendChild(description);
    }

    article.appendChild(createParticipantsElement(activity, participants));

    if (followers.length > 0) {
        article.appendChild(createWaitingQueueElement(followers));
    }

    if (showActions) {
        article.appendChild(createActivityActions(activity, participants, currentUser, followedActivityIds));
    }

    if (compactWeek) {
        article.classList.add("calendar-activity-compact");
        article.setAttribute("role", "button");
        article.setAttribute("tabindex", "0");
        article.setAttribute("aria-label", `Voir les détails de ${activity.title}`);

        const openDetails = () => {
            if (!window.matchMedia("(max-width: 650px)").matches) {
                return;
            }

            if (article.dataset.polishAnimating === "true") {
                return;
            }

            openMobileActivityDetails(
                activity,
                participants,
                followers,
                currentUser,
                followedActivityIds
            );
        };

        article.addEventListener("click", openDetails);
        article.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openDetails();
            }
        });
    }

    return article;
}


function openMobileActivityDetails(activity, participants, followers, currentUser, followedActivityIds) {
    document.querySelector(".calendar-mobile-activity-modal")?.remove();

    const overlay = document.createElement("div");
    overlay.className = "calendar-mobile-activity-modal";

    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "calendar-mobile-activity-modal-backdrop";
    backdrop.setAttribute("aria-label", "Fermer les détails");

    const dialog = document.createElement("div");
    dialog.className = "calendar-mobile-activity-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", `Détails de ${activity.title}`);
    dialog.dataset.activityId = activity.id;

    const header = document.createElement("div");
    header.className = "calendar-mobile-activity-dialog-header";

    const heading = document.createElement("h2");
    heading.textContent = activity.title;
    header.appendChild(heading);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "calendar-mobile-activity-close";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "Fermer");
    header.appendChild(closeButton);
    dialog.appendChild(header);

    const content = createActivityElement(
        activity,
        participants,
        followers,
        currentUser,
        followedActivityIds,
        false
    );
    content.classList.add("calendar-mobile-activity-dialog-content");
    content.removeAttribute("id");
    content.removeAttribute("role");
    content.removeAttribute("tabindex");
    content.removeAttribute("aria-label");
    dialog.appendChild(content);

    overlay.append(backdrop, dialog);
    document.body.appendChild(overlay);
    document.body.classList.add("calendar-mobile-activity-open");

    const close = () => {
        overlay.remove();
        document.body.classList.remove("calendar-mobile-activity-open");
        document.removeEventListener("keydown", onKeyDown);
    };

    const onKeyDown = event => {
        if (event.key === "Escape") close();
    };

    backdrop.addEventListener("click", close);
    closeButton.addEventListener("click", close);
    document.addEventListener("keydown", onKeyDown);


    requestAnimationFrame(() => closeButton.focus());
}


function groupActivitiesByDate(activities) {
    const grouped = new Map();

    for (const activity of activities) {
        if (!grouped.has(activity.date)) grouped.set(activity.date, []);
        grouped.get(activity.date).push(activity);
    }

    return grouped;
}


function openDayRecap(date) {
    document.querySelector(".calendar-day-recap-modal")?.remove();

    const dateString = formatDateForDatabase(date);
    const activities = calendarState.activities.filter(activity => activity.date === dateString);
    const participations = groupParticipations(calendarState.participations);
    const followers = groupFollowers(calendarState.followers);
    const isAdmin = calendarState.currentUser?.profileRole === "admin";
    const dayPresenceMembers = calendarState.dayPresenceMembers.get(dateString) ?? [];

    // Pour un admin, le total correspond aux personnes uniques présentes
    // aux jeux divers ou inscrites à une activité préparée ce jour-là.
    const uniquePresentIds = new Set(dayPresenceMembers.map(member => member.user_id));
    for (const activity of activities) {
        for (const participant of participations.get(activity.id) ?? []) {
            uniquePresentIds.add(participant.user_id);
        }
    }

    const overlay = document.createElement("div");
    overlay.className = "calendar-day-recap-modal";
    overlay.dataset.date = dateString;

    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "calendar-day-recap-backdrop";
    backdrop.setAttribute("aria-label", "Fermer le récapitulatif");

    const dialog = document.createElement("div");
    dialog.className = "calendar-day-recap-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", `Activités du ${formatDateForDisplay(dateString)}`);

    const header = document.createElement("div");
    header.className = "calendar-day-recap-header";

    const title = document.createElement("h2");
    title.className = "calendar-day-recap-title";

    const titleDate = document.createElement("span");
    titleDate.className = "calendar-day-recap-title-date";
    titleDate.textContent = formatDateForDisplay(dateString);
    title.appendChild(titleDate);

    if (isAdmin) {
        const titleCount = document.createElement("span");
        titleCount.className = "calendar-day-recap-title-count";
        titleCount.textContent = `(${uniquePresentIds.size})`;
        title.appendChild(titleCount);
    }

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "calendar-day-recap-close";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "Fermer");
    header.append(title, closeButton);
    dialog.appendChild(header);

    const tags = getDayTags(date);
    const tagSection = document.createElement("div");
    tagSection.className = "calendar-day-tags-section";

    const tagList = document.createElement("div");
    tagList.className = "calendar-day-tags";

    const renderTags = values => {
        tagList.replaceChildren();
        if (values.length === 0) {
            const empty = document.createElement("span");
            empty.className = "calendar-day-tag-empty";
            empty.textContent = "Aucun tag";
            tagList.appendChild(empty);
            return;
        }

        for (const value of values) {
            const tag = document.createElement("span");
            tag.className = "calendar-day-tag";
            tag.textContent = value;
            tagList.appendChild(tag);
        }
    };

    renderTags(tags);
    tagSection.appendChild(tagList);

    if (calendarState.currentUser?.profileRole === "admin") {
        const editor = document.createElement("div");
        editor.className = "calendar-day-tags-editor";

        const input = document.createElement("input");
        input.type = "text";
        input.value = tags.join(", ");
        input.placeholder = "Tags séparés par des virgules";
        input.setAttribute("aria-label", "Tags de la journée");

        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.textContent = "Enregistrer les tags";

        saveButton.addEventListener("click", async () => {
            saveButton.disabled = true;
            const values = input.value.split(",");
            const saved = await saveDayTags(date, values);
            if (saved) {
                const nextTags = getDayTags(date);
                renderTags(nextTags);
                input.value = nextTags.join(", ");
                saveButton.textContent = "Enregistré";
                setTimeout(() => { saveButton.textContent = "Enregistrer les tags"; }, 1200);
            }
            saveButton.disabled = false;
        });

        editor.append(input, saveButton);
        tagSection.appendChild(editor);
    }

    dialog.appendChild(tagSection);

    const presenceSection = document.createElement("section");
    presenceSection.className = "calendar-day-presence-section";

    const presenceTitle = document.createElement("h3");
    presenceTitle.textContent = "Jeux divers";
    presenceSection.appendChild(presenceTitle);

    if (calendarState.currentUser) {
        const dayKey = dateString;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "calendar-day-presence-button";
        button.dataset.day = dayKey;
        const updatePresenceButton = () => {
            const present = calendarState.dayPresence.has(dayKey);
            button.textContent = present
                ? "✓ Je serai présent pour les jeux divers"
                : "Je serai présent pour les jeux divers";
            button.classList.toggle("is-active", present);
            button.setAttribute("aria-pressed", String(present));
        };
        updatePresenceButton();
        button.addEventListener("click", event => {
            event.preventDefault();

            const operation = calendarState.dayPresenceOps.get(dayKey);
            const currentDesired = operation?.desired ?? calendarState.dayPresence.has(dayKey);
            const nextPresent = !currentDesired;
            setDayPresence(date, nextPresent);
        });
        presenceSection.appendChild(button);
    } else {
        const message = document.createElement("p");
        message.className = "calendar-day-presence-login";
        message.textContent = "Connectez-vous pour indiquer votre présence aux jeux divers.";
        presenceSection.appendChild(message);
    }

    if (isAdmin) {
        const adminPresence = document.createElement("div");
        adminPresence.className = "calendar-day-presence-admin";

        const adminTitle = document.createElement("h4");
        adminTitle.textContent = `Jeux divers (${dayPresenceMembers.length})`;
        adminPresence.appendChild(adminTitle);

        if (dayPresenceMembers.length === 0) {
            const empty = document.createElement("p");
            empty.className = "calendar-day-presence-empty";
            empty.textContent = "Aucune personne inscrite pour le moment.";
            adminPresence.appendChild(empty);
        } else {
            const list = document.createElement("div");
            list.className = "calendar-day-presence-members";
            for (const member of dayPresenceMembers) {
                const item = document.createElement("span");
                item.className = "calendar-day-presence-member";
                item.textContent = member.profiles?.pseudo ?? "Utilisateur";
                list.appendChild(item);
            }
            adminPresence.appendChild(list);
        }

        presenceSection.appendChild(adminPresence);
    }

    dialog.appendChild(presenceSection);

    const grid = document.createElement("div");
    grid.className = "calendar-day-recap-grid";

    if (activities.length === 0) {
        const empty = document.createElement("p");
        empty.className = "calendar-day-recap-empty";
        empty.textContent = "Aucune activité prévue ce jour.";
        grid.appendChild(empty);
    } else {
        const compact = window.matchMedia("(max-width: 650px)").matches;
        for (const activity of activities) {
            const card = createActivityElement(
                activity,
                participations.get(activity.id) ?? [],
                followers.get(activity.id) ?? [],
                calendarState.currentUser,
                calendarState.followedActivityIds,
                compact,
                false
            );
            // Les cartes du récapitulatif ne doivent pas entrer en collision
            // avec les IDs des cartes de la vue semaine.
            card.removeAttribute("id");
            grid.appendChild(card);
        }
    }

    dialog.appendChild(grid);
    overlay.append(backdrop, dialog);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    backdrop.addEventListener("click", close);
    closeButton.addEventListener("click", close);

    const onKeyDown = event => {
        if (event.key === "Escape") {
            close();
            document.removeEventListener("keydown", onKeyDown);
        }
    };
    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => closeButton.focus());
}


function createDayActivityList(date, groupedActivities, groupedParticipations, groupedFollowers, currentUser, followedActivityIds, compactWeek = false) {
    const dateString = formatDateForDatabase(date);
    const activitiesForDay = groupedActivities.get(dateString) ?? [];

    const dayElement = document.createElement("section");
    dayElement.className = "calendar-day";

    const dayTags = getDayTags(date);
    if (date.getDay() === 6) {
        dayElement.classList.add("calendar-saturday");
    }

    const heading = document.createElement("button");
    heading.type = "button";
    heading.className = "calendar-day-heading-button";
    heading.type = "button";
    heading.setAttribute("aria-label", `Voir les activités du ${formatDateForDisplay(dateString)}`);

    const weekday = document.createElement("span");
    weekday.className = "calendar-day-weekday";
    weekday.textContent = new Intl.DateTimeFormat("fr-FR", {
        weekday: "long"
    }).format(date);
    weekday.dataset.short = new Intl.DateTimeFormat("fr-FR", {
        weekday: "short"
    }).format(date).replace(".", "");
    weekday.dataset.mobile = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"][date.getDay()];

    const dateLabel = document.createElement("span");
    dateLabel.className = "calendar-day-date";
    dateLabel.textContent = new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "long"
    }).format(date);
    dateLabel.dataset.short = new Intl.DateTimeFormat("fr-FR", {
        day: "numeric"
    }).format(date);
    dateLabel.dataset.mobile = String(date.getDate());

    heading.append(weekday, dateLabel);
    heading.addEventListener("click", () => openDayRecap(date));
    dayElement.appendChild(heading);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date.getTime() === today.getTime()) {
        dayElement.classList.add("calendar-today");
    }

    if (dayTags.length > 0) {
        const tagList = document.createElement("div");
        tagList.className = "calendar-day-tags calendar-day-tags-inline";

        for (const value of dayTags) {
            const tag = document.createElement("span");
            tag.className = "calendar-day-tag";
            tag.textContent = value;
            tagList.appendChild(tag);
        }

        // Les tags appartiennent visuellement a l'en-tete du jour.
        // On les place donc dans le bouton de date plutot que dans le contenu
        // de la colonne, afin qu'ils restent clairement rattaches au jour.
        heading.appendChild(tagList);
    }

    if (activitiesForDay.length === 0) {
        const empty = document.createElement("p");
        empty.className = "calendar-day-empty";
        empty.textContent = "Aucune activité prévue.";
        dayElement.appendChild(empty);
    }

    for (const activity of activitiesForDay) {
        const participants = groupedParticipations.get(activity.id) ?? [];
        const followers = groupedFollowers.get(activity.id) ?? [];
        dayElement.appendChild(createActivityElement(
            activity,
            participants,
            followers,
            currentUser,
            followedActivityIds,
            compactWeek
        ));
    }

    return dayElement;
}


function renderLargeWeek(weekStart, activities, participations, followers, currentUser, followedActivityIds) {
    const { startDate, endDate } = getCalendarPeriod();
    const weekContainer = document.createElement("section");
    weekContainer.className = "calendar-large-week";

    const weekTitle = document.createElement("div");
    weekTitle.className = "calendar-large-week-title";

    const title = document.createElement("h2");
    title.textContent = "Semaine";
    weekTitle.appendChild(title);

    const range = document.createElement("p");
    range.textContent = formatWeekRange(weekStart, endOfWeek(weekStart));
    weekTitle.appendChild(range);
    weekContainer.appendChild(weekTitle);

    const days = document.createElement("div");
    days.className = "calendar-large-week-days";

    // La semaine reste toujours composée de 7 colonnes.
    // On fixe la grille directement sur le conteneur pour éviter qu'une
    // règle responsive héritée ne la fasse repasser en 2 ou 1 colonne.
    days.style.display = "grid";
    days.style.gridTemplateColumns = "repeat(7, minmax(0, 1fr))";
    days.style.gridAutoFlow = "row";

    const groupedActivities = groupActivitiesByDate(activities);
    const groupedParticipations = groupParticipations(participations);
    const groupedFollowers = groupFollowers(followers);

    for (let offset = 0; offset < 7; offset += 1) {
        const date = cloneDate(weekStart);
        date.setDate(date.getDate() + offset);

        if (!isDateWithinPeriod(date, startDate, endDate)) {
            continue;
        }

        const dayElement = createDayActivityList(
            date,
            groupedActivities,
            groupedParticipations,
            groupedFollowers,
            currentUser,
            followedActivityIds,
            true
        );

        // Autorise la carte à se réduire dans sa colonne mobile.
        dayElement.style.minWidth = "0";
        dayElement.style.width = "auto";
        dayElement.style.maxWidth = "none";

        days.appendChild(dayElement);
    }

    weekContainer.appendChild(days);

    // La semaine garde sa grille 7 colonnes.
    // Sur mobile, le contenu de chaque activité est volontairement compact :
    // image + titre, avec les détails accessibles au clic.
    return weekContainer;
}


function renderMiniMonth(monthDate, activities, selectedWeekStart, onSelectWeek) {
    const { startDate, endDate } = getCalendarPeriod();
    const month = document.createElement("section");
    month.className = "calendar-mini-month";

    const title = document.createElement("h3");
    title.textContent = formatMonthTitle(monthDate);
    month.appendChild(title);

    const weekdays = document.createElement("div");
    weekdays.className = "calendar-mini-weekdays";
    ["L", "M", "M", "J", "V", "S", "D"].forEach(label => {
        const cell = document.createElement("span");
        cell.textContent = label;
        weekdays.appendChild(cell);
    });
    month.appendChild(weekdays);

    const grid = document.createElement("div");
    grid.className = "calendar-mini-grid";

    const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    const mondayIndex = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

    for (let blank = 0; blank < mondayIndex; blank += 1) {
        const empty = document.createElement("span");
        empty.className = "calendar-mini-empty";
        grid.appendChild(empty);
    }

    const activityDates = new Set(
        activities
            .filter(activity => {
                const date = new Date(`${activity.date}T00:00:00`);
                return date.getMonth() === monthDate.getMonth()
                    && date.getFullYear() === monthDate.getFullYear();
            })
            .map(activity => activity.date)
    );

    for (let day = 1; day <= lastDay.getDate(); day += 1) {
        const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "calendar-mini-day";
        button.textContent = String(day);

        const dateString = formatDateForDatabase(date);
        if (activityDates.has(dateString)) {
            button.classList.add("has-activity");
            button.title = "Activité prévue";

            const dot = document.createElement("span");
            dot.className = "calendar-mini-activity-dot";
            dot.setAttribute("aria-hidden", "true");
            button.appendChild(dot);
        }

        const selectedWeekEnd = endOfWeek(selectedWeekStart);
        if (date.getTime() >= selectedWeekStart.getTime() && date.getTime() <= selectedWeekEnd.getTime()) {
            button.classList.add("is-selected-week");
        }

        const saturdayTags = getDayTags(date);
        if (saturdayTags.length > 0) {
            button.classList.add("is-special-saturday");
            button.title = saturdayTags.join(" · ");
        }

        if (dateString === formatDateForDatabase(new Date())) {
            button.classList.add("is-today");
        }

        if (isDateWithinPeriod(date, startDate, endDate)) {
            button.addEventListener("click", () => onSelectWeek(startOfWeek(date)));
        } else {
            button.disabled = true;
        }

        grid.appendChild(button);
    }

    month.appendChild(grid);
    return month;
}


function renderCalendar(activities, participations, followers, currentUser, followedActivityIds, selectedWeekStart = null, transitionDirection = null) {
    const { today, startDate, endDate } = getCalendarPeriod();
    calendarContainer.replaceChildren();

    calendarPeriod.textContent = `Du ${startDate.toLocaleDateString("fr-FR")} au ${endDate.toLocaleDateString("fr-FR")} · 6 mois`;

    const initialWeek = selectedWeekStart ?? startOfWeek(today);
    const boundedWeek = isDateWithinPeriod(initialWeek, startDate, endDate)
        ? cloneDate(initialWeek)
        : startOfWeek(startDate);

    calendarState.selectedWeekStart = cloneDate(boundedWeek);

    const largeWeek = renderLargeWeek(
        boundedWeek,
        activities,
        participations,
        followers,
        currentUser,
        followedActivityIds
    );

    if (transitionDirection === "next") {
        largeWeek.classList.add("calendar-week-slide-from-right");
    } else if (transitionDirection === "previous") {
        largeWeek.classList.add("calendar-week-slide-from-left");
    }

    calendarContainer.appendChild(largeWeek);

    calendarContainer.classList.remove("polish-calendar-entering");
    void calendarContainer.offsetWidth;
    calendarContainer.classList.add("polish-calendar-entering");
    window.setTimeout(() => {
        calendarContainer.classList.remove("polish-calendar-entering");
    }, 500);

    const navigation = document.createElement("div");
    navigation.className = "calendar-week-navigation";

    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "← Semaine précédente";
    previous.disabled = startOfWeek(boundedWeek).getTime() <= startOfWeek(startDate).getTime();
    previous.addEventListener("click", () => {
        const week = cloneDate(boundedWeek);
        week.setDate(week.getDate() - 7);
        renderCalendar(calendarState.activities, calendarState.participations, calendarState.followers, calendarState.currentUser, calendarState.followedActivityIds, week, "previous");
        scrollToActivityFromUrl();
    });

    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Semaine suivante →";
    next.disabled = endOfWeek(boundedWeek).getTime() >= endDate.getTime();
    next.addEventListener("click", () => {
        const week = cloneDate(boundedWeek);
        week.setDate(week.getDate() + 7);
        renderCalendar(calendarState.activities, calendarState.participations, calendarState.followers, calendarState.currentUser, calendarState.followedActivityIds, week, "next");
        scrollToActivityFromUrl();
    });

    const todayButton = document.createElement("button");
    todayButton.type = "button";
    todayButton.className = "calendar-today-button";
    todayButton.textContent = "Aujourd'hui";
    todayButton.addEventListener("click", () => {
        renderCalendar(calendarState.activities, calendarState.participations, calendarState.followers, calendarState.currentUser, calendarState.followedActivityIds, startOfWeek(today));
        window.scrollTo({ top: 0, behavior: "smooth" });
    });

    navigation.append(todayButton, previous, next);
    calendarContainer.appendChild(navigation);

    const miniTitle = document.createElement("h2");
    miniTitle.className = "calendar-overview-title";
    miniTitle.textContent = "Vue d'ensemble";
    calendarContainer.appendChild(miniTitle);

    const miniMonths = document.createElement("div");
    miniMonths.className = "calendar-mini-months";

    for (let offset = 0; offset < 6; offset += 1) {
        const monthDate = new Date(startDate.getFullYear(), startDate.getMonth() + offset, 1);
        miniMonths.appendChild(renderMiniMonth(
            monthDate,
            activities,
            boundedWeek,
            week => {
                renderCalendar(calendarState.activities, calendarState.participations, calendarState.followers, calendarState.currentUser, calendarState.followedActivityIds, week);
                window.scrollTo({ top: 0, behavior: "smooth" });
            }
        ));
    }

    calendarContainer.appendChild(miniMonths);
}


/*
 * Si l'URL contient ?activity=...
 * fait défiler jusqu'à l'activité correspondante.
 */
function scrollToActivityFromUrl() {
    const params =
        new URLSearchParams(
            window.location.search
        );

    const activityId =
        params.get("activity");

    if (!activityId) {
        return;
    }

    const activityElement =
        document.getElementById(
            `activity-${activityId}`
        );

    if (!activityElement) {
        console.warn(
            "Activité demandée introuvable :",
            activityId
        );

        return;
    }

    activityElement.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

    activityElement.classList.add(
        "calendar-activity-highlight"
    );

    setTimeout(() => {
        activityElement.classList.remove(
            "calendar-activity-highlight"
        );
    }, 3000);
}


/*
 * Initialise / recharge le calendrier.
 */
async function init() {
    try {
        calendarContainer.textContent =
            "Chargement du calendrier...";


        const currentUser =
            await getCurrentUser();

        if (currentUser) {
            currentUser.profileRole = await loadCurrentUserRole(currentUser);
        }

        const activities =
            await loadActivities();


        const activityIds =
            activities.map(
                activity => activity.id
            );


        const dayTags =
            await loadDayTags();

        const dayPresence =
            await loadDayPresence(currentUser);

        const participations =
            await loadParticipations(
                activityIds
            );


        const followers =
            await loadFollowers(
                activityIds
            );


        const follows =
            await loadMyFollows(
                currentUser,
                activityIds
            );


        const followedActivityIds =
            createFollowSet(follows);


        calendarState.activities = activities ?? [];
        calendarState.dayTags = new Map(
            dayTags.map(row => [row.day, row.tags ?? []])
        );
        calendarState.dayPresence = new Set(
            dayPresence
                .filter(row => row.user_id === currentUser?.id)
                .map(row => row.day)
        );

        calendarState.dayPresenceMembers = new Map();
        for (const row of dayPresence) {
            if (!calendarState.dayPresenceMembers.has(row.day)) {
                calendarState.dayPresenceMembers.set(row.day, []);
            }
            calendarState.dayPresenceMembers.get(row.day).push(row);
        }
        calendarState.participations = participations ?? [];
        calendarState.followers = followers ?? [];
        calendarState.currentUser = currentUser;
        calendarState.followedActivityIds = followedActivityIds;

        renderCalendar(
            calendarState.activities,
            calendarState.participations,
            calendarState.followers,
            calendarState.currentUser,
            calendarState.followedActivityIds,
            calendarState.selectedWeekStart
        );
        
        scrollToActivityFromUrl();

    } catch (error) {
        console.error(
            "Impossible de charger le calendrier :",
            error
        );

        calendarContainer.textContent =
            "Impossible de charger le calendrier.";
    }
}


/*
 * Abonnement Realtime aux changements
 * de participants.
 */
function subscribeToParticipationChanges() {
    if (realtimeChannel) {
        return;
    }


    realtimeChannel =
        supabase
            .channel(
                "calendar-participations"
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "participations"
                },
                async (payload) => {
                    console.log(
                        "Changement de participation :",
                        payload
                    );

                    const activityId = payload.new?.activity_id ?? payload.old?.activity_id;
                    if (activityId) {
                        await refreshActivityDisplay(activityId);
                    }
                }
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "day_presence"
                },
                async (payload) => {
                    const day = payload.new?.day ?? payload.old?.day;
                    const userId = payload.new?.user_id ?? payload.old?.user_id;
                    if (!day || !calendarState.currentUser || !userId) return;

                    if (userId === calendarState.currentUser.id) {
                        if (payload.eventType === "DELETE") calendarState.dayPresence.delete(day);
                        else calendarState.dayPresence.add(day);
                    }

                    if (calendarState.currentUser.profileRole === "admin") {
                        // Recharger les présences pour obtenir les noms et le total exacts.
                        await refreshDayPresenceMembers();
                    }

                    // Ne jamais reconstruire la modale : cela cassait le bouton sur mobile
                    // et faisait disparaître l'état local juste après un clic.
                    updateOpenDayRecapPresence(day);
                }
            )
            .subscribe(
                (status) => {
                    console.log(
                        "Statut Realtime :",
                        status
                    );
                }
            );
}


/*
 * Initialisation.
 */
init();
subscribeToParticipationChanges();
