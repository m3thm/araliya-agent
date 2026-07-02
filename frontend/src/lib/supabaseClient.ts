import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// If Supabase isn't configured yet, export null instead of throwing at
// module level — a module-level throw prevents the entire React tree
// from rendering. The auth store checks for null and shows the auth
// screen with a helpful message instead.
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;