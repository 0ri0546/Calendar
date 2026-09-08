import { supabase } from "./supabase.js";

const googleButton = document.getElementById("google-login");

googleButton.addEventListener("click", async () => {
    const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
            redirectTo: "https://0ri0546.github.io/Calendar/"
        }
    });

    if (error) {
        console.error("Erreur de connexion Google :", error);
        alert("Impossible de se connecter avec Google.");
    }
});