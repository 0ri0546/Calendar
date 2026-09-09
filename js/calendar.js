import { supabase } from "./supabase.js?v=20260909-27";
import { showUserError } from "./ui-messages.js?v=20260909-27";

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

    const title = document.createElement("h4");
    title.textContent = `Participants (${participants.length}/${activity.max_players})`;
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

    const isFull = participants.length >= activity.max_players;

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


async function joinActivity(activityId) {
    try {
        const { error } = await supabase.rpc("join_activity", { p_activity_id: activityId });
        if (error) {
            showUserError(error);
            return;
        }
        await init();
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
        await init();
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
        await init();
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
        await init();
    } catch (error) {
        console.error(error);
        alert("Une erreur est survenue.");
    }
}


function createActivityElement(activity, participants, followers, currentUser, followedActivityIds, compactWeek = false) {
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

    if (activity.location) {
        const location = document.createElement("p");
        location.textContent = `📍 ${activity.location}`;
        details.appendChild(location);
    }

    article.appendChild(details);

    if (activity.description) {
        const description = document.createElement("p");
        description.className = "calendar-activity-description";
        description.textContent = activity.description;
        article.appendChild(description);
    }

    article.appendChild(createParticipantsElement(activity, participants));

    if (followers.length > 0) {
        article.appendChild(createWaitingQueueElement(followers));
    }

    article.appendChild(createActivityActions(activity, participants, currentUser, followedActivityIds));

    if (compactWeek) {
        article.classList.add("calendar-activity-compact");
        article.setAttribute("role", "button");
        article.setAttribute("tabindex", "0");
        article.setAttribute("aria-label", `Voir les détails de ${activity.title}`);

        const openDetails = () => {
            if (window.matchMedia("(max-width: 650px)").matches) {
                openMobileActivityDetails(
                    activity,
                    participants,
                    followers,
                    currentUser,
                    followedActivityIds
                );
            }
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

    content.querySelectorAll("button").forEach(button => {
        button.addEventListener("click", close, { once: true });
    });

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


function createDayActivityList(date, groupedActivities, groupedParticipations, groupedFollowers, currentUser, followedActivityIds, compactWeek = false) {
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

        const saturdayType = getSaturdayType(date);
        if (saturdayType) {
            button.classList.add("is-special-saturday");
            button.title = saturdayType;
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

    const todayButton = document.createElement("button");
    todayButton.type = "button";
    todayButton.className = "calendar-today-button";
    todayButton.textContent = "Aujourd'hui";
    todayButton.addEventListener("click", () => {
        renderCalendar(activities, participations, followers, currentUser, followedActivityIds, startOfWeek(today));
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