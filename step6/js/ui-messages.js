const ERROR_MESSAGES = [
    [/Activity is full/i, "Cette activité est complète. Vous pouvez suivre la file d'attente pour être prévenu si une place se libère."],
    [/already participating|already joined|déjà participant/i, "Vous participez déjà à cette activité."],
    [/must be authenticated|not authenticated/i, "Vous devez être connecté pour effectuer cette action."],
    [/Activity not found/i, "Cette activité n'existe plus ou n'est plus disponible."],
    [/Activity is not available/i, "Cette activité n'est plus disponible."],
    [/not authorized|permission denied|row-level security/i, "Vous n'avez pas les droits nécessaires pour effectuer cette action."],
    [/not an admin|admin/i, "Cette action est réservée aux administrateurs."],
];

let toastTimer = null;

export function getHumanErrorMessage(error) {
    const raw = error?.message ?? String(error ?? "");
    const match = ERROR_MESSAGES.find(([pattern]) => pattern.test(raw));
    return match?.[1] ?? "Une erreur est survenue. Veuillez réessayer.";
}

export function showUserError(error, options = {}) {
    const message = options.message ?? getHumanErrorMessage(error);
    let toast = document.getElementById("app-toast");

    if (!toast) {
        toast = document.createElement("div");
        toast.id = "app-toast";
        toast.className = "app-toast";
        toast.setAttribute("role", "alert");
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add("is-visible");

    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 4500);
}
