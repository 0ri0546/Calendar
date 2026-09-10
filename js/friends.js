import { supabase, SITE_URL } from "./supabase.js?v=20260910-52";

let currentUserId = null;
let elements = null;
let friendsData = [];
let onlineFriendIds = new Set();
let presenceChannel = null;

function siteUrl(path = "") {
    return new URL(path, SITE_URL).href;
}

function avatarUrl(url) {
    if (!url) return null;
    return `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
}

function normalizeWhatsappNumber(phone) {
    let value = String(phone ?? "").trim().replace(/[^0-9+]/g, "");
    if (value.startsWith("00")) value = "+" + value.slice(2);
    if (value.startsWith("+")) return value.slice(1);
    if (value.startsWith("0")) return "33" + value.slice(1);
    return value;
}

function getOnlineIdsFromPresence(state) {
    const ids = new Set();

    Object.values(state ?? {}).forEach(presences => {
        (presences ?? []).forEach(presence => {
            if (presence?.user_id) {
                ids.add(String(presence.user_id));
            }
        });
    });

    return ids;
}

function updateOnlineState(state) {
    const allOnlineIds = getOnlineIdsFromPresence(state);
    onlineFriendIds = new Set(
        friendsData
            .map(friend => String(friend.id))
            .filter(id => allOnlineIds.has(id))
    );

    renderFriendList();
    renderHomeOnlineFriends();
}

function createOnlineDot(isOnline) {
    const dot = document.createElement("span");
    dot.className = `friend-online-dot${isOnline ? " is-online" : ""}`;
    dot.title = isOnline ? "En ligne" : "Hors ligne";
    dot.setAttribute("aria-label", isOnline ? "En ligne" : "Hors ligne");
    return dot;
}

function createFriendCard(friend) {
    const card = document.createElement("article");
    card.className = "friend-card";

    if (friend.avatar_url) {
        const img = document.createElement("img");
        img.className = "friend-avatar";
        img.src = avatarUrl(friend.avatar_url);
        img.alt = "";
        card.appendChild(img);
    }

    const info = document.createElement("div");
    info.className = "friend-card-info";

    const nameRow = document.createElement("div");
    nameRow.className = "friend-name-row";

    const name = document.createElement("strong");
    name.textContent = friend.pseudo || "Utilisateur";

    nameRow.append(name);

    if (onlineFriendIds.has(String(friend.id))) {
        nameRow.appendChild(createOnlineDot(true));
    }

    const code = document.createElement("span");
    code.textContent = `Code : ${friend.friend_code || "—"}`;
    info.append(nameRow, code);
    card.appendChild(info);

    const contact = document.createElement("a");
    contact.className = "friend-whatsapp";
    const number = normalizeWhatsappNumber(friend.phone);

    if (number) {
        contact.href = `https://wa.me/${number}`;
        contact.target = "_blank";
        contact.rel = "noopener noreferrer";
        contact.textContent = "WhatsApp";
    } else {
        contact.classList.add("is-disabled");
        contact.textContent = "Numéro non renseigné";
        contact.setAttribute("aria-disabled", "true");
    }

    card.appendChild(contact);
    return card;
}

function renderFriendList() {
    if (!elements?.list) return;

    elements.list.replaceChildren();

    if (!friendsData.length) {
        const empty = document.createElement("p");
        empty.className = "friends-empty";
        empty.textContent = "Aucun ami pour le moment.";
        elements.list.appendChild(empty);
        return;
    }

    friendsData.forEach(friend => {
        elements.list.appendChild(createFriendCard(friend));
    });
}

function renderHomeOnlineFriends() {
    const container = document.getElementById("home-online-friends");
    if (!container) return;

    container.replaceChildren();

    const onlineFriends = friendsData.filter(friend =>
        onlineFriendIds.has(String(friend.id))
    );

    if (!onlineFriends.length) {
        const empty = document.createElement("p");
        empty.className = "home-online-empty";
        empty.textContent = "Aucun ami en ligne actuellement.";
        container.appendChild(empty);
        return;
    }

    onlineFriends.forEach(friend => {
        const item = document.createElement("div");
        item.className = "home-online-friend";

        if (friend.avatar_url) {
            const img = document.createElement("img");
            img.className = "home-online-avatar";
            img.src = avatarUrl(friend.avatar_url);
            img.alt = "";
            item.appendChild(img);
        }

        const name = document.createElement("strong");
        name.textContent = friend.pseudo || "Utilisateur";

        item.append(name, createOnlineDot(true));
        container.appendChild(item);
    });
}

async function loadFriends() {
    const { data, error } = await supabase.rpc("get_friends");

    if (error) {
        console.error("Erreur récupération amis :", error);
        friendsData = [];
        renderFriendList();
        renderHomeOnlineFriends();
        return;
    }

    friendsData = Array.isArray(data) ? data : [];
    renderFriendList();
    renderHomeOnlineFriends();
}

async function loadRequests() {
    const { data, error } = await supabase.rpc("get_friend_requests");
    elements.requests.replaceChildren();

    if (error) {
        console.error("Erreur récupération demandes d'amis :", error);
        return;
    }

    if (!data?.length) {
        elements.requests.hidden = true;
        elements.requestsTitle.hidden = true;
        return;
    }

    elements.requests.hidden = false;
    elements.requestsTitle.hidden = false;

    data.forEach(request => {
        const row = document.createElement("div");
        row.className = "friend-request";

        const name = document.createElement("strong");
        name.textContent = request.requester_pseudo || "Utilisateur";

        const actions = document.createElement("div");
        actions.className = "friend-request-actions";

        const accept = document.createElement("button");
        accept.type = "button";
        accept.textContent = "Accepter";

        const reject = document.createElement("button");
        reject.type = "button";
        reject.textContent = "Refuser";

        accept.addEventListener("click", () => respond(request.id, true));
        reject.addEventListener("click", () => respond(request.id, false));

        actions.append(accept, reject);
        row.append(name, actions);
        elements.requests.appendChild(row);
    });
}

async function respond(id, accepted) {
    const { error } = await supabase.rpc("respond_friend_request", {
        p_request_id: id,
        p_accept: accepted
    });

    if (error) {
        console.error("Erreur réponse demande d'ami :", error);
        return;
    }

    await loadRequests();
    await loadFriends();
}

async function addFriend() {
    const code = elements.codeInput.value.trim();
    if (!code) return;

    elements.addButton.disabled = true;

    const { error } = await supabase.rpc("send_friend_request", {
        p_friend_code: code
    });

    elements.addButton.disabled = false;

    if (error) {
        const messages = {
            friend_code_not_found: "Code ami introuvable.",
            cannot_add_self: "Tu ne peux pas t'ajouter toi-même.",
            already_friends: "Cet utilisateur est déjà dans tes amis.",
            request_already_exists: "Une demande existe déjà entre vous."
        };

        elements.addMessage.textContent =
            messages[error.message] || "Impossible d'envoyer la demande.";
        return;
    }

    elements.codeInput.value = "";
    elements.addMessage.textContent = "Demande d'ami envoyée !";
}

async function refresh() {
    if (!currentUserId) return;
    await Promise.all([loadFriends(), loadRequests()]);
}

function startPresence(user) {
    if (!user?.id) return;

    if (presenceChannel) {
        supabase.removeChannel(presenceChannel);
        presenceChannel = null;
    }

    presenceChannel = supabase.channel("calendar-online-users", {
        config: {
            presence: {
                key: user.id
            }
        }
    });

    presenceChannel
        .on("presence", { event: "sync" }, () => {
            updateOnlineState(presenceChannel.presenceState());
        })
        .on("presence", { event: "join" }, () => {
            updateOnlineState(presenceChannel.presenceState());
        })
        .on("presence", { event: "leave" }, () => {
            updateOnlineState(presenceChannel.presenceState());
        })
        .subscribe(async status => {
            if (status === "SUBSCRIBED") {
                const { error } = await presenceChannel.track({
                    user_id: user.id
                });

                if (error) {
                    console.error("Erreur présence utilisateur :", error);
                }
            }
        });
}

function createUI(authMenu) {
    const wrapper = document.createElement("div");
    wrapper.className = "friends-wrapper";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "friends-button";
    button.textContent = "👥";
    button.setAttribute("aria-label", "Amis");
    button.setAttribute("aria-expanded", "false");

    const panel = document.createElement("div");
    panel.className = "friends-panel";
    panel.hidden = true;

    const header = document.createElement("div");
    header.className = "friends-panel-header";

    const title = document.createElement("strong");
    title.textContent = "Amis";
    header.appendChild(title);

    const codeBox = document.createElement("div");
    codeBox.className = "friend-code-box";

    const codeLabel = document.createElement("span");
    codeLabel.textContent = "Mon code ami";

    const codeValue = document.createElement("strong");
    codeValue.textContent = "…";

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copier";

    copy.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(codeValue.textContent);
        } catch {}

        copy.textContent = "Copié !";
        setTimeout(() => copy.textContent = "Copier", 1200);
    });

    codeBox.append(codeLabel, codeValue, copy);

    const add = document.createElement("div");
    add.className = "friend-add";

    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 16;
    input.placeholder = "Code ami";

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.textContent = "Ajouter";

    const addMessage = document.createElement("p");
    addMessage.className = "friend-add-message";

    addButton.addEventListener("click", addFriend);
    input.addEventListener("keydown", e => {
        if (e.key === "Enter") addFriend();
    });

    add.append(input, addButton);

    const requestsTitle = document.createElement("h4");
    requestsTitle.textContent = "Demandes reçues";

    const requests = document.createElement("div");
    requests.className = "friend-requests";

    const listTitle = document.createElement("h4");
    listTitle.textContent = "Mes amis";

    const list = document.createElement("div");
    list.className = "friends-list";

    panel.append(
        header,
        codeBox,
        add,
        addMessage,
        requestsTitle,
        requests,
        listTitle,
        list
    );

    wrapper.append(button, panel);

    button.addEventListener("click", async e => {
        e.stopPropagation();

        const open = panel.getAttribute("data-open") === "true";

        if (open) {
            panel.setAttribute("data-open", "false");
            panel.classList.remove("polish-panel-open");
            button.setAttribute("aria-expanded", "false");
            window.setTimeout(() => {
                if (panel.getAttribute("data-open") !== "true") panel.hidden = true;
            }, 500);
            return;
        }

        panel.hidden = false;
        panel.setAttribute("data-open", "true");
        panel.classList.remove("polish-panel-open");
        void panel.offsetWidth;
        requestAnimationFrame(() => panel.classList.add("polish-panel-open"));
        button.setAttribute("aria-expanded", "true");
        await refresh();
    });

    panel.addEventListener("click", e => e.stopPropagation());

    document.addEventListener("click", () => {
        if (panel.getAttribute("data-open") !== "true") return;
        panel.setAttribute("data-open", "false");
        panel.classList.remove("polish-panel-open");
        button.setAttribute("aria-expanded", "false");
        window.setTimeout(() => {
            if (panel.getAttribute("data-open") !== "true") panel.hidden = true;
        }, 500);
    });

    authMenu.appendChild(wrapper);

    elements = {
        wrapper,
        button,
        panel,
        codeValue,
        codeInput: input,
        addButton,
        addMessage,
        requests,
        requestsTitle,
        list
    };

    renderFriendList();

    return {
        setCode: code => {
            codeValue.textContent = code || "—";
        }
    };
}

export async function initFriends(authMenu, user) {
    currentUserId = user?.id ?? null;

    if (!currentUserId || !authMenu) return;

    const api = createUI(authMenu);

    const { data, error } = await supabase
        .from("profiles")
        .select("friend_code")
        .eq("id", currentUserId)
        .single();

    if (error) {
        console.error("Erreur récupération code ami :", error);
    }

    api.setCode(data?.friend_code);

    // La présence est purement informative : aucune action n'est déclenchée
    // lorsqu'un ami passe en ligne ou hors ligne.
    startPresence(user);

    // La page d'accueil possède sa propre case "Amis en ligne".
    // On charge donc les amis immédiatement uniquement lorsqu'elle existe.
    if (document.getElementById("home-online-friends")) {
        await loadFriends();
    }
}
