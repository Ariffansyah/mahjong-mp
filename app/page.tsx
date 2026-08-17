"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Route } from "next";
import { generateBoard, randomRoomCode } from "@/lib/mahjong";
import { guestId, guestName, supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const guest = guestId();

    // Retry only on a code collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const room = randomRoomCode();
      const { error } = await supabase.from("rooms").insert({
        code: room,
        board: generateBoard(),
        players: [{ id: guest, name: guestName(guest), ready: false }],
      });
      if (!error) return router.push(`/room/${room}` as Route);
      if (error.code !== "23505") {
        setError(error.message);
        break;
      }
    }
    setBusy(false);
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-7 p-6 text-green-50 [background-image:radial-gradient(120%_80%_at_50%_0%,#14532d_0%,#052e16_60%,#031c0d_100%)]">
      <p className="tile-face text-5xl">🀄︎🀅︎🀆︎</p>
      <h1 className="text-4xl font-semibold tracking-wide">Mahjong Duel</h1>
      <p className="max-w-xs text-center text-sm opacity-80">
        Same board, two players, no login. Clear more pairs than your opponent.
      </p>

      <button
        type="button"
        onClick={create}
        disabled={busy}
        className="w-full max-w-xs rounded-xl bg-amber-400 py-4 text-lg font-semibold text-stone-900 active:scale-95 disabled:opacity-50"
      >
        {busy ? "Dealing…" : "Create game"}
      </button>

      <form
        className="flex w-full max-w-xs gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === 4) router.push(`/room/${code.toUpperCase()}` as Route);
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
          placeholder="CODE"
          aria-label="Room code"
          inputMode="text"
          autoCapitalize="characters"
          className="min-w-0 flex-1 rounded-xl border border-green-700 bg-green-900/70 px-3 py-3 text-center font-mono text-lg tracking-[0.3em] uppercase placeholder:opacity-40"
        />
        <button
          type="submit"
          className="rounded-xl border border-green-700 px-5 py-3 active:scale-95"
        >
          Join
        </button>
      </form>

      {error && <p className="text-red-300">{error}</p>}
    </main>
  );
}
