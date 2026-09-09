import { supabase, SITE_URL } from "./supabase.js?v=20260909-08";
import { initNotifications } from "./notifications.js?v=20260909-08";

function getAvatarDisplayUrl(url) {
    if (!url) {
        return url;
    }

    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}v=${Date.now()}`;
}



const authMenu = document.getElementById("auth-menu");

// Construit une URL absolue à partir de la racine du site.
// Cela évite les problèmes de chemins entre index.html et pages/*.html.
function siteUrl(path = "") {
    return new URL(path, SITE_URL).href;
}

function createLink(text, href) {
    const link = document.createElement("a");
    link.textContent = text;
    link.href = href;
    return link;
}

function createButton(text, id) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = id;
    button.textContent = text;
    return button;
}

function renderLoggedOut() {
    authMenu.replaceChildren(
        createLink("Connexion", siteUrl("pages/login.html"))
    );
}

function renderLoggedIn(profile, user) {
    const pseudo = profile?.pseudo || user.email || "Utilisateur";

    const userWrapper = document.createElement("div");
    userWrapper.className = "auth-user-menu";

    const userButton = document.createElement("button");
    userButton.type = "button";
    userButton.className = "auth-user";

    // Apparence du bouton profil : fond transparent et contour brun.
    // Les styles inline avec !important passent devant les règles CSS générales.
    userButton.style.setProperty("background", "transparent", "important");
    userButton.style.setProperty("border", "1px solid rgba(93,61,55,.82)", "important");
    userButton.style.setProperty("box-shadow", "none", "important");
    userButton.style.setProperty("min-height", "40px", "important");
    userButton.setAttribute("aria-haspopup", "menu");
    userButton.setAttribute("aria-expanded", "false");
    userButton.setAttribute("aria-label", `Ouvrir le menu de ${pseudo}`);

    if (profile?.avatar_url) {
        const avatar = document.createElement("img");
        avatar.src = getAvatarDisplayUrl(profile.avatar_url);
        avatar.alt = "";
        avatar.className = "auth-avatar";
        userButton.appendChild(avatar);
    }

    const pseudoElement = document.createElement("span");
    pseudoElement.textContent = pseudo;
    userButton.appendChild(pseudoElement);

    const arrow = document.createElement("span");
    arrow.className = "auth-user-arrow";
    arrow.textContent = "▾";
    arrow.setAttribute("aria-hidden", "true");
    userButton.appendChild(arrow);

    const menu = document.createElement("div");
    menu.className = "auth-dropdown";
    menu.setAttribute("role", "menu");
    menu.hidden = true;

    const profileLink = createLink("Profil", siteUrl("pages/profile.html"));
    profileLink.setAttribute("role", "menuitem");
    menu.appendChild(profileLink);

    if (profile?.role === "admin") {
        const adminLink = createLink("Administration", siteUrl("pages/admin.html"));
        adminLink.setAttribute("role", "menuitem");
        menu.appendChild(adminLink);
    }

    const logoutButton = createButton("Déconnexion", "logout-button");
    logoutButton.setAttribute("role", "menuitem");
    menu.appendChild(logoutButton);

    userWrapper.append(userButton, menu);
    authMenu.replaceChildren(userWrapper);

    initNotifications(authMenu, user);

    function closeMenu() {
        menu.hidden = true;
        userButton.setAttribute("aria-expanded", "false");
    }

    userButton.addEventListener("click", event => {
        event.stopPropagation();
        const willOpen = menu.hidden;
        menu.hidden = !willOpen;
        userButton.setAttribute("aria-expanded", String(willOpen));
    });

    menu.addEventListener("click", event => event.stopPropagation());
    document.addEventListener("click", closeMenu);
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeMenu();
        }
    });

    logoutButton.addEventListener("click", async () => {
        logoutButton.disabled = true;
        logoutButton.textContent = "Déconnexion...";

        const { error } = await supabase.auth.signOut();

        if (error) {
            console.error("Erreur déconnexion :", error);
            logoutButton.disabled = false;
            logoutButton.textContent = "Déconnexion";
            return;
        }

        window.location.href = siteUrl("pages/login.html");
    });
}

async function updateAuthUI() {
    if (!authMenu) {
        return;
    }

    const { data, error } = await supabase.auth.getUser();

    if (error) {
        if (error.name === "AuthSessionMissingError") {
            renderLoggedOut();
            return;
        }

        console.error("Erreur récupération utilisateur :", error);
        renderLoggedOut();
        return;
    }

    const user = data.user;

    if (!user) {
        renderLoggedOut();
        return;
    }

    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("pseudo, avatar_url, role")
        .eq("id", user.id)
        .single();

    if (profileError) {
        console.error("Erreur récupération profil :", profileError);
        renderLoggedIn(
            {
                pseudo: user.user_metadata?.full_name || user.email || "Utilisateur",
                avatar_url: null,
                role: "member"
            },
            user
        );
        return;
    }

    renderLoggedIn(profile, user);
}

// Vérifie l'état de la session au chargement de chaque page.
updateAuthUI();

// Réagit aux changements de session (connexion, déconnexion, refresh...).
// Le setTimeout évite de faire des appels Supabase imbriqués directement
// dans le callback d'authentification.
supabase.auth.onAuthStateChange((event, session) => {
    console.log("Auth event :", event);

    if (session?.user) {
        console.log("Session active :", session.user.email);
    } else {
        console.log("Utilisateur déconnecté");
    }

    setTimeout(() => {
        updateAuthUI();
    }, 0);
});
