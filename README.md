# Capacity Check API (Cloudflare Worker)

Standalone Cloudflare Worker that answers one question: **is there space left
for this event?**

## How it works

`GET https://capacity-check-api.jonloyhayem.workers.dev/capacity?code=<code>&date=<date>`

1. Looks up the row on the master Google Sheet where column A (`code`) and
   column C (`date`) match the request.
2. That row's column D holds the URL of the event's own sheet, and column B
   holds its capacity.
3. On the event sheet, the Worker counts nonempty rows in column A, adds the
   nonempty rows in column E, and compares the total to the capacity:
   - total >= capacity → `{"space_available": false, "capacity": 0}`
   - total < capacity → `{"space_available": true, "capacity": capacity - total}`

If `code` isn't found on the master sheet at all:
`{"error": "Error: The code given isn't on the master sheet"}` (HTTP 404).

If `code` is found but not with the given `date`:
`{"error": "Error: The date given isn't on the master sheet"}` (HTTP 404).

Both the master sheet and every linked event sheet must be shared as "Anyone
with the link can view" — this uses Google's public gviz query endpoint, no
credentials required.

## Setup

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in MASTER_SHEET_URL (and optional API_KEY)
npm run dev
```

## Deploy

```bash
npx wrangler login          # one-time Cloudflare auth
npx wrangler secret put MASTER_SHEET_URL
npx wrangler secret put API_KEY   # optional — omit to leave the endpoint unauthenticated
npm run deploy
```

## Example

```
GET https://capacity-check-api.jonloyhayem.workers.dev/capacity?code=1415&date=2026-01-14
X-API-Key: <API_KEY, if configured>
```

The root URL by itself, or the root URL with query parameters, is not the
capacity endpoint. Use the `/capacity` path. The `/health` path is available
for a simple health check.
