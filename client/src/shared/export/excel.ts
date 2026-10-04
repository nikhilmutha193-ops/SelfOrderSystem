export type ExcelValue = string | number | boolean | Date | null | undefined;

export interface ExcelColumn<T> {
  header: string;
  value: (row: T) => ExcelValue;
  width?: number;
  format?: string;
}

export interface ExcelSheet<T> {
  name: string;
  columns: ExcelColumn<T>[];
  rows: T[];
}

export type AnySheet = ExcelSheet<any>;

export function sheet<T>(s: ExcelSheet<T>): AnySheet {
  return s;
}

export const MONEY = "#,##0.00";
export const PERCENT = "0.0%";
export const DATE_TIME = "dd/mm/yyyy hh:mm";
export const DATE = "dd/mm/yyyy";

function safeSheetName(name: string) {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1";
}

function cell(value: ExcelValue, format?: string) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : { value, format: format ?? DATE_TIME };
  if (typeof value === "number") return Number.isFinite(value) ? { value, ...(format && { format }) } : null;
  return { value };
}

function sheetData<T>(sheet: ExcelSheet<T>) {
  const header = sheet.columns.map((c) => ({
    value: c.header,
    fontWeight: "bold" as const,
    backgroundColor: "#F1F5F9",
  }));
  const body = sheet.rows.map((row) => sheet.columns.map((c) => cell(c.value(row), c.format)));
  return {
    data: [header, ...body],
    sheet: safeSheetName(sheet.name),
    columns: sheet.columns.map((c) => ({
      width: c.width ?? Math.min(40, Math.max(10, c.header.length + 2)),
    })),
    stickyRowsCount: 1,
  };
}

export function excelFileName(base: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${base.replace(/[^\w-]+/g, "-")}-${stamp}.xlsx`;
}

export async function downloadExcel(fileName: string, sheets: AnySheet[]) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const name = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  await writeXlsxFile(sheets.map(sheetData) as Parameters<typeof writeXlsxFile>[0], {
    fontFamily: "Calibri",
    fontSize: 11,
  }).toFile(name);
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v !== ""));
}

const NUMERIC = /^-?(0|[1-9]\d{0,10})(\.\d+)?$/;

export function csvToSheet(name: string, text: string): ExcelSheet<string[]> {
  const [header = [], ...rows] = parseCsv(text);
  return {
    name,
    rows,
    columns: header.map((h, index) => ({
      header: h,
      width: Math.min(40, Math.max(10, h.length + 2, ...rows.slice(0, 50).map((r) => (r[index] ?? "").length + 2))),
      value: (r: string[]) => {
        const v = r[index] ?? "";
        return NUMERIC.test(v) ? Number(v) : v;
      },
    })),
  };
}
