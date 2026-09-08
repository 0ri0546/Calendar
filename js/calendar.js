import { supabase } from "./supabase.js";

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
 * Récupère toutes les participations
 * des activités affichées.
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
 * Récupère les suivis de l'utilisateur connecté.
 *
 * On ne récupère QUE ses propres suivis.
 */
async function loadMyFollows(currentUser, activityIds) {
    if (!currentUser || activityIds.length === 0) {
        return [];
    }

    const { data, error } = await supabase
        .from("followers")
        .select("activity_id")
        .eq("user_id", currentUser.id)
        .in("activity_id", activityIds);

    if (error) {
        console.error(
            "Erreur récupération suivis :",
            error
        );

        throw error;
    }

    return data;
}


/*
 * Transforme les suivis en Set.
 *
 * Exemple :
 *
 * Set {
 *   "id-activité-1",
 *   "id-activité-4"
 * }
 */
function createFollowSet(follows) {
    return new Set(
        follows.map(
            follow => follow.activity_id
        )
    );
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
 * 20:53:00 -> 20:53
 */
function formatTime(time) {
    if (!time) {
        return "";
    }

    return time.slice(0, 5);
}


/*
 * Affiche les participants.
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


    if (participants.length === 0) {
        const empty =
            document.createElement("p");

        empty.textContent =
            "Aucun participant pour le moment.";

        container.appendChild(empty);

        return container;
    }


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
    currentUser,
    followedActivityIds
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
     * La partie est pleine.
     */
    const isFull =
        participants.length >=
        activity.max_players;


    if (isFull) {
        const isFollowing =
            followedActivityIds.has(activity.id);


        /*
         * L'utilisateur suit déjà cette partie.
         */
        if (isFollowing) {
            const unfollowButton =
                document.createElement("button");

            unfollowButton.textContent =
                "🔕 Ne plus me prévenir";


            unfollowButton.addEventListener(
                "click",
                async () => {
                    await unfollowActivity(
                        activity.id
                    );
                }
            );


            actions.appendChild(
                unfollowButton
            );

            return actions;
        }


        /*
         * L'utilisateur ne suit pas encore.
         */
        const followButton =
            document.createElement("button");

        followButton.textContent =
            "🔔 Me prévenir si une place se libère";


        followButton.addEventListener(
            "click",
            async () => {
                await followActivity(
                    activity.id
                );
            }
        );


        actions.appendChild(
            followButton
        );

        return actions;
    }


    /*
     * Partie non pleine :
     * on propose simplement de rejoindre.
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
 * Active le suivi d'une activité.
 */
async function followActivity(activityId) {
    try {
        const { error } =
            await supabase.rpc(
                "follow_activity",
                {
                    p_activity_id: activityId
                }
            );


        if (error) {
            console.error(
                "Erreur suivi activité :",
                error
            );

            alert(
                `Impossible d'activer le suivi : ${error.message}`
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
 * Désactive le suivi d'une activité.
 */
async function unfollowActivity(activityId) {
    try {
        const { error } =
            await supabase.rpc(
                "unfollow_activity",
                {
                    p_activity_id: activityId
                }
            );


        if (error) {
            console.error(
                "Erreur désactivation suivi :",
                error
            );

            alert(
                `Impossible de désactiver le suivi : ${error.message}`
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
    currentUser,
    followedActivityIds
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
            currentUser,
            followedActivityIds
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
    currentUser,
    followedActivityIds
) {
    const { today, endDate } =
        getCalendarPeriod();


    calendarContainer.replaceChildren();


    calendarPeriod.textContent =
        `Du ${today.toLocaleDateString("fr-FR")} au ${endDate.toLocaleDateString("fr-FR")}`;


    const groupedActivities =
        groupActivitiesByDate(activities);


    const groupedParticipations =
        groupParticipations(
            participations
        );


    const currentDate =
        new Date(today);


    while (currentDate <= endDate) {
        const dateString =
            formatDateForDatabase(
                currentDate
            );


        const dayElement =
            document.createElement("section");

        dayElement.className =
            "calendar-day";


        const heading =
            document.createElement("h2");

        heading.textContent =
            formatDateForDisplay(
                dateString
            );

        dayElement.appendChild(heading);


        const activitiesForDay =
            groupedActivities.get(
                dateString
            ) ?? [];


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
                    currentUser,
                    followedActivityIds
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
            currentUser,
            followedActivityIds
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