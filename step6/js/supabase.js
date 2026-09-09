import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Configuration publique du projet.
// La publishable key peut être utilisée dans le navigateur : la sécurité
// repose sur les politiques RLS de Supabase.
export const SUPABASE_URL = "https://uhgjtijinduetljcmtlb.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_7U_OEbRLbfQzxVv9WLmtOQ__n3iFUJt";

// URL racine de l'application GitHub Pages.
export const SITE_URL = "https://0ri0546.github.io/Calendar/";

export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);
