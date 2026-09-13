import { supabase } from "./supabase.js?v=20260910-57";
import { sfx } from "./sfx.js?v=20260913-sfx";
import { uploadActivityImage, removeActivityImage, validateActivityImage } from "./activity-media.js?v=20260913-01";

const preparedForm = document.getElementById("activity-form");
const freeForm = document.getElementById("free-activity-form");
const message = document.getElementById("activity-form-message");
const imageInput = document.getElementById("activity-image");
const imagePreview = document.getElementById("activity-image-preview");
const proposeButton = document.getElementById("propose-submit-button");
const approveButton = document.getElementById("approve-submit-button");
const freeProposeButton = document.getElementById("free-propose-submit-button");
const freeApproveButton = document.getElementById("free-approve-submit-button");
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

    if (!file) return;

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
        if (approveButton) approveButton.hidden = true;
        if (freeApproveButton) freeApproveButton.hidden = true;
        return;
    }

    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .single();

    currentUserIsAdmin = !profileError && profile?.role === "admin";

    if (approveButton) approveButton.hidden = !currentUserIsAdmin;
    if (freeApproveButton) freeApproveButton.hidden = !currentUserIsAdmin;
}

loadCurrentUserRole();

supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
        setTimeout(loadCurrentUserRole, 0);
    } else {
        currentUserIsAdmin = false;
        if (approveButton) approveButton.hidden = true;
        if (freeApproveButton) freeApproveButton.hidden = true;
    }
});

imageInput?.addEventListener("change", () => {
    showImagePreview(imageInput.files?.[0] || null);
});

function animateProposalAccordion(content, open) {
    if (!content) return;

    content.hidden = false;
    const startHeight = open ? 0 : content.scrollHeight;
    const endHeight = open ? content.scrollHeight : 0;

    content.style.overflow = "hidden";
    content.style.maxHeight = `${startHeight}px`;
    content.style.opacity = open ? "0" : "1";
    content.style.transform = open ? "translateY(-6px)" : "translateY(0)";

    requestAnimationFrame(() => {
        content.style.transition = [
            "max-height 500ms cubic-bezier(.22,1,.36,1)",
            "opacity 500ms ease",
            "transform 500ms cubic-bezier(.22,1,.36,1)"
        ].join(", ");
        content.style.maxHeight = `${endHeight}px`;
        content.style.opacity = open ? "1" : "0";
        content.style.transform = open ? "translateY(0)" : "translateY(-6px)";
    });

    window.setTimeout(() => {
        content.style.transition = "";
        if (open) {
            content.style.maxHeight = "none";
            content.style.opacity = "1";
            content.style.transform = "none";
        } else {
            content.hidden = true;
            content.style.maxHeight = "";
            content.style.opacity = "";
            content.style.transform = "";
        }
    }, 500);
}

function setupAccordion() {
    document.querySelectorAll(".proposal-accordion-toggle").forEach(toggle => {
        toggle.addEventListener("click", () => {
            const accordion = toggle.closest(".proposal-accordion");
            const content = accordion?.querySelector(".proposal-accordion-content");
            if (!accordion || !content) return;

            const shouldOpen = toggle.getAttribute("aria-expanded") !== "true";
            toggle.setAttribute("aria-expanded", String(shouldOpen));
            accordion.classList.toggle("is-open", shouldOpen);
            animateProposalAccordion(content, shouldOpen);
        });
    });
}

setupAccordion();

function setButtonsDisabled(buttons, disabled) {
    buttons.filter(Boolean).forEach((button) => {
        button.disabled = disabled;
    });
}

async function submitPreparedActivity({ validateDirectly = false } = {}) {
    setButtonsDisabled([proposeButton, approveButton], true);
    setMessage(validateDirectly ? "Validation de l'activité..." : "Envoi de la proposition...");

    let uploadedImage = null;
    let activityId = null;

    try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) throw new Error("Vous devez être connecté pour proposer une activité.");

        const user = userData.user;
        activityId = crypto.randomUUID();
        const imageFile = imageInput?.files?.[0] || null;

        if (imageFile) {
            uploadedImage = await uploadActivityImage(imageFile, user.id, activityId);
        }

        const payload = {
            id: activityId,
            activity_type: "prepared",
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
            if (!currentUserIsAdmin) throw new Error("Seuls les administrateurs peuvent valider directement une activité.");
            const { error: approveError } = await supabase.rpc("approve_activity", { p_activity_id: activityId });
            if (approveError) throw approveError;
        }

        preparedForm.reset();
        imagePreview.replaceChildren();

        if (validateDirectly) sfx.activityValidated();
        else sfx.activityProposed();
        setMessage(
            validateDirectly
                ? "Activité validée directement et publiée."
                : "Proposition envoyée. Elle sera visible après validation par un administrateur.",
            "success"
        );
    } catch (error) {
        if (uploadedImage?.path) await removeActivityImage(uploadedImage.path);
        console.error("Erreur proposition activité :", error);
        setMessage(error.message || "Impossible d'envoyer la proposition.", "error");
    } finally {
        setButtonsDisabled([proposeButton, approveButton], false);
    }
}

async function submitFreeActivity({ validateDirectly = false } = {}) {
    setButtonsDisabled([freeProposeButton, freeApproveButton], true);
    setMessage(validateDirectly ? "Validation de l'activité..." : "Envoi de la proposition...");

    let activityId = null;

    try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) throw new Error("Vous devez être connecté pour proposer une activité.");

        const user = userData.user;
        activityId = crypto.randomUUID();

        const payload = {
            id: activityId,
            activity_type: "free",
            title: document.getElementById("free-activity-title").value.trim(),
            description: document.getElementById("free-activity-description").value.trim(),
            date: document.getElementById("free-activity-date").value,
            start_time: document.getElementById("free-activity-start-time").value,
            end_time: document.getElementById("free-activity-end-time").value,
            min_players: null,
            max_players: null,
            location: document.getElementById("free-activity-location").value.trim(),
            is_event: document.getElementById("free-activity-is-event").checked,
            image_url: null,
            created_by: user.id,
            status: "pending"
        };

        const { error: insertError } = await supabase.from("activities").insert(payload);
        if (insertError) throw insertError;

        if (validateDirectly) {
            if (!currentUserIsAdmin) throw new Error("Seuls les administrateurs peuvent valider directement une activité.");
            const { error: approveError } = await supabase.rpc("approve_activity", { p_activity_id: activityId });
            if (approveError) throw approveError;
        }

        freeForm.reset();

        if (validateDirectly) sfx.activityValidated();
        else sfx.activityProposed();

        setMessage(
            validateDirectly
                ? "Activité validée directement et publiée."
                : "Proposition d'activité envoyée. Elle sera visible après validation par un administrateur.",
            "success"
        );
    } catch (error) {
        console.error("Erreur proposition activité :", error);
        setMessage(error.message || "Impossible d'envoyer la proposition d'activité.", "error");
    } finally {
        setButtonsDisabled([freeProposeButton, freeApproveButton], false);
    }
}

preparedForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitPreparedActivity({ validateDirectly: false });
});

approveButton?.addEventListener("click", async () => {
    if (!currentUserIsAdmin) return;
    if (!confirm("Valider directement cette activité ?")) return;
    await submitPreparedActivity({ validateDirectly: true });
});

freeForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitFreeActivity({ validateDirectly: false });
});

freeApproveButton?.addEventListener("click", async () => {
    if (!currentUserIsAdmin) return;
    if (!confirm("Valider directement cette activité ?")) return;
    await submitFreeActivity({ validateDirectly: true });
});

const today = new Date().toISOString().slice(0, 10);
const maxDate = getSixMonthCalendarLimit();

document.getElementById("activity-date")?.setAttribute("min", today);
document.getElementById("activity-date")?.setAttribute("max", maxDate);
document.getElementById("free-activity-date")?.setAttribute("min", today);
document.getElementById("free-activity-date")?.setAttribute("max", maxDate);
