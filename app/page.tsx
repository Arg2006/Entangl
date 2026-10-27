"use client";

import { useEffect, useRef, useState } from "react";
import {
  SEVERITIES,
  type Finding,
  type ReviewResult,
  type Severity,
} from "@/lib/types";

const DEFAULT_REPO = "https://github.com/OWASP/NodeGoat";

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "bg-[var(--crit-bg)] text-[var(--crit-ink)]",
  high: "bg-[var(--high-bg)] text-[var(--high-ink)]",
  medium: "bg-[var(--med-bg)] text-[var(--med-ink)]",
  low: "bg-[var(--low-bg)] text-[var(--low-ink)]",
};

type Status = "idle" | "loading" | "done" | "error";

export default function Home() {
  const [repoUrl, setRepoUrl] = useState(DEFAULT_REPO);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  async function runReview(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading") return;

    setStatus("loading");
    setError("");
    setResult(null);
    setElapsed(0);
    const started = Date.now();
    timer.current = setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      250,
    );

    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The review failed.");
      setResult(data as ReviewResult);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The review failed.");
      setStatus("error");
    } finally {
      if (timer.current) clearInterval(timer.current);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight">
              Entangl
            </span>
          </div>
          <a
            href="#ci"
            className="text-sm text-muted transition-colors hover:text-ink"
          >
            Add to CI
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 sm:px-6">
        <section className="pt-16 pb-10 sm:pt-24">
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            Point it at a repo.
            <br />
            <span className="text-muted">Get a security review.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Paste a public GitHub link. We pull the files most likely to hide
            a vulnerability, have Claude read them line by line, and hand back
            findings you can fix today.
          </p>

          <form
            onSubmit={runReview}
            className="mt-10 flex max-w-3xl flex-col gap-3 rounded-2xl border border-line bg-surface p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)] sm:flex-row"
          >
            <label className="flex flex-1 items-center gap-3 px-3">
              <GitHubIcon />
              <span className="sr-only">GitHub repository URL</span>
              <input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                spellCheck={false}
                autoComplete="off"
                className="h-12 w-full bg-transparent font-mono text-[15px] outline-none placeholder:text-muted/60"
              />
            </label>
            <button
              type="submit"
              disabled={status === "loading" || !repoUrl.trim()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-[15px] font-medium text-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "loading" ? (
                <>
                  <Spinner />
                  Reviewing
                </>
              ) : (
                "Run review"
              )}
            </button>
          </form>
          <p className="mt-3 max-w-3xl px-1 text-sm text-muted">
            Public repos only. We look at up to 10 files that touch auth,
            sessions, queries, uploads and config, plus known CVEs in
            package.json.
          </p>
        </section>

        {status === "loading" && <LoadingState repoUrl={repoUrl} elapsed={elapsed} />}

        {status === "error" && (
          <div className="rounded-2xl border border-[var(--crit-ink)]/25 bg-[var(--crit-bg)] px-5 py-4 text-[15px] text-[var(--crit-ink)]">
            {error}
          </div>
        )}

        {status === "done" && result && <Results result={result} />}

        <CiBlock />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 text-sm text-muted sm:px-6">
          <span>Entangl</span>
          <span>Reviews are a starting point, not a pentest.</span>
        </div>
      </footer>
    </div>
  );
}

function LoadingState({
  repoUrl,
  elapsed,
}: {
  repoUrl: string;
  elapsed: number;
}) {
  const message =
    elapsed < 3
      ? "Reading the file tree"
      : elapsed < 6
        ? "Pulling the files worth reading"
        : "Claude is reviewing the code";

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <Spinner />
          <span className="text-[15px] font-medium">{message}</span>
        </div>
        <span className="font-mono text-sm tabular-nums text-muted">
          {elapsed}s
        </span>
      </div>
      <div className="space-y-px">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 px-5 py-5">
            <div className="skeleton h-4 w-48 rounded" />
            <div className="skeleton h-5 w-16 rounded-full" />
            <div className="skeleton h-4 flex-1 rounded" />
          </div>
        ))}
      </div>
      <p className="border-t border-line px-5 py-3 text-sm text-muted">
        Reviewing {shortRepo(repoUrl)}. This usually takes 20 to 40 seconds.
      </p>
    </section>
  );
}

function Results({ result }: { result: ReviewResult }) {
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
            <Chevron />
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
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[920px] border-collapse text-left text-[14px]">
        <thead>
          <tr className="border-b border-line bg-surface-2 text-[13px] text-muted">
            <th className="px-5 py-3 font-medium">File</th>
            <th className="px-3 py-3 font-medium">Severity</th>
            <th className="px-3 py-3 font-medium">CWE</th>
            <th className="px-3 py-3 font-medium">Issue</th>
            <th className="px-5 py-3 font-medium">Suggested fix</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f, i) => (
            <tr
              key={`${f.file}:${f.line}:${i}`}
              className="border-b border-line align-top transition-colors last:border-0 hover:bg-surface-2"
            >
              <td className="max-w-[240px] px-5 py-4">
                <a
                  href={`https://github.com/${repo}/blob/HEAD/${f.file}${f.line ? `#L${f.line}` : ""}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[13px] leading-relaxed break-all hover:underline"
                >
                  {f.file}
                  {f.line > 0 && <span className="text-muted">:{f.line}</span>}
                </a>
              </td>
              <td className="px-3 py-4">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-[12px] font-semibold capitalize ${SEVERITY_STYLE[f.severity]}`}
                >
                  {f.severity}
                </span>
              </td>
              <td className="px-3 py-4 whitespace-nowrap">
                <CweLink cwe={f.cwe} />
              </td>
              <td className="px-3 py-4 leading-relaxed">{f.issue}</td>
              <td className="px-5 py-4 leading-relaxed text-muted">{f.fix}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

function ciYaml(origin: string) {
  return `name: Security review
on:
  pull_request:
    branches: [main]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Run Entangl review
        run: |
          curl -sf -X POST "${origin}/api/review" \\
            -H "Content-Type: application/json" \\
            -d '{"repoUrl": "https://github.com/\${{ github.repository }}"}' \\
            -o review.json
          jq -r '.findings[] | "\\(.severity)\\t\\(.file):\\(.line)\\t\\(.issue)"' review.json
          jq -e '[.findings[] | select(.severity == "critical")] | length == 0' review.json`;
}

function CiBlock() {
  const [origin, setOrigin] = useState("https://your-app.example.com");
  const [copied, setCopied] = useState(false);
  const yaml = ciYaml(origin);

  function onToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    if (e.currentTarget.open) setOrigin(window.location.origin);
  }

  async function copy() {
    await navigator.clipboard.writeText(yaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <details
      id="ci"
      onToggle={onToggle}
      className="group mt-16 scroll-mt-24 rounded-2xl border border-line bg-surface"
    >
      <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-5 sm:px-6">
        <div>
          <div className="text-[17px] font-semibold tracking-tight">
            Run this on every PR
          </div>
          <div className="mt-0.5 text-[15px] text-muted">
            Drop this into .github/workflows and the build fails when a
            critical issue lands.
          </div>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-muted transition group-open:rotate-45">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 1v12M1 7h12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </summary>
      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="relative overflow-hidden rounded-xl bg-code-bg">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
            <span className="font-mono text-[12px] text-white/50">
              .github/workflows/security-review.yml
            </span>
            <button
              type="button"
              onClick={copy}
              className="rounded-md px-2 py-1 text-[12px] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-code-ink">
            {yaml}
          </pre>
        </div>
      </div>
    </details>
  );
}

function shortRepo(url: string) {
  return url.replace(/^https?:\/\/(www\.)?github\.com\//, "").replace(/\/$/, "");
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <circle cx="8" cy="11" r="6" stroke="currentColor" strokeWidth="2" />
      <circle cx="14" cy="11" r="6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="shrink-0 text-muted"
      aria-hidden
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Chevron() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className="transition-transform group-open:rotate-90"
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
