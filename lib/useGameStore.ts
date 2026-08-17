import { create } from "zustand";
import { guestId, guestName, supabase, uid } from "./supabase";
import {
  freeTiles,
  generateBoard,
  hasMoves,
  isTileFree,
  liveTiles,
  type Room,
  type Tile,
} from "./mahjong";

export const HINTS_PER_GAME = 3;

/**
 * Hints are budgeted per device and per room, in localStorage, so reloading
 * doesn't hand out three more. Cleared when a rematch deals a fresh board.
 */
const hintKey = (code: string, guest: string) => `hints:${code}:${guest}`;

const hintsLeftFor = (code: string, guest: string) => {
  try {
    const used = Number(localStorage.getItem(hintKey(code, guest)) ?? 0);
    return Math.max(0, HINTS_PER_GAME - (Number.isFinite(used) ? used : 0));
  } catch {
    return HINTS_PER_GAME;
  }
};

const storeHintsUsed = (code: string, guest: string, used: number) => {
  try {
    if (used <= 0) localStorage.removeItem(hintKey(code, guest));
    else localStorage.setItem(hintKey(code, guest), String(used));
  } catch {
    // Private browsing: the budget lasts as long as the tab does.
  }
};

type State = {
  guest: string;
  room: Room | null;
  selected: string | null;
  /** Tile ids the hint is currently pointing at. */
  hinted: string[];
  /** Hints this device may still spend on the current board. */
  hintsLeft: number;
  error: string | null;
  /** Join the room, load it, and stream every change from the opponent. */
  enter: (code: string) => Promise<() => void>;
  ready: () => Promise<void>;
  /** Click a tile: select, deselect, or claim a pair. */
  tap: (tileId: string) => Promise<void>;
  /** Flash a playable pair for a few seconds. */
  hint: () => void;
  /** Deal a fresh board in the same room and send both players to the lobby. */
  rematch: () => Promise<void>;
};

export const useGameStore = create<State>((set, get) => ({
  guest: "",
  room: null,
  selected: null,
  hinted: [],
  hintsLeft: HINTS_PER_GAME,
  error: null,

  enter: async (code) => {
    const guest = guestId();
    set({ guest, hintsLeft: hintsLeftFor(code, guest) });

    const apply = (room: Room | null) => {
      if (!room) return set({ error: "Room not found" });
      // Back in the lobby means a rematch dealt a new board, so anything the
      // player had picked out points at tiles that no longer exist — and the
      // hint budget starts over.
      const fresh = room.status === "lobby";
      if (fresh) storeHintsUsed(room.code, guest, 0);
      set({
        room,
        error: null,
        ...(fresh ? { selected: null, hinted: [], hintsLeft: HINTS_PER_GAME } : {}),
      });
      // Nobody can move any more, but tiles remain: end it.
      if (room.status === "playing" && !hasMoves(liveTiles(room.board, room.matches))) {
        supabase.rpc("finish_room", { p_code: room.code });
      }
    };

    // Unique topic per call: removeChannel() completes asynchronously, so a
    // remount can otherwise land on the old, already-subscribed channel —
    // supabase.channel() hands back the existing one and .on() then throws.
    const channel = supabase
      .channel(`room:${code}:${uid()}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `code=eq.${code}` },
        // Postgres omits unchanged TOASTed columns from the WAL, so `board`
        // (big and immutable) is missing from these payloads. Merge onto the
        // row loaded below; events arriving before it are safely dropped
        // because join_room returns a row at least as new as they are.
        (payload) => {
          const prev = get().room;
          if (prev) apply({ ...prev, ...(payload.new as Partial<Room>) });
        },
      )
      .subscribe();

    // Runs after subscribing, so a change landing mid-join isn't missed.
    const { data, error } = await supabase.rpc("join_room", {
      p_code: code,
      p_guest: guest,
      p_name: guestName(guest),
    });
    if (error) set({ error: error.message });
    else apply(data as Room | null);

    return () => {
      supabase.removeChannel(channel);
      set({ room: null, selected: null, hinted: [], error: null });
    };
  },

  ready: async () => {
    const { room, guest } = get();
    if (!room) return;
    const { data } = await supabase.rpc("set_ready", { p_code: room.code, p_guest: guest });
    if (data) set({ room: data as Room });
  },

  tap: async (tileId) => {
    const { room, guest, selected } = get();
    if (!room || room.status !== "playing") return;

    const live = liveTiles(room.board, room.matches);
    const tile = live.find((t) => t.id === tileId);
    if (!tile || !isTileFree(tile, live)) return;

    if (selected === tileId) return set({ selected: null, hinted: [] });

    const first = selected ? live.find((t: Tile) => t.id === selected) : undefined;
    if (!first || first.face !== tile.face) return set({ selected: tileId, hinted: [] });

    set({ selected: null, hinted: [] });
    const { data } = await supabase.rpc("claim_match", {
      p_code: room.code,
      p_guest: guest,
      p_a: first.id,
      p_b: tile.id,
    });
    // The row we get back is authoritative: if the opponent claimed this pair
    // first, it simply comes back unchanged and the tiles stay where they are.
    if (data) set({ room: data as Room });
  },

  hint: () => {
    const { room, guest, hintsLeft } = get();
    if (!room || room.status !== "playing" || hintsLeft <= 0) return;

    const byFace = new Map<string, string>();
    for (const t of freeTiles(liveTiles(room.board, room.matches))) {
      const partner = byFace.get(t.face);
      if (partner) {
        // Only a hint that actually found a pair costs one.
        storeHintsUsed(room.code, guest, HINTS_PER_GAME - (hintsLeft - 1));
        set({ hinted: [partner, t.id], selected: null, hintsLeft: hintsLeft - 1 });
        setTimeout(() => {
          if (get().hinted[0] === partner) set({ hinted: [] });
        }, 2500);
        return;
      }
      byFace.set(t.face, t.id);
    }
  },

  rematch: async () => {
    const { room, guest } = get();
    if (!room) return;
    const { data } = await supabase.rpc("restart_room", {
      p_code: room.code,
      p_guest: guest,
      p_board: generateBoard(),
    });
    // A no-op if the opponent pressed first: their board comes back instead.
    if (data) set({ room: data as Room, selected: null, hinted: [] });
  },
}));
