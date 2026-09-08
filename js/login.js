import { supabase, SITE_URL } from "./supabase.js";
import { humanizeError, showToast } from "./ui.js";

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
            showToast(humanizeError(error, "Impossible de se connecter avec Google."));
            googleButton.disabled = false;
            googleButton.textContent = "Se connecter avec Google";
        }
    });
}
