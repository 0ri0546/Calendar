import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://uhgjtijinduetljcmtlb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_7U_OEbRLbfQzxVv9WLmtOQ__n3iFUJt";

export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);