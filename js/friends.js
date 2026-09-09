import { supabase, SITE_URL } from "./supabase.js?v=20260909-35";

let currentUserId = null;
let elements = null;

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
    const name = document.createElement("strong");
    name.textContent = friend.pseudo || "Utilisateur";
    const code = document.createElement("span");
    code.textContent = `Code : ${friend.friend_code || "—"}`;
    info.append(name, code);
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

async function loadFriends() {
    const { data, error } = await supabase.rpc("get_friends");
    elements.list.replaceChildren();
    if (error) {
        console.error("Erreur récupération amis :", error);
        const empty = document.createElement("p");
        empty.className = "friends-empty";
        empty.textContent = "Impossible de charger la liste d'amis.";
        elements.list.appendChild(empty);
        return;
    }
    if (!data?.length) {
        const empty = document.createElement("p");
        empty.className = "friends-empty";
        empty.textContent = "Aucun ami pour le moment.";
        elements.list.appendChild(empty);
        return;
    }
    data.forEach(friend => elements.list.appendChild(createFriendCard(friend)));
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
        accept.type = "button"; accept.textContent = "Accepter";
        const reject = document.createElement("button");
        reject.type = "button"; reject.textContent = "Refuser";
        accept.addEventListener("click", () => respond(request.id, true));
        reject.addEventListener("click", () => respond(request.id, false));
        actions.append(accept, reject);
        row.append(name, actions);
        elements.requests.appendChild(row);
    });
}

async function respond(id, accepted) {
    const { error } = await supabase.rpc("respond_friend_request", { p_request_id: id, p_accept: accepted });
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
    const { error } = await supabase.rpc("send_friend_request", { p_friend_code: code });
    elements.addButton.disabled = false;
    if (error) {
        const messages = {
            friend_code_not_found: "Code ami introuvable.",
            cannot_add_self: "Tu ne peux pas t'ajouter toi-même.",
            already_friends: "Cet utilisateur est déjà dans tes amis.",
            request_already_exists: "Une demande existe déjà entre vous."
        };
        elements.addMessage.textContent = messages[error.message] || "Impossible d'envoyer la demande.";
        return;
    }
    elements.codeInput.value = "";
    elements.addMessage.textContent = "Demande d'ami envoyée !";
}

async function refresh() {
    if (!currentUserId) return;
    await Promise.all([loadFriends(), loadRequests()]);
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
    copy.type = "button"; copy.textContent = "Copier";
    copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(codeValue.textContent); } catch {}
        copy.textContent = "Copié !";
        setTimeout(() => copy.textContent = "Copier", 1200);
    });
    codeBox.append(codeLabel, codeValue, copy);

    const add = document.createElement("div");
    add.className = "friend-add";
    const input = document.createElement("input");
    input.type = "text"; input.maxLength = 16; input.placeholder = "Code ami";
    const addButton = document.createElement("button");
    addButton.type = "button"; addButton.textContent = "Ajouter";
    const addMessage = document.createElement("p");
    addMessage.className = "friend-add-message";
    addButton.addEventListener("click", addFriend);
    input.addEventListener("keydown", e => { if (e.key === "Enter") addFriend(); });
    add.append(input, addButton);

    const requestsTitle = document.createElement("h4");
    requestsTitle.textContent = "Demandes reçues";
    const requests = document.createElement("div");
    requests.className = "friend-requests";
    const listTitle = document.createElement("h4");
    listTitle.textContent = "Mes amis";
    const list = document.createElement("div");
    list.className = "friends-list";
    panel.append(header, codeBox, add, addMessage, requestsTitle, requests, listTitle, list);
    wrapper.append(button, panel);
    button.addEventListener("click", async e => {
        e.stopPropagation();
        const open = !panel.hidden;
        panel.hidden = open;
        button.setAttribute("aria-expanded", String(!open));
        if (!open) await refresh();
    });
    panel.addEventListener("click", e => e.stopPropagation());
    document.addEventListener("click", () => { panel.hidden = true; button.setAttribute("aria-expanded", "false"); });
    authMenu.appendChild(wrapper);
    elements = { wrapper, button, panel, codeValue, codeInput: input, addButton, addMessage, requests, requestsTitle, list };
    return { setCode: code => { codeValue.textContent = code || "—"; } };
}

export async function initFriends(authMenu, user) {
    currentUserId = user?.id ?? null;
    if (!currentUserId || !authMenu) return;
    const api = createUI(authMenu);
    const { data, error } = await supabase.from("profiles").select("friend_code").eq("id", currentUserId).single();
    if (error) console.error("Erreur récupération code ami :", error);
    api.setCode(data?.friend_code);
}
