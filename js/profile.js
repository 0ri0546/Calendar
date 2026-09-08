import { supabase } from "./supabase.js";


// ==================================================
// ÉLÉMENTS HTML
// ==================================================

const form = document.getElementById("profile-form");

const pseudoInput = document.getElementById("pseudo");
const avatar = document.getElementById("profile-avatar");

const avatarFileInput = document.getElementById("avatar-file");

const newAvatarPreviewContainer =
    document.getElementById("new-avatar-preview-container");

const newAvatarPreview =
    document.getElementById("new-avatar-preview");

const avatarPreviewArrow =
    document.getElementById("avatar-preview-arrow");

const message =
    document.getElementById("profile-message");


// ==================================================
// UTILISATEUR CONNECTÉ
// ==================================================

async function getCurrentUser() {

    const {
        data: { user },
        error
    } = await supabase.auth.getUser();


    if (error) {

        console.error(
            "Erreur récupération utilisateur :",
            error
        );

        return null;
    }


    if (!user) {

        window.location.href = "login.html";

        return null;
    }


    return user;
}


// ==================================================
// CHARGEMENT DU PROFIL
// ==================================================

async function loadProfile() {

    const user = await getCurrentUser();

    if (!user) {
        return;
    }


    // Profil
    const {
        data: profile,
        error: profileError
    } = await supabase
        .from("profiles")
        .select("pseudo, avatar_url, role")
        .eq("id", user.id)
        .single();


    if (profileError) {

        console.error(
            "Erreur récupération profil :",
            profileError
        );

        message.textContent =
            "Impossible de charger le profil.";

        return;
    }


    // Pseudo
    pseudoInput.value = profile.pseudo ?? "";


    // Avatar actuel
    if (profile.avatar_url) {

        avatar.src = profile.avatar_url;

    }

}


// ==================================================
// APERÇU DE LA NOUVELLE PHOTO
// ==================================================

function previewAvatar() {

    const file = avatarFileInput.files[0];


    // Aucun fichier
    if (!file) {

        newAvatarPreviewContainer.hidden = true;

        avatarPreviewArrow.hidden = true;

        newAvatarPreview.removeAttribute("src");

        message.textContent = "";

        return;
    }


    // Formats autorisés
    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];


    if (!allowedTypes.includes(file.type)) {

        newAvatarPreviewContainer.hidden = true;

        avatarPreviewArrow.hidden = true;

        newAvatarPreview.removeAttribute("src");

        avatarFileInput.value = "";

        message.textContent =
            "Format d'image non supporté.";

        return;
    }


    // Taille maximale : 2 Mo
    const maxSize = 2 * 1024 * 1024;


    if (file.size > maxSize) {

        newAvatarPreviewContainer.hidden = true;

        avatarPreviewArrow.hidden = true;

        newAvatarPreview.removeAttribute("src");

        avatarFileInput.value = "";

        message.textContent =
            "La photo ne doit pas dépasser 2 Mo.";

        return;
    }


    // Création de l'aperçu local
    const previewUrl =
        URL.createObjectURL(file);


    newAvatarPreview.src = previewUrl;


    // Afficher l'aperçu
    newAvatarPreviewContainer.hidden = false;

    avatarPreviewArrow.hidden = false;


    message.textContent = "";

}


// Écoute du changement de fichier
avatarFileInput.addEventListener(
    "change",
    previewAvatar
);


// ==================================================
// UPLOAD DE L'AVATAR
// ==================================================

async function uploadAvatar(user) {

    const file = avatarFileInput.files[0];


    if (!file) {
        return null;
    }


    // Sécurité taille
    const maxSize = 2 * 1024 * 1024;


    if (file.size > maxSize) {

        throw new Error(
            "La photo ne doit pas dépasser 2 Mo."
        );

    }


    // Sécurité format
    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];


    if (!allowedTypes.includes(file.type)) {

        throw new Error(
            "Format d'image non supporté."
        );

    }


    // Extension
    const extension =
        file.name
            .split(".")
            .pop()
            .toLowerCase();


    // Chemin Storage
    const filePath =
        `${user.id}/avatar.${extension}`;


    // Upload
    const {
        error: uploadError
    } = await supabase.storage
        .from("avatars")
        .upload(
            filePath,
            file,
            {
                upsert: true,
                contentType: file.type
            }
        );


    if (uploadError) {

        throw uploadError;

    }


    // URL publique
    const {
        data: { publicUrl }
    } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);


    return publicUrl;
}


// ==================================================
// ENREGISTREMENT
// ==================================================

form.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();


        message.textContent =
            "Enregistrement...";


        try {

            // Utilisateur
            const user =
                await getCurrentUser();


            if (!user) {
                return;
            }


            // Pseudo
            const pseudo =
                pseudoInput.value.trim();


            if (!pseudo) {

                throw new Error(
                    "Le pseudo ne peut pas être vide."
                );

            }


            // Upload éventuel
            let avatarUrl = null;


            if (
                avatarFileInput.files.length > 0
            ) {

                avatarUrl =
                    await uploadAvatar(user);

            }


            // Données à modifier
            const updateData = {
                pseudo: pseudo
            };


            if (avatarUrl) {

                updateData.avatar_url =
                    avatarUrl;

            }


            // Mise à jour profil
            const {
                error
            } = await supabase
                .from("profiles")
                .update(updateData)
                .eq("id", user.id);


            if (error) {

                throw error;

            }


            // Mettre à jour l'image actuelle
            if (avatarUrl) {

                avatar.src = avatarUrl;

            }


            // Nettoyer le champ fichier
            avatarFileInput.value = "";


            // Cacher l'aperçu
            newAvatarPreviewContainer.hidden = true;

            avatarPreviewArrow.hidden = true;

            newAvatarPreview.removeAttribute("src");


            message.textContent =
                "Profil enregistré !";

        }
        catch (error) {

            console.error(
                "Erreur enregistrement profil :",
                error
            );


            message.textContent =
                error.message ||
                "Impossible d'enregistrer le profil.";

        }

    }
);


// ==================================================
// INITIALISATION
// ==================================================

loadProfile();