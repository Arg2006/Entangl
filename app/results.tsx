"use client";

import { Fragment, useState } from "react";
import {
  SEVERITIES,
  type Finding,
  type ReviewResult,
  type Severity,
  type Snippet,
} from "@/lib/types";

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "bg-[var(--crit-bg)] text-[var(--crit-ink)]",
  high: "bg-[var(--high-bg)] text-[var(--high-ink)]",
  medium: "bg-[var(--med-bg)] text-[var(--med-ink)]",
  low: "bg-[var(--low-bg)] text-[var(--low-ink)]",
};

// Marker colours for the highlighted line, picked to read on the dark code block.
const SEVERITY_MARK: Record<Severity, string> = {
  critical: "#f04438",
  high: "#f79009",
  medium: "#eaaa08",
  low: "#528bff",
};

export function Results({ result }: { result: ReviewResult }) {
  const counts = SEVERITIES.map((s) => ({
    severity: s,
    count: result.findings.filter((f) => f.severity === s).length,
  })).filter((c) => c.count > 0);

  return (
    <div className="space-y-10">
      <section>
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {result.findings.length === 0
                ? "Nothing found"
                : `${result.findings.length} ${result.findings.length === 1 ? "finding" : "findings"}`}
            </h2>
            <p className="mt-1 text-[15px] text-muted">
              in{" "}
              <a
                href={`https://github.com/${result.repo}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
              >
                {result.repo}
              </a>{" "}
              across {result.files.length} files
            </p>
          </div>
          {counts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {counts.map((c) => (
                <span
                  key={c.severity}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium capitalize ${SEVERITY_STYLE[c.severity]}`}
                >
                  <span className="tabular-nums">{c.count}</span> {c.severity}
                </span>
              ))}
            </div>
          )}
        </div>

        {result.findings.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface px-6 py-10 text-center text-muted">
            No vulnerabilities with a concrete line in the files we scanned.
          </div>
        ) : (
          <FindingsTable repo={result.repo} findings={result.findings} />
        )}

        <details className="group mt-4">
          <summary className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted hover:text-ink">
            <Chevron className="transition-transform group-open:rotate-90" />
            Files reviewed
          </summary>
          <ul className="mt-3 grid gap-1.5 font-mono text-[13px] text-muted sm:grid-cols-2">
            {result.files.map((f) => (
              <li key={f} className="truncate">
                <a
                  href={`https://github.com/${result.repo}/blob/HEAD/${f}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-ink"
                >
                  {f}
                </a>
              </li>
            ))}
          </ul>
        </details>
      </section>

      {result.dependencies.length > 0 && (
        <section>
          <h2 className="text-2xl font-semibold tracking-tight">
            Vulnerable dependencies
          </h2>
          <p className="mt-1 mb-5 text-[15px] text-muted">
            Packages in package.json with known advisories in the OSV database.
          </p>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            {result.dependencies.map((d, i) => (
              <div
                key={d.name}
                className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${i > 0 ? "border-t border-line" : ""}`}
              >
                <div className="font-mono text-[14px]">
                  {d.name}
                  <span className="text-muted">@{d.version}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {d.ids.slice(0, 6).map((id) => (
                    <a
                      key={id}
                      href={`https://osv.dev/vulnerability/${id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-[12px] text-muted transition-colors hover:border-ink/30 hover:text-ink"
                    >
                      {id}
                    </a>
                  ))}
                  {d.ids.length > 6 && (
                    <span className="px-1 py-0.5 text-[12px] text-muted">
                      +{d.ids.length - 6} more
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function FindingsTable({
  repo,
  findings,
}: {
  repo: string;
  findings: Finding[];
}) {
  // The most severe finding opens with its code showing.
  const [open, setOpen] = useState<Set<number>>(
    () => new Set(findings[0]?.snippet ? [0] : []),
  );

  function toggle(i: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[940px] border-collapse text-left text-[14px]">
        <thead>
          <tr className="border-b border-line bg-surface-2 text-[13px] text-muted">
            <th className="w-10 py-3 pl-4">
              <span className="sr-only">Code</span>
            </th>
            <th className="px-3 py-3 font-medium">File</th>
            <th className="px-3 py-3 font-medium">Severity</th>
            <th className="px-3 py-3 font-medium">CWE</th>
            <th className="px-3 py-3 font-medium">Issue</th>
            <th className="px-5 py-3 font-medium">Suggested fix</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f, i) => {
            const isOpen = open.has(i);
            const isLast = i === findings.length - 1;
            return (
              <Fragment key={`${f.file}:${f.line}:${i}`}>
                <tr
                  onClick={f.snippet ? () => toggle(i) : undefined}
                  className={`align-top transition-colors hover:bg-surface-2 ${f.snippet ? "cursor-pointer" : ""} ${isOpen || isLast ? "" : "border-b border-line"}`}
                >
                  <td className="py-4 pl-4">
                    {f.snippet && (
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={isOpen ? "Hide code" : "Show code"}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(i);
                        }}
                        className="-mt-0.5 flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-line hover:text-ink"
                      >
                        <Chevron
                          className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
                        />
                      </button>
                    )}
                  </td>
                  <td className="max-w-[240px] px-3 py-4">
                    <a
                      href={`https://github.com/${repo}/blob/HEAD/${f.file}${f.line ? `#L${f.line}` : ""}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={stop}
                      className="font-mono text-[13px] leading-relaxed break-all hover:underline"
                    >
                      {f.file}
                      {f.line > 0 && (
                        <span className="text-muted">:{f.line}</span>
                      )}
                    </a>
                  </td>
                  <td className="px-3 py-4">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-[12px] font-semibold capitalize ${SEVERITY_STYLE[f.severity]}`}
                    >
                      {f.severity}
                    </span>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap" onClick={stop}>
                    <CweLink cwe={f.cwe} />
                  </td>
                  <td className="px-3 py-4 leading-relaxed">{f.issue}</td>
                  <td className="px-5 py-4 leading-relaxed text-muted">
                    {f.fix}
                  </td>
                </tr>
                {isOpen && f.snippet && (
                  <tr className={isLast ? "" : "border-b border-line"}>
                    <td colSpan={6} className="px-4 pb-4">
                      <CodeSnippet
                        snippet={f.snippet}
                        line={f.line}
                        severity={f.severity}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CodeSnippet({
  snippet,
  line,
  severity,
}: {
  snippet: Snippet;
  line: number;
  severity: Severity;
}) {
  return (
    <div className="overflow-x-auto rounded-xl bg-code-bg py-3 font-mono text-[13px] leading-6 text-code-ink [tab-size:2]">
      {snippet.lines.map((text, j) => {
        const n = snippet.start + j;
        const hit = n === line;
        return (
          <div
            key={n}
            className={`flex min-w-max ${hit ? "bg-white/[0.07]" : ""}`}
            style={
              hit
                ? { boxShadow: `inset 3px 0 0 ${SEVERITY_MARK[severity]}` }
                : undefined
            }
          >
            <span className="w-14 shrink-0 pr-4 text-right text-white/35 select-none">
              {n}
            </span>
            <span className="pr-6 whitespace-pre">{text || " "}</span>
          </div>
        );
      })}
    </div>
  );
}

function CweLink({ cwe }: { cwe: string }) {
  const id = cwe.match(/\d+/)?.[0];
  if (!id) return <span className="text-muted">{cwe || "n/a"}</span>;
  return (
    <a
      href={`https://cwe.mitre.org/data/definitions/${id}.html`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-[13px] text-muted underline decoration-line underline-offset-4 hover:text-ink hover:decoration-ink"
    >
      CWE-{id}
    </a>
  );
}

function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M4.5 2.5 8 6l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
