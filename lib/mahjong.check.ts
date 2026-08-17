// Self-check for the board generator and free-tile rule.
// Run: node --experimental-strip-types lib/mahjong.check.ts
import assert from "node:assert/strict";
import {
  FACES,
  generateBoard,
  hasMoves,
  isTileFree,
  layoutSlots,
  liveTiles,
  scores,
  type Tile,
} from "./mahjong.ts";

const t = (id: string, x: number, y: number, z: number): Tile => ({
  id,
  face: "X",
  x,
  y,
  z,
});

// --- isTileFree -------------------------------------------------------------
{
  const row = [t("a", 0, 0, 0), t("b", 1, 0, 0), t("c", 2, 0, 0)];
  assert.ok(isTileFree(row[0], row), "left end is free");
  assert.ok(!isTileFree(row[1], row), "middle is blocked on both sides");
  assert.ok(isTileFree(row[2], row), "right end is free");

  const stacked = [t("a", 5, 5, 0), t("top", 5, 5, 1)];
  assert.ok(!isTileFree(stacked[0], stacked), "covered tile is not free");
  assert.ok(isTileFree(stacked[1], stacked), "top tile is free");

  // Neighbours only block on the same layer and row.
  const diff = [t("a", 1, 1, 0), t("l", 0, 1, 1), t("r", 2, 2, 0)];
  assert.ok(isTileFree(diff[0], diff), "different layer/row does not block");
}

// --- layout -----------------------------------------------------------------
{
  const slots = layoutSlots();
  assert.equal(slots.length, 144, "layout holds 144 tiles");
  assert.equal(
    new Set(slots.map((s) => `${s.x},${s.y},${s.z}`)).size,
    144,
    "no two slots share a coordinate",
  );
  assert.equal(FACES.length, 36);
  assert.equal(new Set(FACES).size, 36, "faces are distinct");
}

// --- generator: structure + solvability -------------------------------------
{
  // Deterministic RNG so a failure is reproducible.
  let seed = 12345;
  const rng = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);

  for (let run = 0; run < 20; run++) {
    const board = generateBoard(rng);
    assert.equal(board.length, 144);

    const counts = new Map<string, number>();
    for (const tile of board) counts.set(tile.face, (counts.get(tile.face) ?? 0) + 1);
    assert.equal(counts.size, 36);
    for (const [face, n] of counts) assert.equal(n, 4, `face ${face} appears 4x`);

    // Play the board in its generated pair order: every pair must be a legal,
    // matching move on the tiles that are still standing.
    let remaining = board;
    for (let i = 0; i < board.length; i += 2) {
      const [a, b] = [board[i], board[i + 1]];
      assert.equal(a.face, b.face, `pair ${i / 2} matches`);
      assert.ok(isTileFree(a, remaining), `pair ${i / 2} tile a free`);
      assert.ok(isTileFree(b, remaining), `pair ${i / 2} tile b free`);
      assert.ok(hasMoves(remaining), "a move exists while tiles remain");
      remaining = remaining.filter((tile) => tile.id !== a.id && tile.id !== b.id);
    }
    assert.equal(remaining.length, 0, "board fully cleared");
  }
}

// --- derived state ----------------------------------------------------------
{
  const board = generateBoard();
  const matches = [
    { a: board[0].id, b: board[1].id, by: "g1" },
    { a: board[2].id, b: board[3].id, by: "g2" },
    { a: board[4].id, b: board[5].id, by: "g1" },
  ];
  assert.equal(liveTiles(board, matches).length, 138);
  assert.deepEqual(scores(matches), { g1: 2, g2: 1 });
}

console.log("ok");
