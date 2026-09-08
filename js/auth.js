import { supabase } from "./supabase.js";

async function updateAuthUI() {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
        console.error("Erreur récupération utilisateur :", error);
        return;
    }

    const user = data.user;

    if (user) {
        console.log("Utilisateur connecté :", user);
        console.log("Email :", user.email);
    } else {
        console.log("Aucun utilisateur connecté.");
    }
}

updateAuthUI();

supabase.auth.onAuthStateChange((event, session) => {
    console.log("Auth event :", event);

    if (session?.user) {
        console.log("Session active :", session.user.email);
    } else {
        console.log("Utilisateur déconnecté");
    }
});