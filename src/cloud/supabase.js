import { createClient } from "@supabase/supabase-js";

export function readSupabaseConfig(environment = import.meta.env ?? {}) {
  const url = String(environment.VITE_SUPABASE_URL ?? "").trim();
  const publishableKey = String(environment.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  if (!url || !publishableKey) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  if (!publishableKey.startsWith("sb_publishable_")) return null;
  return { url, publishableKey };
}

export function createStudyHubSupabaseClient(config, options = {}) {
  if (!config) return null;
  const { auth: authOptions = {}, ...clientOptions } = options;
  return createClient(config.url, config.publishableKey, {
    ...clientOptions,
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "studyhub:auth",
      ...authOptions,
    },
  });
}

function normalizedEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export class StudyHubAuth {
  constructor(client, { redirectTo = globalThis.location?.origin } = {}) {
    this.client = client;
    this.redirectTo = redirectTo;
  }

  async getSession() {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    return data.session ?? null;
  }

  async signIn(email, password) {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: normalizedEmail(email),
      password: String(password ?? ""),
    });
    if (error) throw error;
    return data.session ?? null;
  }

  async signUp(email, password) {
    const credentials = {
      email: normalizedEmail(email),
      password: String(password ?? ""),
      options: this.redirectTo ? { emailRedirectTo: this.redirectTo } : undefined,
    };
    const { data, error } = await this.client.auth.signUp(credentials);
    if (error) throw error;
    return data;
  }

  async signOut() {
    const { error } = await this.client.auth.signOut({ scope: "local" });
    if (error) throw error;
  }

  subscribe(listener) {
    const { data } = this.client.auth.onAuthStateChange((event, session) => listener(event, session));
    return () => data.subscription.unsubscribe();
  }
}
