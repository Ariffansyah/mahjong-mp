"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import GameBoard from "./GameBoard";
import { guestName } from "@/lib/supabase";
import { liveTiles, scores } from "@/lib/mahjong";
import { HINTS_PER_GAME, useGameStore } from "@/lib/useGameStore";

export default function Room({ code }: { code: string }) {
  const { room, guest, error, hintsLeft, enter, ready, hint, rematch } = useGameStore();
  const [shared, setShared] = useState(false);

  useEffect(() => {
    let leave: (() => void) | undefined;
    let gone = false;
    enter(code).then((fn) => (gone ? fn() : (leave = fn)));
    return () => {
      gone = true;
      leave?.();
    };
  }, [code, enter]);

  async function share() {
    const url = window.location.href;
    const text = `Join my Mahjong game — room ${room?.code}`;
    if (navigator.share) {
      await navigator.share({ title: "Mahjong Duel", text, url }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(url);
    setShared(true);
    setTimeout(() => setShared(false), 1500);
  }

  if (error) {
    return (
      <Shell>
        <div className="grid flex-1 place-items-center p-6">
          <Card>
            <p className="text-lg text-red-300">{error}</p>
            <Link href="/" className="mt-3 inline-block underline">
              Back to start
            </Link>
          </Card>
        </div>
      </Shell>
    );
  }
  if (!room) {
    return (
      <Shell>
        <div className="grid flex-1 place-items-center p-6">
          <p className="animate-pulse opacity-70">Loading room {code}…</p>
        </div>
      </Shell>
    );
  }

  const me = room.players.find((p) => p.id === guest);
  const score = scores(room.matches);
  const remaining = liveTiles(room.board, room.matches).length;
  const cleared = room.board.length - remaining;
  const ranked = [...room.players].sort(
    (a, b) => (score[b.id] ?? 0) - (score[a.id] ?? 0),
  );
  const winner =
    room.status === "finished" &&
    (score[ranked[0]?.id] ?? 0) !== (score[ranked[1]?.id] ?? 0)
      ? ranked[0]
      : null;
  const lead = Math.max(0, ...room.players.map((p) => score[p.id] ?? 0));
  const last = room.matches.at(-1);
  const lastByOpponent = last && last.by !== guest ? last : null;

  return (
    <Shell>
      <header className="sticky top-0 z-500 border-b border-green-800/80 bg-green-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2">
          <Link href="/" aria-label="Leave game" className="px-1 text-lg opacity-70">
            ←
          </Link>
          <span className="font-mono text-lg tracking-[0.25em]">{room.code}</span>
          <button
            type="button"
            onClick={share}
            className="rounded-full border border-green-700 px-3 py-1 text-xs whitespace-nowrap hover:bg-green-900 active:scale-95"
          >
            {shared ? "Copied" : "Invite"}
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            {room.players.map((p) => (
              <span
                key={p.id}
                className={[
                  "flex items-baseline gap-1 rounded-full px-2.5 py-1 text-xs",
                  (score[p.id] ?? 0) === lead && lead > 0
                    ? "bg-amber-400/20 ring-1 ring-amber-400"
                    : "bg-green-900/70",
                ].join(" ")}
              >
                <span className="opacity-80">{p.id === guest ? "You" : guestName(p.id)}</span>
                <span className="text-base font-semibold tabular-nums">
                  {score[p.id] ?? 0}
                </span>
              </span>
            ))}
          </div>
        </div>

        {room.status !== "lobby" && (
          <div className="h-1 w-full bg-green-900">
            <div
              className="h-full bg-amber-400 transition-[width] duration-300"
              style={{ width: `${(cleared / room.board.length) * 100}%` }}
            />
          </div>
        )}
      </header>

      {/* Tiles vanishing on their own is confusing, so say who took them. The
          key restarts the fade-out animation on every opponent match — no
          timers, no state. */}
      {lastByOpponent && (
        <div className="pointer-events-none fixed top-16 left-1/2 z-500 -translate-x-1/2">
          <p
            key={lastByOpponent.a}
            className="tile-face animate-[toast_1.8s_ease-out_forwards] rounded-full bg-green-900/95 px-4 py-2 text-sm whitespace-nowrap shadow-lg ring-1 ring-amber-400/60"
          >
            Opponent cleared{" "}
            {room.board.find((t) => t.id === lastByOpponent.a)?.face}
          </p>
        </div>
      )}

      {room.status === "lobby" ? (
        <div className="grid flex-1 place-items-center p-4">
          <Card>
            <p className="text-xs tracking-widest uppercase opacity-60">Room</p>
            <p className="font-mono text-4xl tracking-[0.3em]">{room.code}</p>

            <ul className="my-5 space-y-2 text-sm">
              {room.players.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-6">
                  <span>
                    {p.id === guest ? "You" : guestName(p.id)}
                  </span>
                  <span className={p.ready ? "text-amber-300" : "opacity-60"}>
                    {p.ready ? "ready" : "waiting"}
                  </span>
                </li>
              ))}
              {room.players.length < 2 && (
                <li className="opacity-50">Seat 2 empty…</li>
              )}
            </ul>

            {!me ? (
              <p className="text-amber-300">Room is full — you are spectating.</p>
            ) : me.ready ? (
              <p className="text-sm opacity-80">
                {room.players.length < 2
                  ? "Waiting for an opponent — send them the invite."
                  : "Waiting for your opponent…"}
              </p>
            ) : (
              <button
                type="button"
                onClick={ready}
                className="w-full rounded-xl bg-amber-400 py-3 text-lg font-semibold text-stone-900 active:scale-95"
              >
                Ready
              </button>
            )}

            <button
              type="button"
              onClick={share}
              className="mt-3 w-full rounded-xl border border-green-700 py-2.5 text-sm active:scale-95"
            >
              {shared ? "Link copied" : "Share invite link"}
            </button>
          </Card>
        </div>
      ) : (
        <div className="px-1 py-2">
          <GameBoard />
        </div>
      )}

      {room.status === "playing" && me && (
        <button
          type="button"
          onClick={hint}
          disabled={hintsLeft <= 0}
          className="fixed right-4 z-500 rounded-full bg-sky-500/90 px-5 py-3 text-sm font-semibold shadow-lg active:scale-95 disabled:bg-green-900/90 disabled:opacity-60"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
        >
          Hint {hintsLeft}/{HINTS_PER_GAME}
        </button>
      )}

      {room.status === "finished" && (
        <div className="fixed inset-0 z-500 grid place-items-center bg-black/70 p-4">
          <Card>
            <p className="text-2xl font-semibold">
              {winner ? (winner.id === guest ? "You win!" : `${guestName(winner.id)} wins`) : "Draw"}
            </p>
            <p className="mt-1 text-sm opacity-80">
              {remaining === 0
                ? "Board cleared."
                : `No moves left — ${remaining} tiles stuck.`}
            </p>
            <ul className="my-4 space-y-1 text-sm">
              {ranked.map((p) => (
                <li key={p.id} className="flex justify-between gap-8">
                  <span>{p.id === guest ? "You" : guestName(p.id)}</span>
                  <span className="font-semibold tabular-nums">{score[p.id] ?? 0}</span>
                </li>
              ))}
            </ul>
            {me && (
              <button
                type="button"
                onClick={rematch}
                className="w-full rounded-xl bg-amber-400 py-3 font-semibold text-stone-900 active:scale-95"
              >
                Rematch
              </button>
            )}
            <Link
              href="/"
              className="mt-3 block w-full rounded-xl border border-green-700 py-2.5 text-center text-sm active:scale-95"
            >
              Leave
            </Link>
          </Card>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col bg-green-950 text-green-50 [background-image:radial-gradient(120%_80%_at_50%_0%,#14532d_0%,#052e16_60%,#031c0d_100%)]">
      {children}
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-xs rounded-2xl border border-green-800 bg-green-950/80 p-5 text-center shadow-2xl">
      {children}
    </div>
  );
}
