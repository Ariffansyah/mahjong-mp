# Mahjong Duel

Two-player real-time Mahjong solitaire. Both players share one board: a pair
cleared by either player disappears for both, and whoever clears more pairs wins.
No accounts — each browser gets a random `guest_id` in `localStorage`.

## Setup

1. Create a Supabase project, then run `supabase/schema.sql` in the SQL editor.
2. Copy `.env.local.example` to `.env.local` and fill in the project URL and anon key.
3. `pnpm dev`, open the app, click **Create game**, and send the invite link to
   the second player. Both press **Ready** to start.

## Layout

| Path                     | What                                                                |
| ------------------------ | ------------------------------------------------------------------- |
| `app/page.tsx`           | Create a game / join by 4-letter code                               |
| `app/room/[code]/page.tsx` | Awaits `params`, renders the client room                           |
| `components/Room.tsx`    | Lobby, scoreboard, end-of-game banner                               |
| `components/GameBoard.tsx` | Positions the live tiles, computes which are playable             |
| `components/Tile.tsx`     | One tile: coordinates → CSS position, z-index, shadow              |
| `lib/mahjong.ts`         | Board generation, `isTileFree`, derived state (live tiles, scores)   |
| `lib/useGameStore.ts`    | Zustand store + realtime subscription                               |
| `lib/supabase.ts`        | Client and guest id                                                 |
| `supabase/schema.sql`    | `rooms` table, RLS, and the three mutation functions                |

## Checks

`pnpm check` generates 20 boards and plays each one to completion, asserting
every pair was a legal move — plus unit assertions for the free-tile rule.
