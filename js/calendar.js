import { supabase } from "./supabase.js";
import { humanizeError, showToast } from "./ui.js";

const calendarContainer = document.getElementById("calendar");
const calendarPeriod = document.getElementById("calendar-period");

let realtimeChannel = null;


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


function getSaturdayType(date) {
    if (date.getDay() !== 6) {
        return null;
    }

    const rank = Math.ceil(date.getDate() / 7);

    const types = {
        1: "Familial",
        2: "Peinture figurines / Wargames",
        3: "Gros jeu",
        4: "Jeu de rôle"
    };

    return types[rank] ?? null;
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
            image_url
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
        console.error("Erreur récupération file d'attente :", error);
        throw error;
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




async function joinActivity(activityId) {
    try {
        const { error } = await supabase.rpc("join_activity", { p_activity_id: activityId });
        if (error) {
            showToast(humanizeError(error, "Impossible de rejoindre la partie."));
            return;
        }
        await init();
    } catch (error) {
        console.error(error);
        showToast(humanizeError(error));
    }
}


async function leaveActivity(activityId) {
    try {
        const { error } = await supabase.rpc("leave_activity", { p_activity_id: activityId });
        if (error) {
            showToast(humanizeError(error, "Impossible de quitter la partie."));
            return;
        }
        await init();
    } catch (error) {
        console.error(error);
        showToast(humanizeError(error));
    }
}


async function followActivity(activityId) {
    try {
        const { error } = await supabase.rpc("follow_activity", { p_activity_id: activityId });
        if (error) {
            showToast(humanizeError(error, "Impossible d’activer le suivi."));
            return;
        }
        await init();
    } catch (error) {
        console.error(error);
        showToast(humanizeError(error));
    }
}


async function unfollowActivity(activityId) {
    try {
        const { error } = await supabase.rpc("unfollow_activity", { p_activity_id: activityId });
        if (error) {
            showToast(humanizeError(error, "Impossible de désactiver le suivi."));
            return;
        }
        await init();
    } catch (error) {
        console.error(error);
        showToast(humanizeError(error));
    }
}


function getAvailability(activity, participantCount, followerCount) {
    const remaining = Math.max(activity.max_players - participantCount, 0);
    let label = `🟢 ${remaining} places disponibles`;
    let className = "availability-open";

    if (remaining === 0) {
        label = "🔴 Complet";
        className = "availability-full";
    } else if (remaining === 1) {
        label = "🟠 1 place restante";
        className = "availability-last";
    }

    return { label, className, queueLabel: followerCount > 0 ? `👥 ${followerCount} ${followerCount === 1 ? "personne" : "personnes"} en attente` : null };
}

function createAvailabilityElement(activity, participantCount, followerCount) {
    const availability = getAvailability(activity, participantCount, followerCount);
    const container = document.createElement("div");
    container.className = "calendar-availability";

    const status = document.createElement("span");
    status.className = `calendar-availability-status ${availability.className}`;
    status.textContent = availability.label;
    container.appendChild(status);

    if (availability.queueLabel) {
        const queue = document.createElement("span");
        queue.className = "calendar-availability-queue";
        queue.textContent = availability.queueLabel;
        container.appendChild(queue);
    }

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
        button.addEventListener("click", async event => {
            event.stopPropagation();
            await leaveActivity(activity.id);
        });
        actions.appendChild(button);
        return actions;
    }

    const isFull = participants.length >= activity.max_players;

    if (isFull) {
        const isFollowing = followedActivityIds.has(activity.id);
        const button = document.createElement("button");
        button.textContent = isFollowing ? "🔕 Ne plus me prévenir" : "🔔 Me prévenir si une place se libère";
        button.addEventListener("click", async event => {
            event.stopPropagation();
            if (isFollowing) await unfollowActivity(activity.id);
            else await followActivity(activity.id);
        });
        actions.appendChild(button);
        return actions;
    }

    const button = document.createElement("button");
    button.textContent = "Rejoindre";
    button.addEventListener("click", async event => {
        event.stopPropagation();
        await joinActivity(activity.id);
    });
    actions.appendChild(button);
    return actions;
}

function createParticipantsElement(activity, participants) {
    const container = document.createElement("div");
    container.className = "calendar-participants";
    const title = document.createElement("h4");
    title.textContent = `Participants (${participants.length}/${activity.max_players})`;
    container.appendChild(title);
    if (participants.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "Aucun participant pour le moment.";
        container.appendChild(empty);
        return container;
    }
    const list = document.createElement("ul");
    for (const participant of participants) {
        const item = document.createElement("li");
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

function createActivityElement(activity, participants, followers, currentUser, followedActivityIds) {
    const article = document.createElement("article");
    article.className = "calendar-activity calendar-activity-compact";
    article.id = `activity-${activity.id}`;
    article.tabIndex = 0;
    article.setAttribute("role", "button");
    article.setAttribute("aria-label", `Voir les détails de ${activity.title}`);

    const header = document.createElement("div");
    header.className = "calendar-activity-header";
    const title = document.createElement("h3");
    title.textContent = activity.title;
    header.appendChild(title);
    if (activity.is_event) {
        const badge = document.createElement("span");
        badge.className = "calendar-event-badge";
        badge.textContent = "Événement";
        header.appendChild(badge);
    }
    article.appendChild(header);

    const details = document.createElement("div");
    details.className = "calendar-activity-details calendar-activity-quick-details";
    const time = document.createElement("p");
    time.textContent = `🕐 ${formatTime(activity.start_time)} → ${formatTime(activity.end_time)}`;
    details.appendChild(time);
    if (activity.location) {
        const location = document.createElement("p");
        location.textContent = `📍 ${activity.location}`;
        details.appendChild(location);
    }
    article.appendChild(details);
    article.appendChild(createAvailabilityElement(activity, participants.length, followers.length));

    const hint = document.createElement("span");
    hint.className = "calendar-activity-details-hint";
    hint.textContent = "Voir les détails →";
    article.appendChild(hint);

    const open = event => {
        if (event.target.closest("button")) return;
        openActivityModal(activity, participants, followers, currentUser, followedActivityIds);
    };
    article.addEventListener("click", open);
    article.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            open(event);
        }
    });
    return article;
}

function openActivityModal(activity, participants, followers, currentUser, followedActivityIds) {
    closeActivityModal();

    const overlay = document.createElement("div");
    overlay.className = "activity-modal-overlay";
    overlay.addEventListener("click", event => {
        if (event.target === overlay) closeActivityModal();
    });

    const dialog = document.createElement("section");
    dialog.className = "activity-modal";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "activity-modal-title");

    const close = document.createElement("button");
    close.type = "button";
    close.className = "activity-modal-close";
    close.textContent = "×";
    close.setAttribute("aria-label", "Fermer");
    close.addEventListener("click", closeActivityModal);
    dialog.appendChild(close);

    if (activity.image_url) {
        const image = document.createElement("img");
        image.className = "activity-modal-image";
        image.src = activity.image_url;
        image.alt = `Illustration de ${activity.title}`;
        dialog.appendChild(image);
    }

    const content = document.createElement("div");
    content.className = "activity-modal-content";
    const title = document.createElement("h2");
    title.id = "activity-modal-title";
    title.textContent = activity.title;
    content.appendChild(title);

    if (activity.is_event) {
        const badge = document.createElement("span");
        badge.className = "calendar-event-badge";
        badge.textContent = "Événement";
        content.appendChild(badge);
    }

    const meta = document.createElement("div");
    meta.className = "activity-modal-meta";
    meta.appendChild(document.createTextNode(`📅 ${formatDateForDisplay(activity.date)}`));
    meta.appendChild(document.createTextNode(`🕐 ${formatTime(activity.start_time)} → ${formatTime(activity.end_time)}`));
    meta.appendChild(document.createTextNode(`👥 ${activity.min_players} à ${activity.max_players} joueurs`));
    if (activity.location) meta.appendChild(document.createTextNode(`📍 ${activity.location}`));
    content.appendChild(meta);

    content.appendChild(createAvailabilityElement(activity, participants.length, followers.length));

    if (activity.description) {
        const description = document.createElement("p");
        description.className = "activity-modal-description";
        description.textContent = activity.description;
        content.appendChild(description);
    }
    content.appendChild(createParticipantsElement(activity, participants));
    if (followers.length > 0) content.appendChild(createWaitingQueueElement(followers));
    content.appendChild(createActivityActions(activity, participants, currentUser, followedActivityIds));
    dialog.appendChild(content);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    document.body.classList.add("modal-open");
    close.focus();
}

function closeActivityModal() {
    document.querySelector(".activity-modal-overlay")?.remove();
    document.body.classList.remove("modal-open");
}


function groupActivitiesByDate(activities) {
    const grouped = new Map();

    for (const activity of activities) {
        if (!grouped.has(activity.date)) grouped.set(activity.date, []);
        grouped.get(activity.date).push(activity);
    }

    return grouped;
}


function createDayActivityList(date, groupedActivities, groupedParticipations, groupedFollowers, currentUser, followedActivityIds) {
    const dateString = formatDateForDatabase(date);
    const activitiesForDay = groupedActivities.get(dateString) ?? [];

    const dayElement = document.createElement("section");
    dayElement.className = "calendar-day";

    const saturdayType = getSaturdayType(date);
    if (saturdayType) {
        dayElement.classList.add("calendar-saturday");
    }

    const heading = document.createElement("h2");

    const weekday = document.createElement("span");
    weekday.className = "calendar-day-weekday";
    weekday.textContent = new Intl.DateTimeFormat("fr-FR", {
        weekday: "long"
    }).format(date);

    const dateLabel = document.createElement("span");
    dateLabel.className = "calendar-day-date";
    dateLabel.textContent = new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "long"
    }).format(date);

    heading.append(weekday, dateLabel);
    dayElement.appendChild(heading);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date.getTime() === today.getTime()) {
        dayElement.classList.add("calendar-today");
    }

    if (saturdayType) {
        const saturdayLabel = document.createElement("p");
        saturdayLabel.className = "calendar-saturday-label";
        saturdayLabel.textContent = saturdayType;
        dayElement.appendChild(saturdayLabel);
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
            followedActivityIds
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

    const groupedActivities = groupActivitiesByDate(activities);
    const groupedParticipations = groupParticipations(participations);
    const groupedFollowers = groupFollowers(followers);

    for (let offset = 0; offset < 7; offset += 1) {
        const date = cloneDate(weekStart);
        date.setDate(date.getDate() + offset);

        if (!isDateWithinPeriod(date, startDate, endDate)) {
            continue;
        }

        days.appendChild(createDayActivityList(
            date,
            groupedActivities,
            groupedParticipations,
            groupedFollowers,
            currentUser,
            followedActivityIds
        ));
    }

    weekContainer.appendChild(days);
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

        const saturdayType = getSaturdayType(date);
        if (saturdayType) {
            button.classList.add("is-special-saturday");
            button.title = saturdayType;
        }

        const selectedWeekEnd = endOfWeek(selectedWeekStart);
        if (date >= selectedWeekStart && date <= selectedWeekEnd) {
            button.classList.add("is-selected-week");
            button.title = "Semaine affichée ci-dessus";
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


function renderCalendar(activities, participations, followers, currentUser, followedActivityIds, selectedWeekStart = null) {
    const { today, startDate, endDate } = getCalendarPeriod();
    calendarContainer.replaceChildren();

    calendarPeriod.textContent = `Du ${startDate.toLocaleDateString("fr-FR")} au ${endDate.toLocaleDateString("fr-FR")} · 6 mois`;

    const initialWeek = selectedWeekStart ?? startOfWeek(today);
    const boundedWeek = isDateWithinPeriod(initialWeek, startDate, endDate)
        ? initialWeek
        : startOfWeek(startDate);

    calendarContainer.appendChild(renderLargeWeek(
        boundedWeek,
        activities,
        participations,
        followers,
        currentUser,
        followedActivityIds
    ));

    const navigation = document.createElement("div");
    navigation.className = "calendar-week-navigation";

    const todayButton = document.createElement("button");
    todayButton.type = "button";
    todayButton.textContent = "Aujourd'hui";
    todayButton.className = "calendar-today-button";
    todayButton.addEventListener("click", () => {
        renderCalendar(activities, participations, followers, currentUser, followedActivityIds, startOfWeek(today));
        window.scrollTo({ top: 0, behavior: "smooth" });
    });

    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "← Semaine précédente";
    previous.disabled = startOfWeek(boundedWeek).getTime() <= startOfWeek(startDate).getTime();
    previous.addEventListener("click", () => {
        const week = cloneDate(boundedWeek);
        week.setDate(week.getDate() - 7);
        renderCalendar(activities, participations, followers, currentUser, followedActivityIds, week);
        scrollToActivityFromUrl();
    });

    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Semaine suivante →";
    next.disabled = endOfWeek(boundedWeek).getTime() >= endDate.getTime();
    next.addEventListener("click", () => {
        const week = cloneDate(boundedWeek);
        week.setDate(week.getDate() + 7);
        renderCalendar(activities, participations, followers, currentUser, followedActivityIds, week);
        scrollToActivityFromUrl();
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
                renderCalendar(activities, participations, followers, currentUser, followedActivityIds, week);
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


        const activities =
            await loadActivities();


        const activityIds =
            activities.map(
                activity => activity.id
            );


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


        renderCalendar(
            activities,
            participations,
            followers,
            currentUser,
            followedActivityIds
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

                    await init();
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