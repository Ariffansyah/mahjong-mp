export type Tile = { id: string; face: string; x: number; y: number; z: number };
export type Match = { a: string; b: string; by: string };
export type Player = { id: string; name: string; ready: boolean };
export type Room = {
  code: string;
  board: Tile[];
  players: Player[];
  matches: Match[];
  status: "lobby" | "playing" | "finished";
};

/** Unicode Mahjong Tiles block. 36 faces x 4 copies = 144 tiles. */
const codes = (start: number, n: number) =>
  Array.from({ length: n }, (_, i) => String.fromCodePoint(start + i));

export const FACES = [
  ...codes(0x1f007, 9), // characters
  ...codes(0x1f010, 9), // bamboo
  ...codes(0x1f019, 9), // circles
  ...codes(0x1f000, 4), // winds
  ...codes(0x1f004, 3), // dragons
  ...codes(0x1f022, 2), // 2 flowers, to round the set to 36
  // VS15 forces text presentation, otherwise the red dragon renders as a
  // colour emoji while its 143 neighbours are glyphs.
].map((f) => f + "︎");

/** Turtle layout, one grid cell per tile. z0 rows are [xFrom, xTo] per y. */
const Z0: [number, number][] = [
  [1, 12],
  [3, 10],
  [2, 11],
  [0, 13],
  [0, 13],
  [2, 11],
  [3, 10],
  [1, 12],
];
/** Upper layers: [xFrom, xTo, yFrom, yTo, z] */
const UPPER: [number, number, number, number, number][] = [
  [4, 9, 1, 6, 1],
  [5, 8, 2, 5, 2],
  [6, 7, 3, 4, 3],
];

export const BOARD_COLS = 14;
export const BOARD_ROWS = 8;
export const MAX_Z = 3;

/** The 144 coordinates of the layout, before any face is assigned. */
export function layoutSlots(): Omit<Tile, "face">[] {
  const slots: Omit<Tile, "face">[] = [];
  const push = (x: number, y: number, z: number) =>
    slots.push({ id: `t${slots.length}`, x, y, z });

  Z0.forEach(([from, to], y) => {
    for (let x = from; x <= to; x++) push(x, y, 0);
  });
  for (const [xf, xt, yf, yt, z] of UPPER) {
    for (let y = yf; y <= yt; y++) for (let x = xf; x <= xt; x++) push(x, y, z);
  }
  return slots;
}

/**
 * A tile is playable when nothing is stacked on it AND at least one of its two
 * horizontal neighbours on the same layer is missing.
 */
export function isTileFree(tile: Tile, allTiles: Tile[]): boolean {
  let covered = false;
  let left = false;
  let right = false;

  for (const t of allTiles) {
    if (t.id === tile.id) continue;
    if (t.x === tile.x && t.y === tile.y && t.z > tile.z) covered = true;
    else if (t.y === tile.y && t.z === tile.z) {
      if (t.x === tile.x - 1) left = true;
      else if (t.x === tile.x + 1) right = true;
    }
  }
  return !covered && (!left || !right);
}

export function freeTiles(tiles: Tile[]): Tile[] {
  return tiles.filter((t) => isTileFree(t, tiles));
}

/** Any two free tiles sharing a face. */
export function hasMoves(tiles: Tile[]): boolean {
  const seen = new Set<string>();
  for (const t of freeTiles(tiles)) {
    if (seen.has(t.face)) return true;
    seen.add(t.face);
  }
  return false;
}

const shuffle = <T,>(arr: T[], rng: () => number) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/**
 * Hands out faces so the result is guaranteed solvable, by playing the game
 * backwards: repeatedly take two currently-free slots and give them a matching
 * face. Works for the full layout (a new board) or for whatever is left
 * standing (a reshuffle after a deadlock).
 *
 * Returned in removal order, so [0..1], [2..3], ... is itself a winning game.
 * Rendering ignores array order (absolute position + z-index), and
 * mahjong.check.ts uses this property to prove boards are solvable.
 *
 * ponytail: O(n^3)-ish, ~1.5M ops for 144 tiles. Runs on a deal, not per move.
 */
export function dealFaces(
  slots: Omit<Tile, "face">[],
  faces: string[],
  rng: () => number = Math.random,
): Tile[] {
  if (slots.length !== faces.length) throw new Error("slot/face count mismatch");

  const counts = new Map<string, number>();
  for (const f of faces) counts.set(f, (counts.get(f) ?? 0) + 1);

  const pairs: string[] = [];
  for (const [face, n] of counts) {
    if (n % 2) throw new Error(`odd number of ${face}`);
    for (let i = 0; i < n / 2; i++) pairs.push(face);
  }
  shuffle(pairs, rng);

  let remaining = slots;
  const dealt: Tile[] = [];

  while (remaining.length) {
    // Peel the top layer first: its tiles are never covered, so each non-empty
    // row offers a free end and there are normally two to take. Picking freely
    // across layers can strand a covered tile with nothing left on top of it.
    const free = freeTiles(remaining as Tile[]);
    const top = Math.max(...remaining.map((t) => t.z));
    const onTop = shuffle(
      free.filter((t) => t.z === top),
      rng,
    );
    // An odd number left in the top layer means its last tile has to pair with
    // one further down — matches are not restricted to a single layer.
    const two = (
      onTop.length >= 2
        ? onTop
        : [...onTop, ...shuffle(free.filter((t) => t.z !== top), rng)]
    ).slice(0, 2);
    if (two.length < 2) throw new Error("no free pair left");

    const face = pairs.pop()!;
    for (const slot of two) dealt.push({ ...slot, face });
    const taken = new Set(two.map((t) => t.id));
    remaining = remaining.filter((t) => !taken.has(t.id));
  }

  return dealt;
}

export const generateBoard = (rng: () => number = Math.random): Tile[] =>
  dealFaces(layoutSlots(), FACES.flatMap((f) => [f, f, f, f]), rng);

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
export const randomRoomCode = () =>
  Array.from(
    { length: 4 },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
  ).join("");

/** Tiles still on the board, given the append-only match log. */
export function liveTiles(board: Tile[], matches: Match[]): Tile[] {
  const gone = new Set(matches.flatMap((m) => [m.a, m.b]));
  return board.filter((t) => !gone.has(t.id));
}

export function scores(matches: Match[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of matches) out[m.by] = (out[m.by] ?? 0) + 1;
  return out;
}
