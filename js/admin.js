import { supabase } from "./supabase.js?v=20260913-stats";


function getAvatarDisplayUrl(url) {
    if (!url) {
        return url;
    }

    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}v=${Date.now()}`;
}
import { showUserError } from "./ui-messages.js?v=20260913-stats";
import { renderDescriptionWithLinks } from "./ui.js?v=20260913-stats";

const membersList = document.getElementById("members-list");
const proposalsList = document.getElementById("proposals-list");
const adminContent = document.getElementById("admin-content");
const adminMessage = document.getElementById("admin-message");
const activitiesList =
    document.getElementById("activities-list");
const adminLogsList = document.getElementById("admin-logs-list");
const openAdminLogsButton = document.getElementById("open-admin-logs");
const closeAdminLogsButton = document.getElementById("close-admin-logs");
const adminLogsModal = document.getElementById("admin-logs-modal");
const activitiesStatsChart = document.getElementById("activities-stats-chart");
const participationsStatsChart = document.getElementById("participations-stats-chart");

const statsCache = new Map();

function escapeSvgText(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatStatsBucket(value, period) {
    const date = new Date(`${value}T12:00:00`);

    if (period === "month") {
        return date.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
    }

    if (period === "week") {
        return `S${getIsoWeek(date)}`;
    }

    return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function getIsoWeek(date) {
    const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = copy.getUTCDay() || 7;
    copy.setUTCDate(copy.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
    return Math.ceil((((copy - yearStart) / 86400000) + 1) / 7);
}

function renderStatsChart(container, rows, period, valueKey, label) {
    if (!container) return;

    if (!rows?.length) {
        container.innerHTML = `<p class="admin-stats-empty">Aucune donnée disponible.</p>`;
        return;
    }

    const width = 760;
    const height = 300;
    const padding = { top: 22, right: 18, bottom: 48, left: 42 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const values = rows.map(row => Number(row[valueKey]) || 0);
    const max = Math.max(...values, 1);
    const niceMax = Math.max(1, Math.ceil(max));
    const step = chartWidth / Math.max(rows.length, 1);
    const barWidth = Math.min(34, step * 0.62);
    const gridCount = 4;
    const yScale = chartHeight / niceMax;

    const grid = [];
    for (let i = 0; i <= gridCount; i++) {
        const value = Math.round((niceMax / gridCount) * i);
        const y = padding.top + chartHeight - value * yScale;
        grid.push(`<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="admin-chart-grid-line"/>`);
        grid.push(`<text x="${padding.left - 9}" y="${y + 4}" text-anchor="end" class="admin-chart-axis-label">${value}</text>`);
    }

    const bars = rows.map((row, index) => {
        const value = Number(row[valueKey]) || 0;
        const x = padding.left + index * step + (step - barWidth) / 2;
        const barHeight = value * yScale;
        const y = padding.top + chartHeight - barHeight;
        const labelX = padding.left + index * step + step / 2;
        const bucket = formatStatsBucket(row.bucket_start, period);
        return `
            <g class="admin-chart-bar-group">
                <rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(barHeight, value ? 2 : 0)}" rx="5" class="admin-chart-bar">
                    <title>${escapeSvgText(bucket)} : ${value} ${escapeSvgText(label.toLowerCase())}</title>
                </rect>
                <text x="${labelX}" y="${height - 18}" text-anchor="middle" class="admin-chart-axis-label">${escapeSvgText(bucket)}</text>
            </g>`;
    }).join("");

    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
            <g>${grid.join("")}</g>
            <g>${bars}</g>
        </svg>
        <p class="admin-chart-caption">${escapeSvgText(label)}</p>`;
}

async function loadStatistics(period) {
    const cacheKey = period;
    if (statsCache.has(cacheKey)) {
        const data = statsCache.get(cacheKey);
        renderStatsChart(activitiesStatsChart, data, period, "activity_count", "activité validée");
        renderStatsChart(participationsStatsChart, data, period, "participation_count", "participation");
        return;
    }

    if (activitiesStatsChart) activitiesStatsChart.innerHTML = '<p class="admin-stats-loading">Chargement...</p>';
    if (participationsStatsChart) participationsStatsChart.innerHTML = '<p class="admin-stats-loading">Chargement...</p>';

    const { data, error } = await supabase.rpc("get_admin_statistics", { p_period: period });

    if (error) {
        console.error("Erreur récupération statistiques :", error);
        const message = "Impossible de charger les statistiques.";
        if (activitiesStatsChart) activitiesStatsChart.innerHTML = `<p class="admin-stats-empty">${message}</p>`;
        if (participationsStatsChart) participationsStatsChart.innerHTML = `<p class="admin-stats-empty">${message}</p>`;
        return;
    }

    statsCache.set(cacheKey, data ?? []);
    renderStatsChart(activitiesStatsChart, data ?? [], period, "activity_count", "Activités validées");
    renderStatsChart(participationsStatsChart, data ?? [], period, "participation_count", "Participations");
}

document.querySelectorAll("[data-stats-period]").forEach(button => {
    button.addEventListener("click", () => {
        const type = button.dataset.statsType;
        const period = button.dataset.statsPeriod;

        document.querySelectorAll(`[data-stats-type="${type}"]`).forEach(item => {
            item.setAttribute("aria-pressed", String(item === button));
        });

        loadStatistics(period);
    });
});


// Sections administrateur repliables : toutes fermées par défaut.
function animateCollapsible(content, open) {
    if (!content) return;

    content.hidden = false;
    const startHeight = open ? 0 : content.scrollHeight;
    const endHeight = open ? content.scrollHeight : 0;

    content.style.overflow = "hidden";
    content.style.maxHeight = `${startHeight}px`;
    content.style.opacity = open ? "0" : "1";
    content.style.transform = open ? "translateY(-6px)" : "translateY(0)";

    requestAnimationFrame(() => {
        content.style.transition = [
            "max-height 500ms cubic-bezier(.22,1,.36,1)",
            "opacity 500ms ease",
            "transform 500ms cubic-bezier(.22,1,.36,1)"
        ].join(", ");
        content.style.maxHeight = `${endHeight}px`;
        content.style.opacity = open ? "1" : "0";
        content.style.transform = open ? "translateY(0)" : "translateY(-6px)";
    });

    window.setTimeout(() => {
        content.style.transition = "";
        if (open) {
            content.style.maxHeight = "none";
            content.style.opacity = "1";
            content.style.transform = "none";
        } else {
            content.hidden = true;
            content.style.maxHeight = "";
            content.style.opacity = "";
            content.style.transform = "";
        }
    }, 500);
}

document.querySelectorAll(".admin-section-toggle").forEach(button => {
    const section = button.closest(".admin-collapsible");
    const contentId = button.getAttribute("aria-controls");
    const content = contentId
        ? document.getElementById(contentId)
        : section?.querySelector(".admin-section-content");

    button.setAttribute("aria-expanded", "false");
    section?.classList.remove("is-open");
    if (content) content.hidden = true;

    button.addEventListener("click", () => {
        const nextExpanded = button.getAttribute("aria-expanded") !== "true";
        button.setAttribute("aria-expanded", String(nextExpanded));
        section?.classList.toggle("is-open", nextExpanded);
        animateCollapsible(content, nextExpanded);
    });
});

/*
 * Récupère l'utilisateur actuellement connecté.
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
 * Vérifie que l'utilisateur est administrateur.
 */
async function checkAdmin(user) {
    const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (error) {
        console.error("Erreur vérification rôle :", error);
        return false;
    }

    return data.role === "admin";
}


/*
 * Affiche les membres.
 */
async function loadMembers(currentUser) {
    membersList.textContent = "Chargement des membres...";

    const { data: members, error } = await supabase
        .from("profiles")
        .select("id, pseudo, avatar_url, role, created_at")
        .order("pseudo", { ascending: true });

    if (error) {
        console.error("Erreur récupération membres :", error);

        membersList.textContent =
            `Erreur lors du chargement des membres : ${error.message}`;

        return;
    }

    membersList.replaceChildren();

    if (members.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "Aucun membre.";
        membersList.appendChild(empty);
        return;
    }

    for (const member of members) {
        const article = document.createElement("article");
        article.className = "admin-member";

        if (member.avatar_url) {
            const avatar = document.createElement("img");
            avatar.src = getAvatarDisplayUrl(member.avatar_url);
            avatar.alt = `Photo de profil de ${member.pseudo}`;
            avatar.width = 50;
            avatar.height = 50;

            article.appendChild(avatar);
        }

        const info = document.createElement("div");
        info.className = "admin-member-info";

        const pseudo = document.createElement("strong");
        pseudo.textContent = member.pseudo;

        const role = document.createElement("span");
        role.className = "admin-member-role";
        role.textContent = member.role;

        info.appendChild(pseudo);
        info.appendChild(role);

        article.appendChild(info);

        const roleButton = document.createElement("button");

        if (member.id === currentUser.id) {
            roleButton.textContent =
                member.role === "admin"
                    ? "Vous êtes admin"
                    : "Votre compte";

            roleButton.disabled = true;
        } else {
            roleButton.textContent =
                member.role === "admin"
                    ? "Rétrograder"
                    : "Promouvoir admin";

            roleButton.addEventListener("click", () => {
                changeRole(member);
            });
        }

        article.appendChild(roleButton);

        membersList.appendChild(article);
    }
}


/*
 * Change le rôle d'un membre.
 */
async function changeRole(member) {
    const newRole =
        member.role === "admin"
            ? "member"
            : "admin";

    const action =
        newRole === "admin"
            ? "promouvoir"
            : "rétrograder";

    const confirmed = confirm(
        `Voulez-vous ${action} ${member.pseudo} ?`
    );

    if (!confirmed) {
        return;
    }

    adminMessage.textContent = "Modification du rôle...";

    const { error } = await supabase.rpc(
        "set_user_role",
        {
            p_user_id: member.id,
            p_role: newRole
        }
    );

    if (error) {
        console.error("Erreur changement de rôle :", error);

        adminMessage.textContent =
            "Impossible d'effectuer cette action.";
        showUserError(error);

        return;
    }

    adminMessage.textContent =
        `Le rôle de ${member.pseudo} a été modifié.`;

    const currentUser = await getCurrentUser();

    if (currentUser) {
        await loadMembers(currentUser);
    }
}


const ADMIN_ACTION_LABELS = {
    activity_created: "Proposition d'activité",
    activity_approved: "Activité approuvée",
    activity_rejected: "Activité refusée",
    activity_updated: "Activité modifiée",
    activity_deleted: "Activité supprimée",
    user_promoted: "Membre promu admin",
    user_demoted: "Admin rétrogradé",
    notification_created: "Notification créée",
    notification_sent: "Notification envoyée",
    notification_failed: "Notification échouée",
    activity_status_changed: "Statut d'activité modifié",
    activity_joined: "Participation à une activité",
    activity_left: "Départ d'une activité",
    activity_waitlist_joined: "Entrée en file d'attente",
    activity_waitlist_left: "Sortie de file d'attente",
    friend_request_sent: "Demande d'ami envoyée",
    friend_request_accepted: "Demande d'ami acceptée",
    friend_request_rejected: "Demande d'ami refusée",
    day_presence_added: "Présence aux jeux divers",
    day_presence_removed: "Présence aux jeux divers retirée",
    calendar_day_tags_updated: "Tags de journée modifiés",
    profile_updated: "Profil modifié"
};

function openAdminLogs() {
    if (!adminLogsModal) return;
    adminLogsModal.hidden = false;
    adminLogsModal.classList.remove("polish-modal-closing");
    void adminLogsModal.offsetWidth;
    document.body.classList.add("admin-logs-open");
    closeAdminLogsButton?.focus();
}

function closeAdminLogs() {
    if (!adminLogsModal) return;
    adminLogsModal.classList.add("polish-modal-closing");
    document.body.classList.remove("admin-logs-open");
    window.setTimeout(() => {
        if (adminLogsModal.classList.contains("polish-modal-closing")) {
            adminLogsModal.hidden = true;
            adminLogsModal.classList.remove("polish-modal-closing");
        }
    }, 500);
    openAdminLogsButton?.focus();
}

openAdminLogsButton?.addEventListener("click", openAdminLogs);
closeAdminLogsButton?.addEventListener("click", closeAdminLogs);
adminLogsModal?.querySelector("[data-close-admin-logs]")?.addEventListener("click", closeAdminLogs);
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && adminLogsModal && !adminLogsModal.hidden) {
        closeAdminLogs();
    }
});

function getLogActivityTitle(log) {
    if (log.details?.title) return log.details.title;
    if (log.details?.data?.title) return log.details.data.title;
    return null;
}

function getLogTargetUserId(log) {
    if (log.target_type === "user" && log.target_id) return log.target_id;
    if (log.details?.created_by) return log.details.created_by;
    if (log.details?.data?.user_id) return log.details.data.user_id;
    return null;
}

function formatLogDay(day) {
    if (!day) return "jour inconnu";

    const date = new Date(`${day}T12:00:00`);
    return date.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}


function buildAdminLogSentence(log, targetPseudoById) {
    const actor = log.actor_pseudo ?? "Le système";
    const title = getLogActivityTitle(log);
    const targetUserId = getLogTargetUserId(log);
    const targetPseudo = targetUserId
        ? targetPseudoById.get(targetUserId) ?? "membre inconnu"
        : null;

    switch (log.action) {
        case "activity_created":
            return `${actor} a proposé l'activité « ${title ?? "sans titre"} »`;
        case "activity_approved":
            return `${actor} a approuvé l'activité « ${title ?? "sans titre"} »`;
        case "activity_rejected":
            return `${actor} a refusé l'activité « ${title ?? "sans titre"} »`;
        case "activity_updated":
            return `${actor} a modifié l'activité « ${title ?? "sans titre"} »`;
        case "activity_deleted":
            return `${actor} a supprimé l'activité « ${title ?? "sans titre"} »`;
        case "user_promoted":
            return `${actor} a promu ${targetPseudo ?? "un membre"} administrateur`;
        case "user_demoted":
            return `${actor} a rétrogradé ${targetPseudo ?? "un administrateur"} au rôle de membre`;
        case "notification_created":
            return `${actor} a créé une notification${title ? ` pour « ${title} »` : ""}`;
        case "notification_sent":
            return `${actor} a envoyé une notification${title ? ` pour « ${title} »` : ""}`;
        case "notification_failed":
            return `${actor} n'a pas pu envoyer une notification${title ? ` pour « ${title} »` : ""}`;
        case "activity_joined":
            return `${actor} a rejoint l'activité « ${title ?? "sans titre"} »`;
        case "activity_left":
            return `${actor} a quitté l'activité « ${title ?? "sans titre"} »`;
        case "activity_waitlist_joined":
            return `${actor} a rejoint la file d'attente de « ${title ?? "sans titre"} »`;
        case "activity_waitlist_left":
            return `${actor} a quitté la file d'attente de « ${title ?? "sans titre"} »`;
        case "friend_request_sent":
            return `${actor} a demandé ${targetPseudo ?? "un membre"} en ami`;
        case "friend_request_accepted":
            return `${actor} a accepté la demande d'ami de ${targetPseudo ?? "un membre"}`;
        case "friend_request_rejected":
            return `${actor} a refusé la demande d'ami de ${targetPseudo ?? "un membre"}`;
        case "day_presence_added":
            return `${actor} a indiqué être présent aux jeux divers le ${formatLogDay(log.details?.day)}`;
        case "day_presence_removed":
            return `${actor} a retiré sa présence aux jeux divers le ${formatLogDay(log.details?.day)}`;
        case "calendar_day_tags_updated":
            return `${actor} a modifié les tags du ${formatLogDay(log.details?.day)}`;
        case "profile_updated":
            return `${actor} a modifié son profil`;
        case "activity_status_changed":
            return `${actor} a changé le statut de l'activité « ${title ?? "sans titre"} »`;
        default:
            return `${actor} a effectué l'action « ${log.action} »`;
    }
}

async function loadAdminLogs() {
    if (!adminLogsList) return;
    adminLogsList.textContent = "Chargement du journal...";

    const { data, error } = await supabase.rpc("get_admin_logs");

    if (error) {
        console.error("Erreur récupération journal admin :", error);
        adminLogsList.textContent =
            "Impossible de charger le journal administrateur.";
        return;
    }

    adminLogsList.replaceChildren();

    if (!data?.length) {
        const empty = document.createElement("p");
        empty.textContent = "Aucune action enregistrée.";
        adminLogsList.appendChild(empty);
        return;
    }

    const targetUserIds = [
        ...new Set(
            data
                .map(getLogTargetUserId)
                .filter(Boolean)
        )
    ];

    const targetPseudoById = new Map();

    if (targetUserIds.length) {
        const { data: profiles, error: profilesError } = await supabase
            .from("profiles")
            .select("id, pseudo")
            .in("id", targetUserIds);

        if (profilesError) {
            console.error("Erreur récupération cibles du journal :", profilesError);
        } else {
            for (const profile of profiles ?? []) {
                targetPseudoById.set(profile.id, profile.pseudo);
            }
        }
    }

    for (const log of data) {
        const article = document.createElement("article");
        article.className = "admin-log-entry";

        const heading = document.createElement("div");
        heading.className = "admin-log-heading";

        const action = document.createElement("strong");
        action.textContent = ADMIN_ACTION_LABELS[log.action] ?? log.action;

        const date = document.createElement("time");
        date.dateTime = log.created_at;
        date.textContent = new Date(log.created_at).toLocaleString("fr-FR");

        heading.append(action, date);

        const sentence = document.createElement("p");
        sentence.className = "admin-log-sentence";
        sentence.textContent = buildAdminLogSentence(log, targetPseudoById);

        article.append(heading, sentence);

        if (
            log.details &&
            typeof log.details === "object" &&
            Object.keys(log.details).length
        ) {
            const details = document.createElement("details");
            const summary = document.createElement("summary");
            summary.textContent = "Voir les détails techniques";

            const pre = document.createElement("pre");
            pre.textContent = JSON.stringify(log.details, null, 2);

            details.append(summary, pre);
            article.appendChild(details);
        }

        adminLogsList.appendChild(article);
    }
}

/*
 * Charge les propositions.
 */
async function loadProposals() {
    proposalsList.textContent = "Chargement des propositions...";

    /*
     * On récupère uniquement les activités.
     */
    const {
        data: activities,
        error: activitiesError
    } = await supabase
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
            status,
            created_at,
            created_by
        `)
        .in("status", ["pending", "rejected"])
        .order("created_at", { ascending: false });

    if (activitiesError) {
        console.error(
            "Erreur récupération propositions :",
            activitiesError
        );

        proposalsList.textContent =
            `Erreur Supabase : ${activitiesError.message}`;

        return;
    }

    proposalsList.replaceChildren();

    if (activities.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "Aucune proposition en attente.";
        proposalsList.appendChild(empty);
        return;
    }

    /*
     * Récupération des IDs des créateurs.
     */
    const creatorIds = [
        ...new Set(
            activities.map(activity => activity.created_by)
        )
    ];

    let profiles = [];

    if (creatorIds.length > 0) {
        const {
            data,
            error: profilesError
        } = await supabase
            .from("profiles")
            .select("id, pseudo, avatar_url")
            .in("id", creatorIds);

        if (profilesError) {
            console.error(
                "Erreur récupération profils des créateurs :",
                profilesError
            );

            proposalsList.textContent =
                `Erreur lors du chargement des créateurs : ${profilesError.message}`;

            return;
        }

        profiles = data;
    }

    /*
     * Création d'une Map pour retrouver rapidement
     * le profil correspondant à chaque créateur.
     */
    const profilesMap = new Map(
        profiles.map(profile => [profile.id, profile])
    );

    /*
     * Affichage des propositions.
     */
    for (const activity of activities) {
        const creator = profilesMap.get(activity.created_by);

        const article = document.createElement("article");
        article.className = "admin-proposal";

        const title = document.createElement("h3");
        title.textContent = activity.title;

        article.appendChild(title);

        if (activity.description) {
            const description = document.createElement("p");
            renderDescriptionWithLinks(description, activity.description);
            article.appendChild(description);
        }

        const date = document.createElement("p");
        date.textContent =
            `Date : ${activity.date}`;

        article.appendChild(date);

        const time = document.createElement("p");
        time.textContent =
            `Horaire : ${activity.start_time} → ${activity.end_time}`;

        article.appendChild(time);

        const players = document.createElement("p");
        players.textContent =
            `Joueurs : ${activity.min_players} à ${activity.max_players}`;

        article.appendChild(players);

        if (activity.location) {
            const location = document.createElement("p");
            location.textContent = `Lieu : ${activity.location}`;
            article.appendChild(location);
        }

        if (activity.is_event) {
            const eventInfo = document.createElement("p");
            eventInfo.className = "admin-event-marker";
            eventInfo.textContent = "⭐";
            eventInfo.title = "Événement important";
            eventInfo.setAttribute("aria-label", "Événement important");
            article.appendChild(eventInfo);
        }

        if (activity.image_url) {
            const image = document.createElement("img");
            image.className = "admin-activity-image";
            image.src = activity.image_url;
            image.alt = `Illustration de ${activity.title}`;
            image.loading = "lazy";
            article.appendChild(image);
        }

        const creatorElement = document.createElement("p");
        creatorElement.textContent =
            `Proposé par : ${creator?.pseudo ?? "Utilisateur inconnu"}`;

        article.appendChild(creatorElement);

        const status = document.createElement("p");

        if (activity.status === "pending") {
            status.textContent = "Statut : En attente";
        } else if (activity.status === "rejected") {
            status.textContent = "Statut : Refusée";
        } else {
            status.textContent =
                `Statut : ${activity.status}`;
        }

        article.appendChild(status);

        /*
         * Boutons uniquement pour les propositions en attente.
         */
        if (activity.status === "pending") {
            const approveButton = document.createElement("button");

            approveButton.textContent = "Approuver";

            approveButton.addEventListener("click", () => {
                updateProposalStatus(
                    activity.id,
                    "approved"
                );
            });

            const rejectButton = document.createElement("button");

            rejectButton.textContent = "Refuser";

            rejectButton.addEventListener("click", () => {
                updateProposalStatus(
                    activity.id,
                    "rejected"
                );
            });

            article.appendChild(approveButton);
            article.appendChild(rejectButton);
        }

        proposalsList.appendChild(article);
    }
}

/*
 * Charge les activités approuvées.
 */
async function loadApprovedActivities() {
    activitiesList.textContent =
        "Chargement des activités...";

    const {
        data: activities,
        error
    } = await supabase
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
            created_at,
            created_by
        `)
        .eq("status", "approved")
        .order("date", { ascending: true })
        .order("start_time", { ascending: true });

    if (error) {
        console.error(
            "Erreur récupération activités approuvées :",
            error
        );

        activitiesList.textContent =
            `Erreur : ${error.message}`;

        return;
    }

    activitiesList.replaceChildren();

    if (activities.length === 0) {
        const empty = document.createElement("p");

        empty.textContent =
            "Aucune activité approuvée.";

        activitiesList.appendChild(empty);

        return;
    }

    for (const activity of activities) {

        const article =
            document.createElement("article");

        article.className =
            "admin-activity";

        article.dataset.activityId =
            activity.id;


        const title =
            document.createElement("h3");

        title.textContent =
            activity.title;

        article.appendChild(title);


        if (activity.description) {

            const description =
                document.createElement("p");

            renderDescriptionWithLinks(description, activity.description);

            article.appendChild(description);
        }


        const date =
            document.createElement("p");

        date.textContent =
            `Date : ${activity.date}`;

        article.appendChild(date);


        const time =
            document.createElement("p");

        time.textContent =
            `Horaire : ${activity.start_time} → ${activity.end_time}`;

        article.appendChild(time);


        const players =
            document.createElement("p");

        players.textContent =
            `Joueurs : ${activity.min_players} à ${activity.max_players}`;

        article.appendChild(players);

        if (activity.location) {
            const location = document.createElement("p");
            location.textContent = `Lieu : ${activity.location}`;
            article.appendChild(location);
        }

        if (activity.is_event) {
            const eventInfo = document.createElement("p");
            eventInfo.className = "admin-event-marker";
            eventInfo.textContent = "⭐";
            eventInfo.title = "Événement important";
            eventInfo.setAttribute("aria-label", "Événement important");
            article.appendChild(eventInfo);
        }

        if (activity.image_url) {
            const image = document.createElement("img");
            image.className = "admin-activity-image";
            image.src = activity.image_url;
            image.alt = `Illustration de ${activity.title}`;
            image.loading = "lazy";
            article.appendChild(image);
        }


        const actions =
            document.createElement("div");

        actions.className =
            "admin-activity-actions";


        const editButton = document.createElement("button");

        editButton.type = "button";
        editButton.textContent = "✏️ Modifier";

        editButton.addEventListener(
            "click",
            () => openEditActivityForm(activity)
        );


        const deleteButton = document.createElement("button");

        deleteButton.type = "button";
        deleteButton.textContent = "🗑️ Supprimer";

        deleteButton.addEventListener(
            "click",
            () => deleteActivity(activity)
        );


        actions.appendChild(editButton);
        actions.appendChild(deleteButton);

        article.appendChild(actions);

        activitiesList.appendChild(article);
    }
}

/*
 * Affiche le formulaire de modification
 * d'une activité.
 */
function openEditActivityForm(activity) {

    const article =
        document.querySelector(
            `.admin-activity[data-activity-id="${activity.id}"]`
        );

    if (!article) {
        return;
    }

    article.replaceChildren();


    const title =
        document.createElement("h3");

    title.textContent =
        "Modifier l'activité";

    article.appendChild(title);


    const form =
        document.createElement("form");


    /*
     * Titre
     */

    const titleLabel =
        document.createElement("label");

    titleLabel.textContent =
        "Titre";

    const titleInput =
        document.createElement("input");

    titleInput.type = "text";
    titleInput.value = activity.title;
    titleInput.required = true;

    titleLabel.appendChild(titleInput);
    form.appendChild(titleLabel);


    /*
     * Description
     */

    const descriptionLabel =
        document.createElement("label");

    descriptionLabel.textContent =
        "Description";

    const descriptionInput =
        document.createElement("textarea");

    descriptionInput.value =
        activity.description ?? "";

    descriptionLabel.appendChild(
        descriptionInput
    );

    form.appendChild(
        descriptionLabel
    );


    /*
     * Date
     */

    const dateLabel =
        document.createElement("label");

    dateLabel.textContent =
        "Date";

    const dateInput =
        document.createElement("input");

    dateInput.type = "date";
    dateInput.value = activity.date;
    dateInput.required = true;

    dateLabel.appendChild(dateInput);
    form.appendChild(dateLabel);


    /*
     * Heure de début
     */

    const startLabel =
        document.createElement("label");

    startLabel.textContent =
        "Début";

    const startInput =
        document.createElement("input");

    startInput.type = "time";
    startInput.value =
        activity.start_time.slice(0, 5);

    startInput.required = true;

    startLabel.appendChild(startInput);
    form.appendChild(startLabel);


    /*
     * Heure de fin
     */

    const endLabel =
        document.createElement("label");

    endLabel.textContent =
        "Fin";

    const endInput =
        document.createElement("input");

    endInput.type = "time";
    endInput.value =
        activity.end_time.slice(0, 5);

    endInput.required = true;

    endLabel.appendChild(endInput);
    form.appendChild(endLabel);


    /*
     * Minimum de joueurs
     */

    const minLabel =
        document.createElement("label");

    minLabel.textContent =
        "Minimum de joueurs";

    const minInput =
        document.createElement("input");

    minInput.type = "number";
    minInput.min = "1";
    minInput.value =
        activity.min_players;

    minInput.required = true;

    minLabel.appendChild(minInput);
    form.appendChild(minLabel);


    /*
     * Maximum de joueurs
     */

    const maxLabel =
        document.createElement("label");

    maxLabel.textContent =
        "Maximum de joueurs";

    const maxInput =
        document.createElement("input");

    maxInput.type = "number";
    maxInput.min = "1";
    maxInput.value =
        activity.max_players;

    maxInput.required = true;

    maxLabel.appendChild(maxInput);
    form.appendChild(maxLabel);


    /*
     * Lieu
     */
    const locationLabel = document.createElement("label");
    locationLabel.textContent = "Lieu";

    const locationInput = document.createElement("input");
    locationInput.type = "text";
    locationInput.value = activity.location ?? "";
    locationLabel.appendChild(locationInput);
    form.appendChild(locationLabel);

    /*
     * Événement important
     */
    const eventLabel = document.createElement("label");
    eventLabel.className = "admin-edit-checkbox";

    const eventInput = document.createElement("input");
    eventInput.type = "checkbox";
    eventInput.checked = Boolean(activity.is_event);

    eventLabel.appendChild(eventInput);

    const eventText = document.createElement("span");
    eventText.textContent = "⭐";
    eventText.title = "Marquer cette activité comme événement important";
    eventText.setAttribute("aria-label", "Événement important");
    eventLabel.appendChild(eventText);
    form.appendChild(eventLabel);

    if (activity.image_url) {
        const currentImage = document.createElement("img");
        currentImage.className = "admin-activity-image";
        currentImage.src = activity.image_url;
        currentImage.alt = `Illustration de ${activity.title}`;
        form.appendChild(currentImage);
    }

    /*
     * Bouton enregistrer
     */

    const saveButton =
        document.createElement("button");

    saveButton.type = "submit";
    saveButton.textContent =
        "Enregistrer";


    /*
     * Bouton annuler
     */

    const cancelButton =
        document.createElement("button");

    cancelButton.type = "button";
    cancelButton.textContent =
        "Annuler";

    cancelButton.addEventListener(
        "click",
        () => loadApprovedActivities()
    );


    form.appendChild(saveButton);
    form.appendChild(cancelButton);


    form.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();

            await saveActivityChanges(
                activity.id,
                titleInput.value.trim(),
                descriptionInput.value.trim(),
                dateInput.value,
                startInput.value,
                endInput.value,
                Number(minInput.value),
                Number(maxInput.value),
                locationInput.value.trim(),
                eventInput.checked,
                activity.image_url ?? null
            );
        }
    );


    article.appendChild(form);
}

/*
 * Enregistre les modifications d'une activité.
 */
async function saveActivityChanges(
    activityId,
    title,
    description,
    date,
    startTime,
    endTime,
    minPlayers,
    maxPlayers,
    location,
    isEvent,
    imageUrl
) {

    if (!title) {
        adminMessage.textContent =
            "Le titre est obligatoire.";

        return;
    }


    if (!date || !startTime || !endTime) {
        adminMessage.textContent =
            "La date et les horaires sont obligatoires.";

        return;
    }


    if (startTime >= endTime) {
        adminMessage.textContent =
            "L'heure de début doit être avant l'heure de fin.";

        return;
    }


    if (
        !Number.isInteger(minPlayers) ||
        !Number.isInteger(maxPlayers) ||
        minPlayers <= 0 ||
        maxPlayers <= 0
    ) {
        adminMessage.textContent =
            "Les nombres de joueurs sont invalides.";

        return;
    }


    if (minPlayers > maxPlayers) {
        adminMessage.textContent =
            "Le minimum de joueurs ne peut pas dépasser le maximum.";

        return;
    }


    adminMessage.textContent =
        "Modification de l'activité...";


    const {
        error
    } = await supabase.rpc(
        "update_activity",
        {
            p_activity_id: activityId,
            p_title: title,
            p_description: description,
            p_date: date,
            p_start_time: startTime,
            p_end_time: endTime,
            p_min_players: minPlayers,
            p_max_players: maxPlayers,
            p_location: location || null,
            p_is_event: Boolean(isEvent),
            p_image_url: imageUrl || null
        }
    );


    if (error) {

        console.error(
            "Erreur modification activité :",
            error
        );

        adminMessage.textContent =
            "Impossible d'effectuer cette action.";
        showUserError(error);

        return;
    }


    adminMessage.textContent =
        "Activité modifiée avec succès.";


    await loadApprovedActivities();
}

/*
 * Supprime une activité approuvée.
 */
async function deleteActivity(activity) {

    const confirmed = confirm(
        `Voulez-vous vraiment supprimer l'activité "${activity.title}" ?\n\n` +
        "Cette action est définitive.\n" +
        "Les participants seront informés par e-mail."
    );

    if (!confirmed) {
        return;
    }


    adminMessage.textContent =
        "Suppression de l'activité...";


    const {
        error
    } = await supabase.rpc(
        "delete_activity",
        {
            p_activity_id: activity.id
        }
    );


    if (error) {

        console.error(
            "Erreur suppression activité :",
            error
        );

        adminMessage.textContent =
            "Impossible d'effectuer cette action.";
        showUserError(error);

        return;
    }


    adminMessage.textContent =
        `L'activité "${activity.title}" a été supprimée.`;


    await loadApprovedActivities();
}

/*
 * Modifie le statut d'une proposition.
 */
/*
 * Modifie le statut d'une proposition.
 */
async function updateProposalStatus(activityId, newStatus) {
    const action =
        newStatus === "approved"
            ? "approuver"
            : "refuser";

    const confirmed = confirm(
        `Voulez-vous ${action} cette proposition ?`
    );

    if (!confirmed) {
        return;
    }

    adminMessage.textContent =
        "Modification de la proposition...";

    const functionName =
        newStatus === "approved"
            ? "approve_activity"
            : "reject_activity";

    const { error } = await supabase.rpc(
        functionName,
        {
            p_activity_id: activityId
        }
    );

    if (error) {
        console.error(
            "Erreur modification proposition :",
            error
        );

        adminMessage.textContent =
            "Impossible d'effectuer cette action.";
        showUserError(error);

        return;
    }

    adminMessage.textContent =
        newStatus === "approved"
            ? "Proposition approuvée."
            : "Proposition refusée.";

    await loadProposals();
}


/*
 * Initialisation de la page.
 */
async function init() {
    const user = await getCurrentUser();

    if (!user) {
        adminContent.textContent =
            "Vous devez être connecté pour accéder à cette page.";

        return;
    }

    const isAdmin = await checkAdmin(user);

    if (!isAdmin) {
        adminContent.textContent =
            "Accès refusé. Cette page est réservée aux administrateurs.";

        return;
    }

    await loadMembers(user);
    await loadStatistics("day");
    await loadAdminLogs();
    await loadProposals();
    await loadApprovedActivities();
}


init();