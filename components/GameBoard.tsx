"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Tile from "./Tile";
import { BOARD_COLS, BOARD_ROWS, MAX_Z, isTileFree, liveTiles } from "@/lib/mahjong";
import { useGameStore } from "@/lib/useGameStore";

/**
 * Base pitch: readable tiles (44px), or bigger where the whole board fits
 * anyway. 14 columns across a phone would otherwise squeeze tiles to ~26px.
 */
const BASE = `max(44px, min(54px, (100vw - 8px) / ${BOARD_COLS + 0.7}, (100svh - 140px) / ${
  BOARD_ROWS * 1.34 + 0.7
}))`;

const STEPS = [0.55, 0.7, 0.85, 1, 1.25, 1.5, 1.85];
const DEFAULT_STEP = 3;

const style = (scale: number) =>
  ({
    "--tw": `calc(${scale} * ${BASE})`,
    "--th": "calc(var(--tw) * 1.34)",
    "--off": "calc(var(--tw) * 0.16)",
    // Upper layers lift tiles upward, so the top row needs headroom inside the
    // box — otherwise it overflows above the board and centring can't reach it.
    "--zpad": `calc(${MAX_Z} * var(--off))`,
    width: `calc(${BOARD_COLS} * var(--tw) + ${MAX_Z} * var(--off))`,
    height: `calc(${BOARD_ROWS} * var(--th) + var(--zpad))`,
  }) as CSSProperties;

export default function GameBoard() {
  const room = useGameStore((s) => s.room);
  const selected = useGameStore((s) => s.selected);
  const hinted = useGameStore((s) => s.hinted);
  const tap = useGameStore((s) => s.tap);
  const [step, setStep] = useState(DEFAULT_STEP);
  const pane = useRef<HTMLDivElement>(null);

  // Zooming keeps the middle of the turtle in view instead of jumping to a corner.
  useEffect(() => {
    const el = pane.current;
    if (!el) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  }, [step]);

  const tiles = useMemo(
    () => (room ? liveTiles(room.board, room.matches) : []),
    [room],
  );
  const free = useMemo(
    () => new Set(tiles.filter((t) => isTileFree(t, tiles)).map((t) => t.id)),
    [tiles],
  );

  const zoomBy = (d: number) =>
    setStep((s) => Math.min(STEPS.length - 1, Math.max(0, s + d)));

  return (
    <div className="flex min-h-0 flex-1">
      {/* Fills the space left under the header, so `m-auto` parks the board in
          the middle of it. No touch-action override on purpose: the default
          `auto` pans both axes and keeps pinch-zoom, whereas `pan-x pan-y`
          blocks pinch and is honoured inconsistently across mobile browsers. */}
      <div
        ref={pane}
        className="grid flex-1 overflow-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="relative m-auto" style={style(STEPS[step])}>
          {tiles.map((tile) => (
            <Tile
              key={tile.id}
              tile={tile}
              free={free.has(tile.id)}
              selected={selected === tile.id}
              hinted={hinted.includes(tile.id)}
              onClick={() => tap(tile.id)}
            />
          ))}
        </div>
      </div>

      <div
        className="fixed left-4 z-500 flex items-center gap-2"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
      >
        <ZoomButton label="Zoom out" onClick={() => zoomBy(-1)} disabled={step === 0}>
          −
        </ZoomButton>
        <ZoomButton
          label="Zoom in"
          onClick={() => zoomBy(1)}
          disabled={step === STEPS.length - 1}
        >
          +
        </ZoomButton>
        <button
          type="button"
          onClick={() => setStep(DEFAULT_STEP)}
          className="rounded-full bg-green-900/90 px-3 py-2 text-xs ring-1 ring-green-700 active:scale-95"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function ZoomButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="size-11 rounded-full bg-green-900/90 text-xl leading-none font-semibold ring-1 ring-green-700 active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
