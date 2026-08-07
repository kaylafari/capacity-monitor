/**
 * Date normalization helpers for comparing sheet cell values to a requested date.
 */

// gviz represents Date-typed cells as a raw value like "Date(2026,7,6)"
// (year, 0-indexed month, day).
const GVIZ_DATE_RE = /^Date\((\d+),(\d+),(\d+)\)$/;

function pad(n) {
	return String(n).padStart(2, "0");
}

function toIso(year, month, day) {
	return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Normalize a date-like string (ISO, gviz Date(), or common US format) to YYYY-MM-DD.
 * Returns null if the value can't be parsed as a date.
 */
export function normalizeDate(value) {
	value = (value || "").trim();
	if (!value) return null;

	const gvizMatch = value.match(GVIZ_DATE_RE);
	if (gvizMatch) {
		const year = Number(gvizMatch[1]);
		const month = Number(gvizMatch[2]) + 1; // gviz months are 0-indexed
		const day = Number(gvizMatch[3]);
		return toIso(year, month, day);
	}

	// ISO: YYYY-MM-DD
	let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
	if (match) {
		return toIso(Number(match[1]), Number(match[2]), Number(match[3]));
	}

	// US: MM/DD/YYYY or MM-DD-YYYY
	match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
	if (match) {
		return toIso(Number(match[3]), Number(match[1]), Number(match[2]));
	}

	// YYYY/MM/DD
	match = value.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
	if (match) {
		return toIso(Number(match[1]), Number(match[2]), Number(match[3]));
	}

	// US with 2-digit year: MM/DD/YY or MM-DD-YY (assumes 2000s)
	match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
	if (match) {
		return toIso(2000 + Number(match[3]), Number(match[1]), Number(match[2]));
	}

	// "August 6, 2026" / "Aug 6, 2026"
	const parsed = Date.parse(value);
	if (!Number.isNaN(parsed)) {
		const d = new Date(parsed);
		return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
	}

	return null;
}
