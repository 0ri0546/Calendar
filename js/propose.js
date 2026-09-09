import { supabase } from "./supabase.js?v=20260909-06";
import { uploadActivityImage, removeActivityImage, validateActivityImage } from "./activity-media.js?v=20260909-06";

const form = document.getElementById("activity-form");
const message = document.getElementById("activity-form-message");
const imageInput = document.getElementById("activity-image");
const imagePreview = document.getElementById("activity-image-preview");

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

imageInput?.addEventListener("change", () => {
    showImagePreview(imageInput.files?.[0] || null);
});

form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector("button[type=submit]");
    submitButton.disabled = true;
    setMessage("Envoi de la proposition...");

    let uploadedImage = null;

    try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
            throw new Error("Vous devez être connecté pour proposer une activité.");
        }

        const user = userData.user;
        const activityId = crypto.randomUUID();
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

        const { error } = await supabase
            .from("activities")
            .insert(payload);

        if (error) {
            throw error;
        }

        form.reset();
        imagePreview.replaceChildren();
        setMessage("Proposition envoyée. Elle sera visible après validation par un administrateur.", "success");
    } catch (error) {
        if (uploadedImage?.path) {
            await removeActivityImage(uploadedImage.path);
        }

        console.error("Erreur proposition activité :", error);
        setMessage(error.message || "Impossible d'envoyer la proposition.", "error");
    } finally {
        submitButton.disabled = false;
    }
});

const dateInput = document.getElementById("activity-date");
if (dateInput) {
    const today = new Date().toISOString().slice(0, 10);
    dateInput.min = today;
    dateInput.max = getSixMonthCalendarLimit();
}
