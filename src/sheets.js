/**
 * Google Sheets (gviz) helpers for the Capacity Check API.
 */

const GVIZ_RESPONSE_RE = /^\s*(?:\/\*.*?\*\/\s*)?(?:google\.visualization\.Query\.setResponse)\(([\s\S]*)\)\s*;?\s*$/;

export class SheetQueryError extends Error {}

/** Extract the Google Sheet ID from a URL, or return the raw input. */
export function extractSheetId(url) {
	const ref = (url || "").trim();
	const match = ref.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
	return match ? match[1] : ref;
}

/** Extract the gid (tab ID) from a Google Sheet URL. */
export function extractGid(url) {
	const match = (url || "").trim().match(/[?&#]gid=(\d+)/);
	return match ? match[1] : null;
}

/**
 * Run a gviz `select` query against a sheet/tab and return the raw `table` payload.
 * All rows (including what would normally be an auto-detected header row) are
 * returned as data rows -- callers must skip row 1 themselves when there's a header.
 */
export async function fetchGvizTable(sheetRef, selectClause, sheetName, timeoutMs = 6000) {
	sheetRef = (sheetRef || "").trim();
	if (!sheetRef) {
		throw new SheetQueryError("Missing sheet reference");
	}

	const sheetId = extractSheetId(sheetRef);
	if (!sheetId) {
		throw new SheetQueryError("Could not resolve spreadsheet id from sheet reference");
	}

	const gid = !(sheetName || "").trim() ? extractGid(sheetRef) : null;
	const params = new URLSearchParams({ tq: selectClause, tqx: "out:json;headers:0" });
	if (gid) params.set("gid", gid);
	if ((sheetName || "").trim()) params.set("sheet", sheetName.trim());

	const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${params.toString()}`;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	let body;
	try {
		const resp = await fetch(url, { signal: controller.signal });
		if (!resp.ok) {
			throw new SheetQueryError(`Sheet request failed: HTTP ${resp.status}`);
		}
		body = await resp.text();
	} catch (e) {
		if (e instanceof SheetQueryError) throw e;
		throw new SheetQueryError(`Sheet request failed: ${e.message || e}`);
	} finally {
		clearTimeout(timeout);
	}

	const match = body.match(GVIZ_RESPONSE_RE);
	if (!match) {
		throw new SheetQueryError("Unexpected response format from Google Sheets query");
	}

	let payload;
	try {
		payload = JSON.parse(match[1]);
	} catch (e) {
		throw new SheetQueryError("Could not parse Google Sheets query response");
	}

	const status = String(payload.status || "").toLowerCase();
	if (status === "error") {
		const errors = payload.errors || [];
		const detail = errors.map((err) => err.detailed_message || err.message || "").join("; ");
		throw new SheetQueryError(`Query error: ${detail || "unknown gviz error"}`);
	}

	return payload.table || {};
}

/** Return the list of cell objects for a gviz table row (empty array if none). */
export function rowCells(row) {
	return row.c || [];
}

/** True if the cell exists and holds a non-blank value. */
export function cellIsNonempty(cell) {
	if (!cell) return false;
	const value = cell.v;
	if (value === null || value === undefined) return false;
	if (typeof value === "string" && value.trim() === "") return false;
	return true;
}

/** Best-effort string form of a cell's raw value. */
export function cellStr(cell) {
	if (!cell || cell.v === null || cell.v === undefined) return "";
	return String(cell.v).trim();
}
