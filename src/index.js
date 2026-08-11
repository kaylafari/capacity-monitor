/**
 * Capacity Check API — Cloudflare Worker.
 *
 * Exposes a single endpoint that looks up an event (code + date) on a master
 * Google Sheet (columns: code, date, capacity, url), then checks that event's
 * linked sheet's row counts against the capacity listed on the master sheet.
 */

import { checkCapacity, MasterLookupError } from "./capacity.js";
import { SheetQueryError } from "./sheets.js";

function json(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function queryValue(url, name) {
	const value = url.searchParams.get(name);
	if (value === null) return null;
	try {
		// Some clients encode an already-encoded query value, producing values
		// such as `01%2F14%2F26` after URLSearchParams decodes the URL once.
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === "/health") {
			return json({ status: "ok" });
		}

		if (url.pathname !== "/capacity") {
			return json({ error: "Not found" }, 404);
		}

		if (env.API_KEY) {
			const provided = request.headers.get("x-api-key");
			if (provided !== env.API_KEY) {
				return json({ error: "Unauthorized" }, 401);
			}
		}

		if (!env.MASTER_SHEET_URL) {
			return json({ error: "MASTER_SHEET_URL is not configured" }, 500);
		}

		const code = queryValue(url, "code");
		const date = queryValue(url, "date");
		if (!code || !date) {
			return json({ error: "Both 'code' and 'date' query parameters are required" }, 422);
		}

		try {
			const result = await checkCapacity(env.MASTER_SHEET_URL, code, date);
			return json({ space_available: result.spaceAvailable, capacity: result.capacity });
		} catch (e) {
			if (e instanceof MasterLookupError) {
				return json({ error: e.message }, 404);
			}
			if (e instanceof SheetQueryError) {
				console.error("checkCapacity failed:", e);
				return json({ error: `Failed to read sheet data: ${e.message}` }, 502);
			}
			console.error("Unexpected error in /capacity:", e);
			return json({ error: "Internal server error" }, 500);
		}
	},
};
