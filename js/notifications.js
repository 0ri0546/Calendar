import { supabase, SITE_URL } from "./supabase.js?v=20260909-05";

const NOTIFICATION_TYPES = new Set([
    "place_opened",
    "activity_updated",
    "activity_deleted",
    "role_changed"
]);

let currentUserId = null;
let channel = null;
let notifications = [];
let elements = null;

function siteUrl(path = "") {
    return new URL(path, SITE_URL).href;
}

function formatRelativeDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "À l'instant";
    if (minutes < 60) return `Il y a ${minutes} min`;
    if (hours < 24) return `Il y a ${hours} h`;
    if (days < 7) return `Il y a ${days} j`;

    return date.toLocaleDateString("fr-FR");
}

function getNotificationContent(notification) {
    const data = notification.data ?? {};

    switch (notification.type) {
        case "place_opened":
            return {
                title: "Une place s'est libérée",
                message: data.title
                    ? `Une place est disponible pour « ${data.title} ».`
                    : "Une place est disponible pour une activité que vous suivez."
            };
        case "activity_updated": {
            const title = data.after?.title ?? data.title ?? "une activité";
            return {
                title: "Activité modifiée",
                message: `« ${title} » a été modifiée.`
            };
        }
        case "activity_deleted":
            return {
                title: "Activité supprimée",
                message: data.title
                    ? `« ${data.title} » a été supprimée.`
                    : "Une activité à laquelle vous participiez a été supprimée."
            };
        case "role_changed":
            return {
                title: "Rôle modifié",
                message: data.new_role === "admin"
                    ? "Vous avez été promu administrateur."
                    : "Votre rôle est maintenant membre."
            };
        default:
            return {
                title: "Nouvelle notification",
                message: "Une nouvelle notification est disponible."
            };
    }
}

function getActivityId(notification) {
    return notification.activity_id ?? null;
}

function createNotificationItem(notification) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "notification-item";
    item.dataset.notificationId = notification.id;

    if (!notification.read_at) {
        item.classList.add("is-unread");
    }

    const content = getNotificationContent(notification);

    const title = document.createElement("strong");
    title.className = "notification-item-title";
    title.textContent = content.title;

    const message = document.createElement("span");
    message.className = "notification-item-message";
    message.textContent = content.message;

    const date = document.createElement("span");
    date.className = "notification-item-date";
    date.textContent = formatRelativeDate(notification.created_at);

    item.append(title, message, date);

    item.addEventListener("click", async () => {
        await markAsRead(notification.id);

        const activityId = getActivityId(notification);
        if (activityId && notification.type !== "role_changed") {
            window.location.href = siteUrl(
                `pages/calendar.html?activity=${encodeURIComponent(activityId)}`
            );
            return;
        }

        render();
    });

    return item;
}

async function markAsRead(id) {
    const { error } = await supabase.rpc("mark_notification_read", {
        p_notification_id: id
    });

    if (error) {
        console.error("Erreur marquage notification :", error);
        return false;
    }

    const notification = notifications.find(item => item.id === id);
    if (notification) {
        notification.read_at = new Date().toISOString();
    }

    render();
    return true;
}

async function markAllAsRead() {
    const { error } = await supabase.rpc("mark_all_notifications_read");

    if (error) {
        console.error("Erreur marquage de toutes les notifications :", error);
        return;
    }

    const now = new Date().toISOString();
    notifications.forEach(notification => {
        notification.read_at = notification.read_at ?? now;
    });

    render();
}

async function loadNotifications() {
    if (!currentUserId) {
        notifications = [];
        render();
        return;
    }

    const { data, error } = await supabase
        .from("notification_events")
        .select("id, type, activity_id, data, created_at, read_at, status")
        .eq("user_id", currentUserId)
        .in("type", [...NOTIFICATION_TYPES])
        .order("created_at", { ascending: false })
        .limit(20);

    if (error) {
        console.error("Erreur récupération notifications :", error);
        notifications = [];
        render();
        return;
    }

    notifications = data ?? [];
    render();
}

function render() {
    if (!elements) return;

    const unreadCount = notifications.filter(item => !item.read_at).length;
    elements.badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    elements.badge.hidden = unreadCount === 0;
    elements.markAll.hidden = unreadCount === 0;
    elements.button.classList.toggle("has-unread", unreadCount > 0);

    elements.list.replaceChildren();

    if (notifications.length === 0) {
        const empty = document.createElement("p");
        empty.className = "notification-empty";
        empty.textContent = "Aucune notification.";
        elements.list.appendChild(empty);
        return;
    }

    notifications.forEach(notification => {
        elements.list.appendChild(createNotificationItem(notification));
    });
}

function closePanel() {
    if (!elements) return;
    elements.panel.hidden = true;
    elements.button.setAttribute("aria-expanded", "false");
}

function createUI(authMenu) {
    const wrapper = document.createElement("div");
    wrapper.className = "notifications-wrapper";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "notification-button";
    button.setAttribute("aria-label", "Notifications");
    button.setAttribute("aria-expanded", "false");
    button.textContent = "🔔";

    const badge = document.createElement("span");
    badge.className = "notification-badge";
    badge.hidden = true;
    button.appendChild(badge);

    const panel = document.createElement("div");
    panel.className = "notification-panel";
    panel.hidden = true;

    const header = document.createElement("div");
    header.className = "notification-panel-header";

    const heading = document.createElement("strong");
    heading.textContent = "Notifications";

    const markAll = document.createElement("button");
    markAll.type = "button";
    markAll.className = "notification-mark-all";
    markAll.textContent = "Tout lire";
    markAll.hidden = true;
    markAll.addEventListener("click", markAllAsRead);

    header.append(heading, markAll);

    const list = document.createElement("div");
    list.className = "notification-list";

    panel.append(header, list);
    wrapper.append(button, panel);

    button.addEventListener("click", async event => {
        event.stopPropagation();
        const isOpen = !panel.hidden;
        panel.hidden = isOpen;
        button.setAttribute("aria-expanded", String(!isOpen));

        if (!isOpen) {
            await loadNotifications();
        }
    });

    panel.addEventListener("click", event => event.stopPropagation());

    document.addEventListener("click", closePanel);

    authMenu.appendChild(wrapper);

    elements = { wrapper, button, badge, panel, list, markAll };
    render();
}

function subscribeRealtime() {
    if (!currentUserId) return;

    if (channel) {
        supabase.removeChannel(channel);
    }

    channel = supabase
        .channel(`notifications-${currentUserId}`)
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "notification_events",
                filter: `user_id=eq.${currentUserId}`
            },
            payload => {
                const notification = payload.new;
                if (!NOTIFICATION_TYPES.has(notification.type)) return;

                notifications = [notification, ...notifications]
                    .filter((item, index, array) =>
                        array.findIndex(candidate => candidate.id === item.id) === index
                    )
                    .slice(0, 20);

                render();
            }
        )
        .subscribe(status => {
            if (status === "CHANNEL_ERROR") {
                console.error("Erreur Realtime notifications");
            }
        });
}

export async function initNotifications(authMenu, user) {
    if (!authMenu) return;

    if (channel) {
        await supabase.removeChannel(channel);
        channel = null;
    }

    currentUserId = user?.id ?? null;
    notifications = [];
    elements = null;

    if (!currentUserId) return;

    createUI(authMenu);
    await loadNotifications();
    subscribeRealtime();
}
