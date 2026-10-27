import type { Snippet } from "./types";

const CONTEXT_LINES = 3;
const MAX_LINE_LENGTH = 240;

// The lines around a finding, so the UI can show the code without another fetch.
export function snippetAt(source: string, line: number): Snippet | undefined {
  const lines = source.split("\n");
  if (!Number.isInteger(line) || line < 1 || line > lines.length) {
    return undefined;
  }
  const start = Math.max(1, line - CONTEXT_LINES);
  const end = Math.min(lines.length, line + CONTEXT_LINES);
  return {
    start,
    lines: lines
      .slice(start - 1, end)
      .map((l) =>
        l.length > MAX_LINE_LENGTH ? `${l.slice(0, MAX_LINE_LENGTH)} ...` : l,
      ),
  };
}
