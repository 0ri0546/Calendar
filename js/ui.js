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
