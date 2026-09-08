import { supabase, SITE_URL } from "./supabase.js";

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
    const pseudo = profile.pseudo || user.email || "Utilisateur";

    const userContainer = document.createElement("span");
    userContainer.className = "auth-user";

    if (profile.avatar_url) {
        const avatar = document.createElement("img");
        avatar.src = profile.avatar_url;
        avatar.alt = `Photo de profil de ${pseudo}`;
        avatar.className = "auth-avatar";
        userContainer.appendChild(avatar);
    }

    const pseudoElement = document.createElement("span");
    pseudoElement.textContent = pseudo;
    userContainer.appendChild(pseudoElement);

    const profileLink = createLink("Profil", siteUrl("pages/profile.html"));
    const logoutButton = createButton("Déconnexion", "logout-button");

    authMenu.replaceChildren(userContainer, profileLink);

    if (profile.role === "admin") {
        authMenu.appendChild(
            createLink("Administration", siteUrl("pages/admin.html"))
        );
    }

    authMenu.appendChild(logoutButton);

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
        console.error("Erreur récupération utilisateur :", error);
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
