import { supabase } from "./supabase.js";

const form = document.getElementById("profile-form");
const pseudoInput = document.getElementById("pseudo");
const emailInput = document.getElementById("email");
const roleInput = document.getElementById("role");
const avatar = document.getElementById("profile-avatar");
const avatarFileInput = document.getElementById("avatar-file");
const message = document.getElementById("profile-message");


async function getCurrentUser() {
    const {
        data: { user },
        error
    } = await supabase.auth.getUser();

    if (error || !user) {
        window.location.href = "login.html";
        return null;
    }

    return user;
}


async function loadProfile() {

    const user = await getCurrentUser();

    if (!user) {
        return;
    }

    emailInput.value = user.email ?? "";

    const { data: profile, error } = await supabase
        .from("profiles")
        .select("pseudo, avatar_url, role")
        .eq("id", user.id)
        .single();

    if (error) {
        console.error("Erreur récupération profil :", error);
        message.textContent = "Impossible de charger le profil.";
        return;
    }

    pseudoInput.value = profile.pseudo ?? "";
    roleInput.value = profile.role ?? "member";

    if (profile.avatar_url) {
        avatar.src = profile.avatar_url;
    }
}


async function uploadAvatar(user) {

    const file = avatarFileInput.files[0];

    if (!file) {
        return null;
    }

    // Limite : 2 Mo
    const maxSize = 2 * 1024 * 1024;

    if (file.size > maxSize) {
        throw new Error("La photo ne doit pas dépasser 2 Mo.");
    }

    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    if (!allowedTypes.includes(file.type)) {
        throw new Error("Format d'image non supporté.");
    }

    const extension = file.name.split(".").pop().toLowerCase();

    const filePath = `${user.id}/avatar.${extension}`;

    const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
            upsert: true,
            contentType: file.type
        });

    if (uploadError) {
        throw uploadError;
    }

    const {
        data: { publicUrl }
    } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

    return publicUrl;
}


form.addEventListener("submit", async (event) => {

    event.preventDefault();

    message.textContent = "Enregistrement...";

    try {

        const user = await getCurrentUser();

        if (!user) {
            return;
        }

        const pseudo = pseudoInput.value.trim();

        if (!pseudo) {
            throw new Error("Le pseudo ne peut pas être vide.");
        }

        let avatarUrl = null;

        if (avatarFileInput.files.length > 0) {
            avatarUrl = await uploadAvatar(user);
        }

        const updateData = {
            pseudo: pseudo
        };

        if (avatarUrl) {
            updateData.avatar_url = avatarUrl;
        }

        const { error } = await supabase
            .from("profiles")
            .update(updateData)
            .eq("id", user.id);

        if (error) {
            throw error;
        }

        if (avatarUrl) {
            avatar.src = avatarUrl;
        }

        avatarFileInput.value = "";

        message.textContent = "Profil enregistré !";

    } catch (error) {

        console.error("Erreur enregistrement profil :", error);

        message.textContent =
            error.message || "Impossible d'enregistrer le profil.";
    }
});


loadProfile();