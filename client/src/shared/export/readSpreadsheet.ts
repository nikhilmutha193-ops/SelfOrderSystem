type Cell = string | number | boolean | Date | null | undefined;

/**
 * Reads the first sheet of an .xlsx file, or a .csv file, into one object per row, keyed by the header in row 1. Used by
 * every "import from Excel" screen; the server decides what the columns mean. `rows` names what is under the header,
 * for the message when there is nothing.
 */
export async function readSpreadsheet(file: File, rows = "rows"): Promise<Record<string, unknown>[]> {
  let table: Cell[][];
  if (/\.csv$/i.test(file.name)) {
    const { parseCsv } = await import("./excel");
    table = parseCsv(await file.text());
  } else {
    const { readSheet } = await import("read-excel-file/browser");
    table = (await readSheet(file)) as Cell[][];
  }
  if (table.length < 2) throw new Error(`The file has a header row but no ${rows} under it`);
  const headers = table[0].map((h) => String(h ?? "").trim());
  return table.slice(1).map((cells) => {
    const row: Record<string, unknown> = {};
    headers.forEach((header, i) => {
      if (!header) return;
      const cell = cells[i];
      row[header] = cell instanceof Date ? cell.toISOString() : (cell ?? "");
    });
    return row;
  });
}
