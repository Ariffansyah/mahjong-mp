import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * randomUUID needs a secure context and iOS 15.4+, and localStorage throws in
 * some private-browsing modes — either one would take the whole room down on a
 * phone, so both degrade instead.
 */
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

let cached: string | undefined;

/** Random guest id, kept in localStorage. No accounts, no login. */
export function guestId(): string {
  if (cached) return cached;
  try {
    const stored = localStorage.getItem("guest_id");
    if (stored) return (cached = stored);
    const id = uid();
    localStorage.setItem("guest_id", id);
    return (cached = id);
  } catch {
    // Storage unavailable: the id lasts as long as this tab does.
    return (cached = uid());
  }
}

export const guestName = (id: string) => `Guest-${id.slice(0, 4).toUpperCase()}`;
