import { supabase, SITE_URL } from "./supabase.js?v=20260910-57";
import { showUserError } from "./ui-messages.js?v=20260911-60";

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
            showUserError(error, { message: "Impossible de se connecter avec Google." });
            googleButton.disabled = false;
            googleButton.textContent = "Se connecter avec Google";
        }
    });
}
