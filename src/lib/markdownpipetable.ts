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
  delimiter: "|" | "｜" | "／" | "/";
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
  const delimiter = trimmed.includes("|")
    ? "|"
    : trimmed.includes("｜")
      ? "｜"
      : trimmed.includes("／")
        ? "／"
        : /\s\/\s/u.test(trimmed)
          ? "/"
          : null;
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

function isEmptyPipeLine(line: SourceLine): boolean {
  return /^[|｜／]$/u.test(line.text.trim());
}

function getCellText(cell: MarkdownPipeTableCell, text: string): string {
  return text.slice(cell.start, cell.end);
}

function splitLeadingRowLabel(row: ParsedPipeLine, text: string): ParsedPipeLine | null {
  const first = row.cells[0];
  if (!first) return null;
  const firstText = getCellText(first, text);
  const match = /^(.{2,}?)[：:]\s*(\S.*)$/u.exec(firstText);
  if (!match || /^\d+$/u.test(match[1])) return null;

  const valueStart = first.start + match[0].length - match[2].length;
  return {
    ...row,
    cells: [
      { start: first.start, end: first.start + match[1].length },
      { start: valueStart, end: first.end },
      ...row.cells.slice(1),
    ],
  };
}

function expandLeadingRowLabels(
  rows: ParsedPipeLine[],
  text: string,
  expectedColumns?: number,
): ParsedPipeLine[] {
  const expanded = rows.map((row) => {
    if (expectedColumns !== undefined && row.cells.length !== expectedColumns - 1) return row;
    return splitLeadingRowLabel(row, text) ?? row;
  });
  if (expectedColumns !== undefined) {
    return expanded.every((row) => row.cells.length === expectedColumns) ? expanded : rows;
  }

  const changedCount = expanded.filter((row, index) => row !== rows[index]).length;
  const columnCounts = new Set(expanded.map((row) => row.cells.length));
  return changedCount > 0 && columnCounts.size === 1 ? expanded : rows;
}

interface PairedValueRow {
  line: SourceLine;
  label: MarkdownPipeTableCell;
  firstValue: MarkdownPipeTableCell;
  secondValue: MarkdownPipeTableCell;
  firstHeader: MarkdownPipeTableCell;
  secondHeader: MarkdownPipeTableCell;
  firstDescriptor: string;
  secondDescriptor: string;
}

function parsePairedValueRow(line: SourceLine): PairedValueRow | null {
  const leading = line.text.length - line.text.trimStart().length;
  const trimmed = line.text.trim();
  const labelMatch = /^(.+?)[：:]\s*(.+)$/u.exec(trimmed);
  if (!labelMatch) return null;
  const label = labelMatch[1].trimEnd();
  const values = labelMatch[2].trim();
  const pairMatch = /^(.+?)\s*(?:（([^）]+)）|\(([^)]+)\))\s*[、,]\s*(.+?)\s*(?:（([^）]+)）|\(([^)]+)\))$/u.exec(values);
  if (!pairMatch || !/\d/u.test(pairMatch[1]) || !/\d/u.test(pairMatch[4])) return null;

  const firstDescriptor = pairMatch[2] ?? pairMatch[3];
  const secondDescriptor = pairMatch[5] ?? pairMatch[6];
  if (!firstDescriptor || !secondDescriptor) return null;

  const rowStart = line.start + leading;
  const labelStart = rowStart;
  const labelEnd = labelStart + label.length;
  const valuesStart = rowStart + trimmed.indexOf(values);
  const firstValueOffset = values.indexOf(pairMatch[1]);
  const firstDescriptorOffset = values.indexOf(firstDescriptor, firstValueOffset + pairMatch[1].length);
  const secondValueOffset = values.indexOf(pairMatch[4], firstDescriptorOffset + firstDescriptor.length);
  const secondDescriptorOffset = values.indexOf(secondDescriptor, secondValueOffset + pairMatch[4].length);
  if ([firstValueOffset, firstDescriptorOffset, secondValueOffset, secondDescriptorOffset].some((offset) => offset < 0)) return null;

  return {
    line,
    label: { start: labelStart, end: labelEnd },
    firstValue: { start: valuesStart + firstValueOffset, end: valuesStart + firstValueOffset + pairMatch[1].length },
    secondValue: { start: valuesStart + secondValueOffset, end: valuesStart + secondValueOffset + pairMatch[4].length },
    firstHeader: { start: valuesStart + firstDescriptorOffset, end: valuesStart + firstDescriptorOffset + firstDescriptor.length },
    secondHeader: { start: valuesStart + secondDescriptorOffset, end: valuesStart + secondDescriptorOffset + secondDescriptor.length },
    firstDescriptor,
    secondDescriptor,
  };
}

function findPairedValueTables(lines: SourceLine[]): MarkdownPipeTable[] {
  const tables: MarkdownPipeTable[] = [];
  for (let index = 0; index < lines.length; index++) {
    const first = parsePairedValueRow(lines[index]);
    if (!first) continue;
    const rows = [first];
    let rowIndex = index + 1;
    while (rowIndex < lines.length) {
      const row = parsePairedValueRow(lines[rowIndex]);
      if (!row || row.firstDescriptor !== first.firstDescriptor || row.secondDescriptor !== first.secondDescriptor) break;
      rows.push(row);
      rowIndex++;
    }
    if (rows.length < 3) continue;

    tables.push({
      start: first.line.start,
      end: rows[rows.length - 1].line.end,
      header: [
        { start: first.line.start, end: first.line.start },
        first.firstHeader,
        first.secondHeader,
      ],
      rows: rows.map((row) => [row.label, row.firstValue, row.secondValue]),
    });
    index = rowIndex - 1;
  }
  return tables;
}

function useFirstRowAsHeader(candidates: ParsedPipeLine[], text: string): boolean {
  // Unframed source tables can be headerless; require multiple label-like cells to avoid treating long data cells as headings.
  const first = candidates[0];
  if (!first || candidates.length < 2) return false;
  if (first.cells.some((cell) => cell.start === cell.end)) return true;
  if (candidates.some((row) => row.cells.length > first.cells.length)) return false;
  const firstCellText = getCellText(first.cells[0], text).trim();
  if (/^(?:時間帯|khung giờ)$/iu.test(firstCellText)) return true;
  if (/^(?:[（(]?項目(?:[:：]|$)|【(?:表|bảng)[:：])/iu.test(firstCellText)) return true;
  const headerCue = /(?:クラス名|種類|項目|日時|日付|曜日|開始時間|時間帯|活動|場所|会場|内容|目的|制限|料金|募集|対象|期間|販売できる物|名前|利用|合計|数|tên|số lượng|số|tổng|loại|ngày|thứ|giờ|khung giờ|hoạt động|địa điểm|nội dung|mục đích|giới hạn|phí)/iu;
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

/** Finds delimited and repeated paired-value tables while retaining source offsets for each cell. */
export function findMarkdownPipeTables(text: string): MarkdownPipeTable[] {
  const lines = getLines(text);
  const tables: MarkdownPipeTable[] = findPairedValueTables(lines);

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
      const parsedRows: ParsedPipeLine[] = [];
      let rowIndex = index + 2;
      while (rowIndex < lines.length) {
        // Some translated exam tables contain a lone pipe after each row.
        // It is a formatting artifact, not the end of the table.
        if (isEmptyPipeLine(lines[rowIndex])) { rowIndex++; continue; }
        const row = parsePipeLine(lines[rowIndex]);
        if (!row || row.delimiter !== first.delimiter || isSeparatorRow(row.cells, text)) break;
        parsedRows.push(row);
        rowIndex++;
      }
      if (parsedRows.length === 0) continue;

      const expandedRows = expandLeadingRowLabels(parsedRows, text, header.length);
      const rows = expandedRows.map((row) => fitRow(row.cells, header.length));
      if (rows.some((row) => row === null)) continue;

      tables.push({ start: lines[index].start, end: lines[rowIndex - 1].end, header, rows: rows as MarkdownPipeTableCell[][] });
      index = rowIndex - 1;
      continue;
    }

    const candidates: ParsedPipeLine[] = [first];
    let rowIndex = index + 1;
    while (rowIndex < lines.length) {
      if (isEmptyPipeLine(lines[rowIndex])) { rowIndex++; continue; }
      const row = parsePipeLine(lines[rowIndex]);
      if (!row || row.delimiter !== first.delimiter || isSeparatorRow(row.cells, text)) break;
      candidates.push(row);
      rowIndex++;
    }
    if (candidates.length < 2) continue;

    const expandedCandidates = expandLeadingRowLabels(candidates, text);
    const hasHeader = useFirstRowAsHeader(expandedCandidates, text);
    const header = hasHeader ? expandedCandidates[0].cells : undefined;
    const rawDataCandidates = hasHeader ? expandedCandidates.slice(1) : expandedCandidates;
    const dataCandidates = header
      ? expandLeadingRowLabels(rawDataCandidates, text, header.length)
      : rawDataCandidates;
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

  return tables.sort((left, right) => left.start - right.start);
}
