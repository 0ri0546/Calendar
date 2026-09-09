const TOAST_ROOT_ID = "toast-root";

function getToastRoot() {
    let root = document.getElementById(TOAST_ROOT_ID);
    if (root) return root;

    root = document.createElement("div");
    root.id = TOAST_ROOT_ID;
    root.className = "toast-root";
    root.setAttribute("aria-live", "polite");
    root.setAttribute("aria-atomic", "true");
    document.body.appendChild(root);
    return root;
}

export function humanizeError(error, fallback = "Une erreur est survenue.") {
    const message = String(error?.message || error || "").toLowerCase();

    const known = [
        ["activity is full", "Cette activité est complète. Vous pouvez suivre la file d’attente pour être prévenu si une place se libère."],
        ["you are already participating", "Vous êtes déjà inscrit à cette activité."],
        ["activity not found", "Cette activité n'existe plus ou n'est plus disponible."],
        ["activity is not available", "Cette activité n'est plus disponible."],
        ["you must be authenticated", "Vous devez être connecté pour effectuer cette action."],
        ["you are not participating", "Vous n'êtes pas inscrit à cette activité."],
        ["already following", "Vous suivez déjà cette activité."],
        ["not following", "Vous ne suivez pas cette activité."],
        ["permission denied", "Vous n'avez pas les droits nécessaires pour effectuer cette action."],
        ["row-level security", "Cette action n'est pas autorisée avec votre compte."],
        ["duplicate key", "Cette action a déjà été effectuée."],
        ["network", "La connexion au serveur a échoué. Vérifiez votre connexion puis réessayez."]
    ];

    for (const [needle, translation] of known) {
        if (message.includes(needle)) return translation;
    }

    return fallback;
}

export function showToast(message, type = "error") {
    const root = getToastRoot();
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    toast.textContent = message;
    root.appendChild(toast);

    window.setTimeout(() => {
        toast.classList.add("is-leaving");
        window.setTimeout(() => toast.remove(), 180);
    }, 5000);
}


/**
 * Affiche une description en conservant ses retours à la ligne et
 * transforme automatiquement les URL HTTP(S) en liens cliquables.
 * Aucun HTML fourni par l'utilisateur n'est interprété.
 */
export function renderDescriptionWithLinks(container, text) {
    container.replaceChildren();

    const value = String(text ?? "");
    const urlPattern = /(https?:\/\/[^\s<]+)/gi;
    let lastIndex = 0;

    for (const match of value.matchAll(urlPattern)) {
        const index = match.index ?? 0;
        const rawUrl = match[0];

        if (index > lastIndex) {
            container.appendChild(document.createTextNode(value.slice(lastIndex, index)));
        }

        // La ponctuation finale appartient généralement à la phrase, pas à l'URL.
        const trailingMatch = rawUrl.match(/[.,!?;:)]+$/);
        const trailing = trailingMatch ? trailingMatch[0] : "";
        const href = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;

        if (href) {
            const link = document.createElement("a");
            link.href = href;
            link.textContent = href;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.className = "description-link";
            container.appendChild(link);
        }

        if (trailing) {
            container.appendChild(document.createTextNode(trailing));
        }

        lastIndex = index + rawUrl.length;
    }

    if (lastIndex < value.length) {
        container.appendChild(document.createTextNode(value.slice(lastIndex)));
    }
}
