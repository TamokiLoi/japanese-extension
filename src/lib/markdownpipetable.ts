export interface MarkdownPipeTableCell {
  start: number;
  end: number;
  colSpan?: number;
}

export interface MarkdownPipeTable {
  start: number;
  end: number;
  header?: MarkdownPipeTableCell[];
  rows: MarkdownPipeTableCell[][];
}

interface SourceLine {
  start: number;
  end: number;
  text: string;
}

interface ParsedPipeLine {
  cells: MarkdownPipeTableCell[];
  delimiter: "|" | "｜";
}

function getLines(text: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;
  while (start < text.length) {
    const newline = text.indexOf("\n", start);
    const contentEnd = newline < 0 ? text.length : newline;
    lines.push({
      start,
      end: newline < 0 ? text.length : newline + 1,
      text: text.slice(start, contentEnd),
    });
    start = newline < 0 ? text.length : newline + 1;
  }
  return lines;
}

function parsePipeLine(line: SourceLine): ParsedPipeLine | null {
  const leading = line.text.length - line.text.trimStart().length;
  const trimmed = line.text.trim();
  const delimiter = trimmed.includes("|") ? "|" : trimmed.includes("｜") ? "｜" : null;
  if (!delimiter) return null;

  const startsWithDelimiter = trimmed.startsWith(delimiter);
  const endsWithDelimiter = trimmed.endsWith(delimiter);
  const contentStart = startsWithDelimiter ? 1 : 0;
  const contentEnd = trimmed.length - (endsWithDelimiter ? 1 : 0);
  const cells: MarkdownPipeTableCell[] = [];
  let cellStart = contentStart;

  for (let index = contentStart; index <= contentEnd; index++) {
    if (index < contentEnd && trimmed[index] !== delimiter) continue;
    const rawCell = trimmed.slice(cellStart, index);
    const content = rawCell.trim();
    const leftPadding = rawCell.length - rawCell.trimStart().length;
    const base = line.start + leading + cellStart + leftPadding;
    cells.push({ start: base, end: base + content.length });
    cellStart = index + 1;
  }

  return cells.length >= 2 ? { cells, delimiter } : null;
}

function isSeparatorRow(cells: MarkdownPipeTableCell[], text: string): boolean {
  return cells.every(({ start, end }) => /^:?-{3,}:?$/u.test(text.slice(start, end)));
}

function getCellText(cell: MarkdownPipeTableCell, text: string): string {
  return text.slice(cell.start, cell.end);
}

function useFirstRowAsHeader(candidates: ParsedPipeLine[], text: string): boolean {
  // Unframed source tables can be headerless; require multiple label-like cells to avoid treating long data cells as headings.
  const first = candidates[0];
  if (!first || candidates.length < 2) return false;
  if (first.cells.some((cell) => cell.start === cell.end)) return true;
  if (candidates.some((row) => row.cells.length > first.cells.length)) return false;
  const headerCue = /(?:クラス名|種類|項目|日時|日付|曜日|開始時間|活動|場所|会場|内容|目的|制限|料金|募集|対象|期間|販売できる物)/u;
  return first.cells.filter((cell) => headerCue.test(getCellText(cell, text))).length >= 2;
}

function fitRow(cells: MarkdownPipeTableCell[], columnCount: number): MarkdownPipeTableCell[] | null {
  // Some exam rows merge the remaining columns instead of repeating empty cells.
  if (cells.length === 0 || cells.length > columnCount) return null;
  const result = cells.map((cell) => ({ ...cell }));
  if (result.length < columnCount) {
    const last = result[result.length - 1];
    last.colSpan = columnCount - result.length + 1;
  }
  return result;
}

/** Finds pipe-delimited tables and retains source offsets for rendering each cell. */
export function findMarkdownPipeTables(text: string): MarkdownPipeTable[] {
  const lines = getLines(text);
  const tables: MarkdownPipeTable[] = [];

  for (let index = 0; index + 1 < lines.length; index++) {
    const first = parsePipeLine(lines[index]);
    if (!first) continue;

    const second = parsePipeLine(lines[index + 1]);
    const hasSeparator =
      second?.delimiter === first.delimiter &&
      second.cells.length === first.cells.length &&
      isSeparatorRow(second.cells, text);

    if (hasSeparator) {
      const header = first.cells;
      const rows: MarkdownPipeTableCell[][] = [];
      let rowIndex = index + 2;
      while (rowIndex < lines.length) {
        const row = parsePipeLine(lines[rowIndex]);
        if (!row || row.delimiter !== first.delimiter || isSeparatorRow(row.cells, text)) break;
        const fitted = fitRow(row.cells, header.length);
        if (!fitted) break;
        rows.push(fitted);
        rowIndex++;
      }
      if (rows.length === 0) continue;

      tables.push({ start: lines[index].start, end: lines[rowIndex - 1].end, header, rows });
      index = rowIndex - 1;
      continue;
    }

    const candidates: ParsedPipeLine[] = [first];
    let rowIndex = index + 1;
    while (rowIndex < lines.length) {
      const row = parsePipeLine(lines[rowIndex]);
      if (!row || row.delimiter !== first.delimiter || isSeparatorRow(row.cells, text)) break;
      candidates.push(row);
      rowIndex++;
    }
    if (candidates.length < 2) continue;

    const hasHeader = useFirstRowAsHeader(candidates, text);
    const header = hasHeader ? candidates[0].cells : undefined;
    const dataCandidates = hasHeader ? candidates.slice(1) : candidates;
    const columnCount = header?.length ?? Math.max(...dataCandidates.map((row) => row.cells.length));
    const rows = dataCandidates.map((row) => fitRow(row.cells, columnCount));
    if (rows.some((row) => row === null)) continue;

    tables.push({
      start: lines[index].start,
      end: lines[rowIndex - 1].end,
      ...(header ? { header } : {}),
      rows: rows as MarkdownPipeTableCell[][],
    });
    index = rowIndex - 1;
  }

  return tables;
}
