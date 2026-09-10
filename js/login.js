import { supabase, SITE_URL } from "./supabase.js?v=20260910-52";

const googleButton = document.getElementById("google-login");

if (googleButton) {
    googleButton.addEventListener("click", async () => {
        googleButton.disabled = true;
        googleButton.textContent = "Connexion...";

        const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: SITE_URL
            }
        });

        if (error) {
            console.error("Erreur de connexion Google :", error);
            alert("Impossible de se connecter avec Google.");
            googleButton.disabled = false;
            googleButton.textContent = "Se connecter avec Google";
        }
    });
}
