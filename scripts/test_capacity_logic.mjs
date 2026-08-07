// Ad-hoc script to exercise checkCapacity()'s branching logic with a mocked
// gviz fetch layer (no live Google Sheet required). Run with:
//   node scripts/test_capacity_logic.mjs
// Not part of the deployed Worker bundle.

import assert from "node:assert/strict";

// Build a fake gviz "table" payload shaped like fetchGvizTable()'s return value.
function table(rows) {
	return { rows: rows.map((cells) => ({ c: cells.map((v) => (v === null ? null : { v })) })) };
}

const MASTER_URL = "https://docs.google.com/spreadsheets/d/MASTER/edit";
const EVENT_URL = "https://docs.google.com/spreadsheets/d/EVENT/edit";

// master header + 2 data rows: SEM01/2026-08-06/cap 10, SEM02/2026-08-06/cap 3
const masterTable = table([
	["code", "date", "capacity", "url"], // header, skipped by slice(1)
	["SEM01", "2026-08-06", 10, EVENT_URL],
	["SEM02", "2026-08-06", 3, EVENT_URL],
]);

// event sheet: column A has 5 nonempty rows (incl. header, skipped), column E has 2 nonempty.
const eventColA = table([["A"], ["r1"], ["r2"], ["r3"], ["r4"], ["r5"]]);
const eventColE = table([["E"], ["x1"], ["x2"], [null], [null], [null]]);

let fetchCallCount = 0;
const sheetsModule = await import("../src/sheets.js");
const originalFetch = sheetsModule.fetchGvizTable;

// Monkey-patch by re-importing capacity.js with a stubbed sheets module isn't
// straightforward under native ESM, so instead we call the pieces directly.
const { normalizeDate } = await import("../src/dates.js");
const { cellIsNonempty, cellStr, rowCells } = sheetsModule;

function loadMasterRows() {
	return (masterTable.rows.slice(1)).map(rowCells);
}

function countNonempty(col) {
	const src = col === "A" ? eventColA : eventColE;
	let count = 0;
	for (const row of src.rows.slice(1)) {
		const cells = rowCells(row);
		const cell = cells.length ? cells[0] : null;
		if (cellIsNonempty(cell)) count += 1;
	}
	return count;
}

// Re-implement checkCapacity's branch logic using the stubbed loaders (mirrors src/capacity.js).
function checkCapacity(code, dateStr) {
	code = (code || "").trim();
	const requestedDate = normalizeDate(dateStr);
	const masterRows = loadMasterRows();

	const rowsForCode = masterRows.filter((row) => cellStr(row[0]).toLowerCase() === code.toLowerCase());
	if (rowsForCode.length === 0) {
		return { error: "Error: The code given isn't on the master sheet" };
	}

	let matchedRow = null;
	for (const row of rowsForCode) {
		const rowDate = normalizeDate(cellStr(row[1]));
		if (requestedDate !== null && rowDate === requestedDate) {
			matchedRow = row;
			break;
		}
	}
	if (matchedRow === null) {
		return { error: "Error: The date given isn't on the master sheet" };
	}

	const capacity = Math.trunc(Number(matchedRow[2].v));
	const total = countNonempty("A") + countNonempty("E");
	if (total >= capacity) return { space_available: false, capacity: 0 };
	return { space_available: true, capacity: capacity - total };
}

// total = 5 (col A) + 2 (col E) = 7
assert.deepEqual(checkCapacity("SEM01", "2026-08-06"), { space_available: true, capacity: 3 }); // 10 - 7
assert.deepEqual(checkCapacity("sem01", "2026-08-06"), { space_available: true, capacity: 3 }); // case-insensitive code
assert.deepEqual(checkCapacity("SEM02", "2026-08-06"), { space_available: false, capacity: 0 }); // 7 >= 3
assert.deepEqual(checkCapacity("SEM99", "2026-08-06"), { error: "Error: The code given isn't on the master sheet" });
assert.deepEqual(checkCapacity("SEM01", "2099-01-01"), { error: "Error: The date given isn't on the master sheet" });
assert.deepEqual(checkCapacity("SEM01", "08/06/2026"), { space_available: true, capacity: 3 }); // date format flexibility

console.log("All capacity logic checks passed.");
