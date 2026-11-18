import type ExcelJS from "exceljs";
import type { Cell, Grid, SheetGrid } from "./types";

// Turns a workbook into plain grids of text and numbers. Runs in the browser, so the file
// itself is never uploaded; only the sheet someone chooses is sent, as values.

const MAX_ROWS = 600;
const MAX_COLS = 80;
const MAX_CELL = 4000;

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") return v.slice(0, MAX_CELL);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("").slice(0, MAX_CELL);
    if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
    // Hyperlinks hold their text as plain or rich text.
    if ("text" in v) return cellValue((v as { text: ExcelJS.CellValue }).text);
    if ("error" in v) return null;
  }
  return String(v).slice(0, MAX_CELL);
}

export function workbookToGrids(wb: ExcelJS.Workbook): SheetGrid[] {
  const out: SheetGrid[] = [];
  wb.eachSheet((ws) => {
    const rows: Grid = [];
    const last = Math.min(ws.actualRowCount ? ws.rowCount : 0, MAX_ROWS);
    for (let r = 1; r <= last; r++) {
      const row = ws.getRow(r);
      const cells: Cell[] = [];
      const width = Math.min(row.cellCount, MAX_COLS);
      for (let c = 1; c <= width; c++) cells.push(cellValue(row.getCell(c).value));
      while (cells.length && (cells[cells.length - 1] === null || cells[cells.length - 1] === "")) cells.pop();
      rows.push(cells);
    }
    while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
    if (rows.some((r) => r.length)) out.push({ name: ws.name, rows, totalRows: ws.actualRowCount });
  });
  return out;
}

// CSV (comma, semicolon or tab separated), with quoted fields.
export function csvToGrid(textIn: string): Grid {
  const text = textIn.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: Grid = [];
  let row: Cell[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS).map((c) => {
    const s = String(c).trim();
    return s === "" ? null : s.slice(0, MAX_CELL);
  }));
}
