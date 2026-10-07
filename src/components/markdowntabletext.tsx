import type { ReactNode } from "react";
import { findMarkdownPipeTables } from "../lib/markdownpipetable.ts";

/** Render translated notices with the same rows and columns as their Markdown source. */
export function MarkdownTableText({ text }: { text: string }) {
  const tables = findMarkdownPipeTables(text);
  if (tables.length === 0) return <div className="whitespace-pre-line">{text}</div>;

  const blocks: ReactNode[] = [];
  let cursor = 0;
  const renderCell = (start: number, end: number) =>
    text.slice(start, end).split(/<br\s*\/?>/giu).map((part, index) => (
      <span key={index}>{index > 0 ? <br /> : null}{part}</span>
    ));
  const addText = (end: number, key: string) => {
    const prose = text.slice(cursor, end).trim();
    if (prose) blocks.push(<div key={key} className="whitespace-pre-line">{prose}</div>);
  };

  tables.forEach((table, tableIndex) => {
    addText(table.start, `before-${tableIndex}`);
    const columnCount = table.header?.length ?? Math.max(...table.rows.map((row) => row.reduce((count, cell) => count + (cell.colSpan ?? 1), 0)));
    blocks.push(
      <div key={`table-${tableIndex}`} className="reading-markdown-table-scroll">
        <table className="reading-markdown-table" style={{ minWidth: `${Math.max(620, columnCount * 140)}px` }}>
          {table.header ? (
            <thead><tr>{table.header.map((cell, cellIndex) => (
              <th key={cellIndex} colSpan={cell.colSpan ?? 1} scope="col">{renderCell(cell.start, cell.end)}</th>
            ))}</tr></thead>
          ) : null}
          <tbody>{table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>{row.map((cell, cellIndex) => (
              <td key={cellIndex} colSpan={cell.colSpan ?? 1}>{renderCell(cell.start, cell.end)}</td>
            ))}</tr>
          ))}</tbody>
        </table>
      </div>,
    );
    cursor = table.end;
  });
  addText(text.length, "after-table");
  return <div className="reading-passage-text-blocks">{blocks}</div>;
}
