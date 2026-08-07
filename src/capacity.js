/**
 * Core capacity-check logic: master sheet lookup + target sheet row counts.
 */

import { normalizeDate } from "./dates.js";
import { cellIsNonempty, cellStr, fetchGvizTable, rowCells, SheetQueryError } from "./sheets.js";

// Master sheet column layout: code, capacity, date, url (in that order, with a header row).
const MASTER_CODE_COL = "A";
const MASTER_CAPACITY_COL = "B";
const MASTER_DATE_COL = "C";
const MASTER_URL_COL = "D";

// On the linked (per-event) sheet: overall nonempty-row count comes from column A,
// plus the nonempty-row count in column E.
const TARGET_COUNT_COL = "A";
const TARGET_EXTRA_COL = "E";

export class MasterLookupError extends Error {
	constructor(message) {
		super(message);
		this.message = message;
	}
}

async function loadMasterRows(masterSheetRef) {
	const table = await fetchGvizTable(
		masterSheetRef,
		`select ${MASTER_CODE_COL},${MASTER_DATE_COL},${MASTER_CAPACITY_COL},${MASTER_URL_COL}`
	);
	const rows = table.rows || [];
	// gviz auto-detects a header row (based on column type) and excludes it from `rows`.
	return rows.map(rowCells);
}

async function countNonempty(sheetRef, column) {
	const table = await fetchGvizTable(sheetRef, `select ${column}`);
	const rows = table.rows || [];
	let count = 0;
	// gviz auto-detects a header row (based on column type) and excludes it from `rows`.
	for (const row of rows) {
		const cells = rowCells(row);
		const cell = cells.length ? cells[0] : null;
		if (cellIsNonempty(cell)) count += 1;
	}
	return count;
}

/**
 * Look up `code`/`dateStr` on the master sheet, then check the linked sheet's
 * row counts against the master sheet's capacity value for that row.
 */
export async function checkCapacity(masterSheetRef, code, dateStr) {
	code = (code || "").trim();
	const requestedDate = normalizeDate(dateStr);

	const masterRows = await loadMasterRows(masterSheetRef);

	const rowsForCode = masterRows.filter((row) => cellStr(row[0]).toLowerCase() === code.toLowerCase());
	if (rowsForCode.length === 0) {
		throw new MasterLookupError("Error: The code given isn't on the master sheet");
	}

	let matchedRow = null;
	for (const row of rowsForCode) {
		const rowDate = normalizeDate(cellStr(row.length > 1 ? row[1] : null));
		if (requestedDate !== null && rowDate === requestedDate) {
			matchedRow = row;
			break;
		}
	}
	if (matchedRow === null) {
		throw new MasterLookupError("Error: The date given isn't on the master sheet");
	}

	const capacityCell = matchedRow.length > 2 ? matchedRow[2] : null;
	const urlCell = matchedRow.length > 3 ? matchedRow[3] : null;

	const capacityRaw = capacityCell ? capacityCell.v : null;
	const capacityFloat = Number(capacityRaw);
	if (capacityRaw === null || capacityRaw === undefined || Number.isNaN(capacityFloat)) {
		throw new SheetQueryError("Master sheet capacity value is not a number");
	}
	const capacity = Math.trunc(capacityFloat);

	const targetSheetRef = cellStr(urlCell);
	if (!targetSheetRef) {
		throw new SheetQueryError("Master sheet row is missing a url");
	}

	const mainCount = await countNonempty(targetSheetRef, TARGET_COUNT_COL);
	const extraCount = await countNonempty(targetSheetRef, TARGET_EXTRA_COL);
	const total = mainCount + extraCount;

	if (total >= capacity) {
		return { spaceAvailable: false, capacity: 0 };
	}
	return { spaceAvailable: true, capacity: capacity - total };
}
