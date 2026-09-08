import { supabase } from "./supabase.js";


// --------------------------------------------------
// Éléments HTML
// --------------------------------------------------

const form = document.getElementById("profile-form");

const pseudoInput = document.getElementById("pseudo");
const emailInput = document.getElementById("email");
const roleInput = document.getElementById("role");

const avatar = document.getElementById("profile-avatar");
const avatarFileInput = document.getElementById("avatar-file");

const newAvatarPreviewContainer = document.getElementById(
    "new-avatar-preview-container"
);

const newAvatarPreview = document.getElementById(
    "new-avatar-preview"
);

const message = document.getElementById("profile-message");


// --------------------------------------------------
// Récupérer l'utilisateur connecté
// --------------------------------------------------

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


// --------------------------------------------------
// Charger le profil
// --------------------------------------------------

async function loadProfile() {

    const user = await getCurrentUser();

    if (!user) {
        return;
    }


    // Email provenant de Supabase Auth
    emailInput.value = user.email ?? "";


    // Récupération du profil
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


    // Rôle
    roleInput.value = profile.role ?? "member";


    // Avatar
    if (profile.avatar_url) {

        avatar.src = profile.avatar_url;

    }

}


// --------------------------------------------------
// Aperçu de la nouvelle photo
// --------------------------------------------------

function previewAvatar() {

    const file = avatarFileInput.files[0];


    // Aucun fichier sélectionné
    if (!file) {

        newAvatarPreviewContainer.hidden = true;

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

        newAvatarPreview.removeAttribute("src");

        message.textContent =
            "Format d'image non supporté.";

        avatarFileInput.value = "";

        return;
    }


    // Taille maximale : 2 Mo
    const maxSize = 2 * 1024 * 1024;


    if (file.size > maxSize) {

        newAvatarPreviewContainer.hidden = true;

        newAvatarPreview.removeAttribute("src");

        message.textContent =
            "La photo ne doit pas dépasser 2 Mo.";

        avatarFileInput.value = "";

        return;
    }


    // Création d'un aperçu local
    const previewUrl = URL.createObjectURL(file);

    newAvatarPreview.src = previewUrl;

    newAvatarPreviewContainer.hidden = false;

    message.textContent = "";

}


// Écouter la sélection d'une image
avatarFileInput.addEventListener(
    "change",
    previewAvatar
);


// --------------------------------------------------
// Upload de l'avatar
// --------------------------------------------------

async function uploadAvatar(user) {

    const file = avatarFileInput.files[0];


    // Aucun nouveau fichier
    if (!file) {
        return null;
    }


    // Sécurité supplémentaire
    const maxSize = 2 * 1024 * 1024;


    if (file.size > maxSize) {

        throw new Error(
            "La photo ne doit pas dépasser 2 Mo."
        );

    }


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


    // Extension du fichier
    const extension = file.name
        .split(".")
        .pop()
        .toLowerCase();


    // Chemin dans Storage
    const filePath = `${user.id}/avatar.${extension}`;


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


    // Récupération de l'URL publique
    const {
        data: { publicUrl }
    } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);


    return publicUrl;
}


// --------------------------------------------------
// Enregistrement du profil
// --------------------------------------------------

form.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();


        message.textContent =
            "Enregistrement...";


        try {

            // Utilisateur connecté
            const user = await getCurrentUser();


            if (!user) {
                return;
            }


            // Pseudo
            const pseudo = pseudoInput.value.trim();


            if (!pseudo) {

                throw new Error(
                    "Le pseudo ne peut pas être vide."
                );

            }


            // --------------------------------------------------
            // Upload de la nouvelle photo si nécessaire
            // --------------------------------------------------

            let avatarUrl = null;


            if (avatarFileInput.files.length > 0) {

                avatarUrl = await uploadAvatar(user);

            }


            // --------------------------------------------------
            // Préparer les données à modifier
            // --------------------------------------------------

            const updateData = {
                pseudo: pseudo
            };


            if (avatarUrl) {

                updateData.avatar_url = avatarUrl;

            }


            // --------------------------------------------------
            // Mise à jour du profil
            // --------------------------------------------------

            const {
                error
            } = await supabase
                .from("profiles")
                .update(updateData)
                .eq("id", user.id);


            if (error) {

                throw error;

            }


            // --------------------------------------------------
            // Mise à jour de l'affichage
            // --------------------------------------------------

            if (avatarUrl) {

                avatar.src = avatarUrl;

            }


            // Réinitialiser le sélecteur
            avatarFileInput.value = "";


            // Masquer l'aperçu
            newAvatarPreviewContainer.hidden = true;

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


// --------------------------------------------------
// Initialisation
// --------------------------------------------------

loadProfile();