import { supabase } from "./supabase.js?v=20260909-32";
import { uploadActivityImage, removeActivityImage, validateActivityImage } from "./activity-media.js?v=20260909-32";

const form = document.getElementById("activity-form");
const message = document.getElementById("activity-form-message");
const imageInput = document.getElementById("activity-image");
const imagePreview = document.getElementById("activity-image-preview");
const proposeButton = document.getElementById("propose-submit-button");
const approveButton = document.getElementById("approve-submit-button");
let currentUserIsAdmin = false;

function setMessage(text, type = "") {
    message.textContent = text;
    message.className = `form-message ${type}`.trim();
}

function getSixMonthCalendarLimit() {
    const date = new Date();
    date.setMonth(date.getMonth() + 6);
    return date.toISOString().slice(0, 10);
}

function showImagePreview(file) {
    imagePreview.replaceChildren();

    if (!file) {
        return;
    }

    try {
        validateActivityImage(file);
    } catch (error) {
        setMessage(error.message, "error");
        imageInput.value = "";
        return;
    }

    const image = document.createElement("img");
    image.className = "activity-image-preview";
    image.alt = "Aperçu de l'image de l'activité";
    image.src = URL.createObjectURL(file);
    image.addEventListener("load", () => URL.revokeObjectURL(image.src), { once: true });
    imagePreview.appendChild(image);
}

async function loadCurrentUserRole() {
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
        currentUserIsAdmin = false;
        return;
    }

    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .single();

    currentUserIsAdmin = !profileError && profile?.role === "admin";

    if (approveButton) {
        approveButton.hidden = !currentUserIsAdmin;
    }
}

loadCurrentUserRole();

// La session Supabase peut être restaurée après le chargement du module.
// On revérifie donc le rôle dès qu'une session devient disponible ou change.
supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
        setTimeout(() => {
            loadCurrentUserRole();
        }, 0);
    } else {
        currentUserIsAdmin = false;
        if (approveButton) approveButton.hidden = true;
    }
});

imageInput?.addEventListener("change", () => {
    showImagePreview(imageInput.files?.[0] || null);
});

async function submitActivity({ validateDirectly = false } = {}) {
    const submitButton = validateDirectly ? approveButton : proposeButton;
    const otherButton = validateDirectly ? proposeButton : approveButton;

    if (submitButton) submitButton.disabled = true;
    if (otherButton) otherButton.disabled = true;
    setMessage(validateDirectly ? "Validation de l'activité..." : "Envoi de la proposition...");

    let uploadedImage = null;
    let activityId = null;

    try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
            throw new Error("Vous devez être connecté pour proposer une activité.");
        }

        const user = userData.user;
        activityId = crypto.randomUUID();
        const imageFile = imageInput?.files?.[0] || null;

        if (imageFile) {
            uploadedImage = await uploadActivityImage(imageFile, user.id, activityId);
        }

        const payload = {
            id: activityId,
            title: document.getElementById("activity-title").value.trim(),
            description: document.getElementById("activity-description").value.trim() || null,
            date: document.getElementById("activity-date").value,
            start_time: document.getElementById("activity-start-time").value,
            end_time: document.getElementById("activity-end-time").value || null,
            min_players: Number(document.getElementById("activity-min-players").value),
            max_players: Number(document.getElementById("activity-max-players").value),
            location: document.getElementById("activity-location").value.trim() || null,
            is_event: document.getElementById("activity-is-event").checked,
            image_url: uploadedImage?.url || null,
            created_by: user.id,
            status: "pending"
        };

        const { error: insertError } = await supabase.from("activities").insert(payload);
        if (insertError) throw insertError;

        if (validateDirectly) {
            if (!currentUserIsAdmin) {
                throw new Error("Seuls les administrateurs peuvent valider directement une activité.");
            }

            const { error: approveError } = await supabase.rpc("approve_activity", {
                p_activity_id: activityId
            });

            if (approveError) throw approveError;
        }

        form.reset();
        imagePreview.replaceChildren();
        setMessage(
            validateDirectly
                ? "Activité validée directement et publiée."
                : "Proposition envoyée. Elle sera visible après validation par un administrateur.",
            "success"
        );
    } catch (error) {
        if (uploadedImage?.path) {
            await removeActivityImage(uploadedImage.path);
        }

        console.error("Erreur proposition activité :", error);
        setMessage(error.message || "Impossible d'envoyer la proposition.", "error");
    } finally {
        if (submitButton) submitButton.disabled = false;
        if (otherButton) otherButton.disabled = false;
    }
}

form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitActivity({ validateDirectly: false });
});

approveButton?.addEventListener("click", async () => {
    if (!currentUserIsAdmin) return;

    const confirmed = confirm("Valider directement cette activité ?");
    if (!confirmed) return;

    await submitActivity({ validateDirectly: true });
});

const dateInput = document.getElementById("activity-date");
if (dateInput) {
    const today = new Date().toISOString().slice(0, 10);
    dateInput.min = today;
    dateInput.max = getSixMonthCalendarLimit();
}
