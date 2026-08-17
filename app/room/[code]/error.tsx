"use client";

import Link from "next/link";

/**
 * Without this, a client-side throw in the room hands the browser its own
 * generic "page couldn't load" screen — useless on a phone, where there is no
 * console to read. This shows the actual message instead.
 */
export default function RoomError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="grid min-h-svh place-items-center bg-green-950 p-6 text-green-50">
      <div className="w-full max-w-sm rounded-2xl border border-green-800 bg-green-950/80 p-5 text-center">
        <p className="text-lg font-semibold">Something broke in this room</p>
        <pre className="my-4 overflow-x-auto rounded bg-black/40 p-3 text-left text-xs whitespace-pre-wrap text-red-200">
          {error.message}
          {error.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>
        <button
          type="button"
          onClick={retry}
          className="w-full rounded-xl bg-amber-400 py-3 font-semibold text-stone-900 active:scale-95"
        >
          Try again
        </button>
        <Link
          href="/"
          className="mt-3 block w-full rounded-xl border border-green-700 py-2.5 text-sm"
        >
          Leave
        </Link>
      </div>
    </main>
  );
}
