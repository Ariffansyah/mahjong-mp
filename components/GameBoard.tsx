"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Tile from "./Tile";
import { BOARD_COLS, BOARD_ROWS, MAX_Z, isTileFree, liveTiles } from "@/lib/mahjong";
import { useGameStore } from "@/lib/useGameStore";

/** Board box in tile pitches, including the room the layer offset needs. */
const COLS = BOARD_COLS + MAX_Z * 0.16;
const ROWS = BOARD_ROWS * 1.34 + MAX_Z * 0.16;
/** Never below thumb-size, never cartoonishly large on a desktop. */
const MIN_PITCH = 44;
const MAX_PITCH = 54;

const STEPS = [0.55, 0.7, 0.85, 1, 1.25, 1.5, 1.85];
const DEFAULT_STEP = 3;

/**
 * Everything is derived from --tw, which JS sets in plain pixels. It used to be
 * a CSS `min()` over `100vw` / `100svh`, but a browser that doesn't know `svh`
 * throws out the whole expression: --tw dies, every left/top/width falls back
 * to `auto`, and all 144 tiles pile into one corner — unpannable, unclickable.
 * Measuring also beats guessing how much height the header takes.
 */
const boardStyle = {
  "--th": "calc(var(--tw) * 1.34)",
  "--off": "calc(var(--tw) * 0.16)",
  "--zpad": `calc(${MAX_Z} * var(--off))`,
  width: `calc(${BOARD_COLS} * var(--tw) + ${MAX_Z} * var(--off))`,
  height: `calc(${BOARD_ROWS} * var(--th) + var(--zpad))`,
} as CSSProperties;

export default function GameBoard() {
  const room = useGameStore((s) => s.room);
  const selected = useGameStore((s) => s.selected);
  const hinted = useGameStore((s) => s.hinted);
  const tap = useGameStore((s) => s.tap);
  const [step, setStep] = useState(DEFAULT_STEP);
  const pane = useRef<HTMLDivElement>(null);

  const scale = STEPS[step];

  useEffect(() => {
    const el = pane.current;
    if (!el) return;

    const fit = () => {
      // visualViewport is the only number that's right while mobile browser
      // chrome slides in and out; innerHeight covers everything older.
      const viewport = window.visualViewport?.height ?? window.innerHeight;
      const height = Math.max(240, viewport - el.getBoundingClientRect().top - 8);
      el.style.height = `${height}px`;

      const base = Math.min(
        MAX_PITCH,
        Math.max(MIN_PITCH, Math.min(el.clientWidth / COLS, height / ROWS)),
      );
      el.style.setProperty("--tw", `${base * scale}px`);

      // Keep the middle of the turtle in view rather than a corner.
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
    };

    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);
    window.visualViewport?.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("orientationchange", fit);
      window.visualViewport?.removeEventListener("resize", fit);
    };
  }, [scale]);

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
    <div className="w-full">
      {/* Height is set in JS; `m-auto` centres the board and still leaves the
          overflow reachable when it's zoomed past the pane. */}
      <div
        ref={pane}
        className="grid w-full overflow-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="relative m-auto" style={boardStyle}>
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
