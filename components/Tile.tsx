"use client";

import type { CSSProperties } from "react";
import type { Tile as TileModel } from "@/lib/mahjong";

/**
 * Geometry comes from the --tw / --th / --off custom properties set by
 * GameBoard, so the whole board scales with the viewport without JS.
 */
export default function Tile({
  tile,
  free,
  selected,
  hinted,
  onClick,
}: {
  tile: TileModel;
  free: boolean;
  selected: boolean;
  hinted: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!free}
      aria-label={`tile ${tile.face} layer ${tile.z}${free ? "" : " (blocked)"}`}
      aria-pressed={selected}
      style={
        {
          left: `calc(${tile.x} * var(--tw) + ${tile.z} * var(--off))`,
          top: `calc(${tile.y} * var(--th) + var(--zpad) - ${tile.z} * var(--off))`,
          width: "calc(var(--tw) + 1px)",
          height: "calc(var(--th) + 1px)",
          fontSize: "calc(var(--tw) * 0.66)",
          zIndex: tile.z * 100 + tile.y,
        } as CSSProperties
      }
      className={[
        "tile-face absolute flex touch-manipulation items-center justify-center",
        "rounded-[18%] border border-b-[3px] leading-none select-none",
        "transition-[transform,filter,box-shadow] duration-100 active:scale-95",
        selected
          ? "border-amber-500 border-b-amber-600 bg-gradient-to-b from-amber-100 to-amber-300 text-stone-900 shadow-[0_0_0_2px_var(--color-amber-300),3px_4px_6px_rgba(0,0,0,0.5)] -translate-y-[3px]"
          : "border-stone-400 border-b-stone-500 bg-gradient-to-b from-stone-50 to-stone-300 text-stone-900 shadow-[2px_3px_4px_rgba(0,0,0,0.45)]",
        hinted && !selected ? "ring-2 ring-sky-400 animate-pulse" : "",
        free
          ? "cursor-pointer hover:-translate-y-[2px] hover:brightness-105"
          : "cursor-default brightness-[0.7] saturate-[0.4]",
      ].join(" ")}
    >
      {tile.face}
    </button>
  );
}
