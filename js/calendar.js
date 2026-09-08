import { supabase } from "./supabase.js";

const calendarContainer = document.getElementById("calendar");
const calendarPeriod = document.getElementById("calendar-period");


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
function formatDateForDisplay(dateString) {
    const date = new Date(`${dateString}T00:00:00`);

    return new Intl.DateTimeFormat("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long"
    }).format(date);
}


/*
 * Aujourd'hui -> aujourd'hui + 1 mois.
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
 * Récupère l'utilisateur connecté.
 */
async function getCurrentUser() {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
        console.error(
            "Erreur récupération utilisateur :",
            error
        );

        return null;
    }

    return data.user;
}


/*
 * Récupère les activités approuvées.
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
 * Récupère les participations de toutes les activités.
 */
async function loadParticipations(activityIds) {
    if (activityIds.length === 0) {
        return [];
    }

    const { data, error } = await supabase
        .from("participations")
        .select(`
            activity_id,
            user_id,
            joined_at,
            profiles (
                pseudo,
                avatar_url
            )
        `)
        .in("activity_id", activityIds)
        .order("joined_at", { ascending: true });

    if (error) {
        console.error(
            "Erreur récupération participants :",
            error
        );

        throw error;
    }

    return data;
}


/*
 * Groupe les participations par activité.
 */
function groupParticipations(participations) {
    const grouped = new Map();

    for (const participation of participations) {
        if (!grouped.has(participation.activity_id)) {
            grouped.set(participation.activity_id, []);
        }

        grouped
            .get(participation.activity_id)
            .push(participation);
    }

    return grouped;
}


/*
 * Formate une heure.
 *
 * Supabase peut renvoyer :
 * 20:53:00
 *
 * On affiche :
 * 20:53
 */
function formatTime(time) {
    if (!time) {
        return "";
    }

    return time.slice(0, 5);
}


/*
 * Crée l'affichage des participants.
 */
function createParticipantsElement(
    activity,
    participants
) {
    const container =
        document.createElement("div");

    container.className =
        "calendar-participants";

    const title =
        document.createElement("h4");

    title.textContent =
        `Participants (${participants.length}/${activity.max_players})`;

    container.appendChild(title);


    /*
     * Aucun participant.
     */
    if (participants.length === 0) {
        const empty =
            document.createElement("p");

        empty.textContent =
            "Aucun participant pour le moment.";

        container.appendChild(empty);

        return container;
    }


    /*
     * Liste des participants.
     */
    const list =
        document.createElement("ul");

    for (const participant of participants) {
        const item =
            document.createElement("li");

        item.textContent =
            participant.profiles?.pseudo
            ?? "Utilisateur";

        list.appendChild(item);
    }

    container.appendChild(list);

    return container;
}


/*
 * Crée les boutons d'une activité.
 */
function createActivityActions(
    activity,
    participants,
    currentUser
) {
    const actions =
        document.createElement("div");

    actions.className =
        "calendar-actions";

    /*
     * Pas connecté.
     */
    if (!currentUser) {
        const loginMessage =
            document.createElement("p");

        loginMessage.textContent =
            "Connectez-vous pour participer.";

        actions.appendChild(loginMessage);

        return actions;
    }


    const isParticipant =
        participants.some(
            participant =>
                participant.user_id === currentUser.id
        );


    /*
     * L'utilisateur participe déjà.
     */
    if (isParticipant) {
        const leaveButton =
            document.createElement("button");

        leaveButton.textContent =
            "Quitter";

        leaveButton.addEventListener(
            "click",
            async () => {
                await leaveActivity(
                    activity.id
                );
            }
        );

        actions.appendChild(leaveButton);

        return actions;
    }


    /*
     * Partie complète.
     */
    if (
        participants.length >=
        activity.max_players
    ) {
        const fullMessage =
            document.createElement("p");

        fullMessage.textContent =
            "Partie complète.";

        actions.appendChild(fullMessage);

        return actions;
    }


    /*
     * Il reste de la place.
     */
    const joinButton =
        document.createElement("button");

    joinButton.textContent =
        "Rejoindre";

    joinButton.addEventListener(
        "click",
        async () => {
            await joinActivity(
                activity.id
            );
        }
    );

    actions.appendChild(joinButton);

    return actions;
}


/*
 * Rejoint une activité.
 */
async function joinActivity(activityId) {
    try {
        const { error } =
            await supabase.rpc(
                "join_activity",
                {
                    p_activity_id: activityId
                }
            );

        if (error) {
            console.error(
                "Erreur rejoindre activité :",
                error
            );

            alert(
                `Impossible de rejoindre la partie : ${error.message}`
            );

            return;
        }

        /*
         * Recharge entièrement le calendrier.
         */
        await init();

    } catch (error) {
        console.error(error);

        alert(
            "Une erreur est survenue."
        );
    }
}


/*
 * Quitte une activité.
 */
async function leaveActivity(activityId) {
    try {
        const { error } =
            await supabase.rpc(
                "leave_activity",
                {
                    p_activity_id: activityId
                }
            );

        if (error) {
            console.error(
                "Erreur quitter activité :",
                error
            );

            alert(
                `Impossible de quitter la partie : ${error.message}`
            );

            return;
        }

        await init();

    } catch (error) {
        console.error(error);

        alert(
            "Une erreur est survenue."
        );
    }
}


/*
 * Crée l'affichage complet d'une activité.
 */
function createActivityElement(
    activity,
    participants,
    currentUser
) {
    const article =
        document.createElement("article");

    article.className =
        "calendar-activity";


    const title =
        document.createElement("h3");

    title.textContent =
        activity.title;

    article.appendChild(title);


    const time =
        document.createElement("p");

    time.textContent =
        `${formatTime(activity.start_time)} → ${formatTime(activity.end_time)}`;

    article.appendChild(time);


    const players =
        document.createElement("p");

    players.textContent =
        `${activity.min_players} à ${activity.max_players} joueurs`;

    article.appendChild(players);


    if (activity.description) {
        const description =
            document.createElement("p");

        description.textContent =
            activity.description;

        article.appendChild(description);
    }


    article.appendChild(
        createParticipantsElement(
            activity,
            participants
        )
    );


    article.appendChild(
        createActivityActions(
            activity,
            participants,
            currentUser
        )
    );


    return article;
}


/*
 * Groupe les activités par date.
 */
function groupActivitiesByDate(activities) {
    const grouped = new Map();

    for (const activity of activities) {
        if (!grouped.has(activity.date)) {
            grouped.set(activity.date, []);
        }

        grouped
            .get(activity.date)
            .push(activity);
    }

    return grouped;
}


/*
 * Affiche le calendrier.
 */
function renderCalendar(
    activities,
    participations,
    currentUser
) {
    const { today, endDate } =
        getCalendarPeriod();

    calendarContainer.replaceChildren();


    calendarPeriod.textContent =
        `Du ${today.toLocaleDateString("fr-FR")} au ${endDate.toLocaleDateString("fr-FR")}`;


    const groupedActivities =
        groupActivitiesByDate(activities);

    const groupedParticipations =
        groupParticipations(participations);


    const currentDate =
        new Date(today);


    while (currentDate <= endDate) {
        const dateString =
            formatDateForDatabase(currentDate);


        const dayElement =
            document.createElement("section");

        dayElement.className =
            "calendar-day";


        const heading =
            document.createElement("h2");

        heading.textContent =
            formatDateForDisplay(dateString);

        dayElement.appendChild(heading);


        const activitiesForDay =
            groupedActivities.get(dateString)
            ?? [];


        if (activitiesForDay.length === 0) {
            const empty =
                document.createElement("p");

            empty.textContent =
                "Aucune activité prévue.";

            dayElement.appendChild(empty);
        }


        for (
            const activity
            of activitiesForDay
        ) {
            const participantsForActivity =
                groupedParticipations.get(
                    activity.id
                ) ?? [];


            dayElement.appendChild(
                createActivityElement(
                    activity,
                    participantsForActivity,
                    currentUser
                )
            );
        }


        calendarContainer.appendChild(
            dayElement
        );


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


        renderCalendar(
            activities,
            participations,
            currentUser
        );

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