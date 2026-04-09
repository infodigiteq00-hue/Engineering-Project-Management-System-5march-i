import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * While Login.tsx is resolving profile + firm after signIn, AuthContext must not duplicate
 * the same users/firms API calls. Login sets this before DB work; clears after localStorage
 * write or on any failure path.
 */
const LOGIN_PROFILE_PENDING_KEY = 'epms_login_profile_pending_email';

export function markLoginProfileFetchPending(email: string): void {
  try {
    sessionStorage.setItem(LOGIN_PROFILE_PENDING_KEY, (email || '').toLowerCase().trim());
  } catch {
    /* ignore */
  }
}

export function clearLoginProfileFetchPending(): void {
  try {
    sessionStorage.removeItem(LOGIN_PROFILE_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export function getLoginProfileFetchPending(): string | null {
  try {
    return sessionStorage.getItem(LOGIN_PROFILE_PENDING_KEY);
  } catch {
    return null;
  }
}

/**
 * Wait until Login wrote userRole + userData (same email), or timeout.
 * Returns true when localStorage is ready for AuthContext to hydrate without extra API calls.
 */
export async function waitUntilLoginStoredUserProfile(authEmail: string, maxMs = 12000): Promise<boolean> {
  const want = (authEmail || '').toLowerCase().trim();
  if (!want) return false;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const pending = getLoginProfileFetchPending();
    if (!pending || pending !== want) {
      return false;
    }
    const role = localStorage.getItem('userRole');
    const raw = localStorage.getItem('userData');
    if (role && raw) {
      try {
        const ud = JSON.parse(raw) as { email?: string };
        if (ud.email && ud.email.toLowerCase().trim() === want) {
          return true;
        }
      } catch {
        /* keep waiting */
      }
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  return false;
}

/** Firm fields returned from embedded `firms(...)` select (matches FirmData in AuthContext). */
export type EmbeddedFirmRow = {
  name?: string;
  logo_url?: string | null;
  services_paused?: boolean;
  equipment_unlock_days?: number;
  created_at?: string;
};

/** Single round-trip user + firm when PostgREST exposes the FK embed (users.firm_id → firms). */
export const USER_TABLE_FIRM_EMBED_SELECT =
  'id, role, full_name, firm_id, email, is_active, firms(name, logo_url, services_paused, equipment_unlock_days, created_at)';

export const USER_TABLE_BASE_SELECT = 'id, role, full_name, firm_id, email, is_active';

function isMissingRelationshipError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === 'PGRST200') return true;
  const m = (err.message || '').toLowerCase();
  return m.includes('could not find a relationship') || m.includes('relationship');
}

/** PostgREST returns an object or a single-element array for many-to-one embeds. */
export function firmFromUserEmbed(firms: unknown): EmbeddedFirmRow | null {
  if (!firms) return null;
  if (Array.isArray(firms)) {
    const f = firms[0];
    return f && typeof f === 'object' ? (f as EmbeddedFirmRow) : null;
  }
  if (typeof firms === 'object') return firms as EmbeddedFirmRow;
  return null;
}

type UserRow = Record<string, unknown>;

function splitRow(row: UserRow | null): { user: UserRow | null; firm: EmbeddedFirmRow | null } {
  if (!row) return { user: null, firm: null };
  const { firms, ...userRest } = row;
  return { user: userRest, firm: firmFromUserEmbed(firms) };
}

/**
 * One query for user + embedded firm; falls back to user-only select if embed is not configured.
 */
export async function fetchUserRowWithFirmByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<{ user: UserRow | null; firm: EmbeddedFirmRow | null; error: { message?: string; code?: string } | null }> {
  let res = await supabase.from('users').select(USER_TABLE_FIRM_EMBED_SELECT).eq('email', email).maybeSingle();

  if (res.error && isMissingRelationshipError(res.error)) {
    res = await supabase.from('users').select(USER_TABLE_BASE_SELECT).eq('email', email).maybeSingle();
    if (res.error) return { user: null, firm: null, error: res.error };
    return { user: (res.data as UserRow) || null, firm: null, error: null };
  }

  if (res.error) return { user: null, firm: null, error: res.error };
  const { user, firm } = splitRow(res.data as UserRow | null);
  return { user, firm, error: null };
}

export async function fetchUserRowWithFirmById(
  supabase: SupabaseClient,
  id: string
): Promise<{ user: UserRow | null; firm: EmbeddedFirmRow | null; error: { message?: string; code?: string } | null }> {
  let res = await supabase.from('users').select(USER_TABLE_FIRM_EMBED_SELECT).eq('id', id).maybeSingle();

  if (res.error && isMissingRelationshipError(res.error)) {
    res = await supabase.from('users').select(USER_TABLE_BASE_SELECT).eq('id', id).maybeSingle();
    if (res.error) return { user: null, firm: null, error: res.error };
    return { user: (res.data as UserRow) || null, firm: null, error: null };
  }

  if (res.error) return { user: null, firm: null, error: res.error };
  const { user, firm } = splitRow(res.data as UserRow | null);
  return { user, firm, error: null };
}
