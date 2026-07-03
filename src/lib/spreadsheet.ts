import * as XLSX from "xlsx";

export type ParsedSheet = {
  headers: string[];
  rows: string[][];
};

export async function parseSpreadsheet(file: File): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("The file has no sheets");
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  const grid = raw.map((row) => row.map((cell) => String(cell ?? "").trim()));
  const headerIndex = grid.findIndex((row) => row.some((cell) => cell !== ""));
  if (headerIndex === -1) throw new Error("The file is empty");
  return {
    headers: grid[headerIndex],
    rows: grid
      .slice(headerIndex + 1)
      .filter((row) => row.some((cell) => cell !== "")),
  };
}

const RSVP_VALUES = new Set([
  "attending",
  "declined",
  "no response",
  "accepted",
  "regrets",
  "yes",
  "no",
  "maybe",
]);

export type ColumnGuesses = {
  firstName: number | null;
  lastName: number | null;
  rsvp: number | null;
};

export function guessColumns(sheet: ParsedSheet): ColumnGuesses {
  const lower = sheet.headers.map((h) => h.toLowerCase());

  let firstName = lower.findIndex((h) => h.includes("first"));
  const lastName = lower.findIndex(
    (h) => h.includes("last") && !h.includes("blast"),
  );
  if (firstName === -1 && lastName === -1) {
    const nameCol = lower.findIndex((h) => h.includes("name"));
    firstName = nameCol;
  }

  // Prefer a "dinner" column, then "rsvp", then any column whose values look
  // like RSVP responses.
  let rsvp = lower.findIndex((h) => h.includes("dinner"));
  if (rsvp === -1) rsvp = lower.findIndex((h) => h.includes("rsvp"));
  if (rsvp === -1) {
    for (let col = 0; col < sheet.headers.length; col++) {
      if (col === firstName || col === lastName) continue;
      const values = distinctValues(sheet, col);
      if (
        values.length > 0 &&
        values.every((value) => RSVP_VALUES.has(value.toLowerCase()))
      ) {
        rsvp = col;
        break;
      }
    }
  }

  return {
    firstName: firstName === -1 ? null : firstName,
    lastName: lastName === -1 ? null : lastName,
    rsvp: rsvp === -1 ? null : rsvp,
  };
}

export function distinctValues(sheet: ParsedSheet, col: number): string[] {
  const seen = new Set<string>();
  for (const row of sheet.rows) {
    const value = row[col]?.trim();
    if (value) seen.add(value);
  }
  return [...seen];
}

export function defaultIncludeValues(values: string[]): string[] {
  return values.filter((value) => /attend|accept|yes/i.test(value));
}

export type ExtractedGuest = { firstName: string; lastName: string };

export function extractGuests(
  sheet: ParsedSheet,
  firstCol: number | null,
  lastCol: number | null,
  rsvpCol: number | null,
  includeValues: Set<string>,
): { included: ExtractedGuest[]; excluded: ExtractedGuest[] } {
  const included: ExtractedGuest[] = [];
  const excluded: ExtractedGuest[] = [];
  for (const row of sheet.rows) {
    let firstName = firstCol !== null ? (row[firstCol] ?? "").trim() : "";
    let lastName = lastCol !== null ? (row[lastCol] ?? "").trim() : "";
    // Single "name" column: split on the last space.
    if (firstName && !lastName && lastCol === null && firstName.includes(" ")) {
      const parts = firstName.split(/\s+/);
      lastName = parts.pop() ?? "";
      firstName = parts.join(" ");
    }
    if (!firstName && !lastName) continue;
    const guest = { firstName, lastName };
    if (rsvpCol === null || includeValues.has((row[rsvpCol] ?? "").trim())) {
      included.push(guest);
    } else {
      excluded.push(guest);
    }
  }
  return { included, excluded };
}
