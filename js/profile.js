import { supabase } from "./supabase.js";

const form = document.getElementById("profile-form");
const pseudoInput = document.getElementById("pseudo");
const emailInput = document.getElementById("email");
const roleInput = document.getElementById("role");
const avatar = document.getElementById("profile-avatar");
const message = document.getElementById("profile-message");


async function loadProfile() {

    const {
        data: { user },
        error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
        window.location.href = "login.html";
        return;
    }

    emailInput.value = user.email ?? "";

    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("pseudo, avatar_url, role")
        .eq("id", user.id)
        .single();

    if (profileError) {
        console.error("Erreur récupération profil :", profileError);
        message.textContent = "Impossible de charger le profil.";
        return;
    }

    pseudoInput.value = profile.pseudo ?? "";
    roleInput.value = profile.role ?? "member";

    if (profile.avatar_url) {
        avatar.src = profile.avatar_url;
    }
}


form.addEventListener("submit", async (event) => {

    event.preventDefault();

    const pseudo = pseudoInput.value.trim();

    if (!pseudo) {
        message.textContent = "Le pseudo ne peut pas être vide.";
        return;
    }

    const {
        data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
        window.location.href = "login.html";
        return;
    }

    const { error } = await supabase
        .from("profiles")
        .update({
            pseudo: pseudo
        })
        .eq("id", user.id);

    if (error) {
        console.error("Erreur mise à jour profil :", error);
        message.textContent = "Impossible d'enregistrer le profil.";
        return;
    }

    message.textContent = "Profil enregistré !";
});


loadProfile();