# Watchlist Sharing

## Overview

Authenticated users can share owned watchlists with other existing authenticated users by email. Shared watchlists are collaborative for owners and editors, while viewers can only read, sort, and navigate watchlist stocks.

## Permissions

| Role | Read watchlist | Add/remove stocks | Rename/delete list | Manage sharing |
|------|----------------|-------------------|--------------------|----------------|
| Owner | Yes | Yes | Yes | Yes |
| Editor | Yes | Yes | No | No |
| Viewer | Yes | No | No | No |

Owners retain the canonical watchlist record in `watchlists.user_id`. Collaborator access is stored separately in `watchlist_shares`.

## Database Tables

The schema is defined in `supabase/watchlist-sharing-schema.sql`.

- `watchlists`: owner-owned watchlist metadata, including `sort_order`.
- `watchlist_items`: stock rows for each watchlist.
- `watchlist_shares`: collaborator assignments with `viewer` or `editor` role.

Row-level security allows owners to manage their own lists, shared users to read granted lists, editors to add or remove list items, and viewers to read only.

## API Endpoints

Email lookup is performed only on the server with Supabase service-role access.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/watchlists/share?watchlistId={id}` | GET | List collaborators for an owned watchlist |
| `/api/watchlists/share` | POST | Share or update a collaborator by `{ watchlistId, email, role }` |
| `/api/watchlists/share/{shareId}` | PATCH | Change a collaborator role |
| `/api/watchlists/share/{shareId}` | DELETE | Revoke collaborator access |

All endpoints require a Supabase bearer token in the `Authorization` header and verify that the caller owns the affected watchlist.

## Frontend Behavior

`WatchlistService` loads owned and shared lists into the `/watchlists` index page and annotates each list with `access_role`. Selecting a watchlist name link opens `/watchlists/:watchlistId`, where the selected watchlist's stocks, add-stock search, and sharing controls are displayed without the former sidebar or dock rail.

- Owner lists show `Owner` badges and an index-row Share icon that opens the collaborator dialog.
- Shared lists show `Viewer` or `Editor` badges.
- Viewer lists hide add-stock and remove controls and display a view-only notice.
- Editor lists allow item changes but do not expose rename, delete, or sharing controls.
- Drag-and-drop ordering on the watchlists index is stored as a per-user display preference in browser storage so the combined owned/shared order is restored after refresh. Owner watchlists also continue to sync their `sort_order` values to Supabase for database-backed ordering.
- The stocks page displays live quote-derived performance columns, including 1D, 1M, 3M, 6M, and 1Y change. After initial load, only the 1D column refreshes every 60 seconds while the browser tab is visible.
- The stocks page hero includes a watchlist selector so users can switch between available watchlists without returning to the index.

## Configuration

The share API requires these server-side environment variables in Vercel:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The service-role key must never be exposed to Angular client code.
