export const maxDuration = 60;

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  SEVERITIES,
  type DependencyVuln,
  type Finding,
  type Severity,
} from "@/lib/types";
import { pickFiles, type TreeEntry } from "@/lib/pick-files";
import { snippetAt } from "@/lib/snippet";

const MODEL = "claude-sonnet-5-5";
const SYSTEM_PROMPT = `You are a senior application security reviewer. You will receive source files from a public GitHub repository. Each file starts with a "=== path ===" header and every line is prefixed with its line number.

Return ONLY a JSON array, with no prose and no code fences. Each element must have exactly these keys:
{"file": string, "line": number, "severity": "critical" | "high" | "medium" | "low", "cwe": string like "CWE-89", "issue": one sentence describing the vulnerability, "fix": one sentence describing the concrete fix}

Rules:
- Only report real, exploitable vulnerabilities that you can tie to a specific line in the code you were given.
- Use the exact file path from the header and the line number shown in the prefix.
- No style nits, no best practice suggestions, no speculation about code you cannot see.
- Report at most 15 findings, the most severe first.
- If there are no real vulnerabilities, return [].`;

class ReviewError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const IS_DEV = process.env.NODE_ENV === "development";

// Setup details are only shown locally, so visitors never see how the server
// is configured or the state of the Anthropic account. The detail always goes
// to the server log.
function serverError(publicMessage: string, detail: string, status = 500) {
  console.error(detail);
  return new ReviewError(IS_DEV ? detail : publicMessage, status);
}

const NAME = "[A-Za-z0-9_.-]+";

function parseRepo(input: string): { owner: string; repo: string } {
  const trimmed = input.trim().replace(/\/+$/, "").replace(/\.git$/, "");
  const match =
    trimmed.match(new RegExp(`github\\.com[/:](${NAME})/(${NAME})`, "i")) ??
    trimmed.match(new RegExp(`^(${NAME})/(${NAME})$`));
  // Reject "." and ".." so input can't walk to other GitHub API paths.
  if (!match || /^\.+$/.test(match[1]) || /^\.+$/.test(match[2])) {
    throw new ReviewError("That doesn't look like a GitHub repo URL.");
  }
  return { owner: match[1], repo: match[2] };
}

function githubHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "entangl-security-review",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function fetchTree(owner: string, repo: string): Promise<TreeEntry[]> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
    { headers: githubHeaders(), cache: "no-store" },
  );
  if (res.status === 404) {
    throw new ReviewError(
      `Couldn't find ${owner}/${repo}. Is it public?`,
      404,
    );
  }
  if (res.status === 403 || res.status === 429) {
    throw serverError(
      "GitHub is rate limiting reviews right now. Try again in a few minutes.",
      "GitHub rate limit hit. Set GITHUB_TOKEN in .env.local and try again.",
      429,
    );
  }
  if (!res.ok) {
    throw new ReviewError(`GitHub returned ${res.status}.`, 502);
  }
  const data = (await res.json()) as { tree: TreeEntry[] };
  return data.tree;
}

async function fetchRaw(
  owner: string,
  repo: string,
  path: string,
): Promise<string | null> {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(
    `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${encoded}`,
    { cache: "no-store" },
  );
  return res.ok ? res.text() : null;
}

function withLineNumbers(source: string): string {
  return source
    .split("\n")
    .map((line, i) => `${i + 1}: ${line}`)
    .join("\n");
}

function parseFindings(text: string): Finding[] {
  const unfenced = text.replace(/```(?:json)?/gi, "").trim();
  const start = unfenced.indexOf("[");
  const end = unfenced.lastIndexOf("]");
  if (start === -1 || end === -1) {
    throw new ReviewError("The model did not return a findings list.", 502);
  }
  const raw = JSON.parse(unfenced.slice(start, end + 1)) as Partial<Finding>[];

  return raw
    .filter((f) => f && f.file && f.issue)
    .map((f) => {
      const severity = String(f.severity ?? "").toLowerCase() as Severity;
      return {
        file: String(f.file),
        line: Number(f.line) || 0,
        severity: SEVERITIES.includes(severity) ? severity : "medium",
        cwe: String(f.cwe ?? ""),
        issue: String(f.issue),
        fix: String(f.fix ?? ""),
      };
    })
    .sort(
      (a, b) =>
        SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity),
    );
}

async function reviewWithClaude(
  files: { path: string; content: string }[],
): Promise<Finding[]> {
  // Only ever use the key from the environment, never a local login profile.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw serverError(
      "The review service is unavailable right now.",
      "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart.",
    );
  }
  const client = new Anthropic({ apiKey });
  const body = files
    .map((f) => `=== ${f.path} ===\n${withLineNumbers(f.content)}`)
    .join("\n\n");

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: body }],
  });

  if (response.stop_reason === "refusal") {
    throw new ReviewError("The model declined to review this repo.", 502);
  }

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return parseFindings(text);
}

// Looks up every pinned dependency in package.json against the OSV database.
async function checkDependencies(
  owner: string,
  repo: string,
  tree: TreeEntry[],
): Promise<DependencyVuln[]> {
  if (!tree.some((e) => e.path === "package.json")) return [];

  try {
    const raw = await fetchRaw(owner, repo, "package.json");
    if (!raw) return [];
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const deps = Object.entries({
      ...pkg.devDependencies,
      ...pkg.dependencies,
    })
      .map(([name, range]) => ({
        name,
        version: range.replace(/^[\^~>=<v\s]+/, "").split(/\s/)[0],
      }))
      .filter((d) => /^\d+(\.\d+){0,2}/.test(d.version));
    if (deps.length === 0) return [];

    const res = await fetch("https://api.osv.dev/v1/querybatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queries: deps.map((d) => ({
          package: { name: d.name, ecosystem: "npm" },
          version: d.version,
        })),
      }),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      results: { vulns?: { id: string }[] }[];
    };
    return deps
      .map((d, i) => ({
        ...d,
        ids: (data.results[i]?.vulns ?? []).map((v) => v.id),
      }))
      .filter((d) => d.ids.length > 0)
      .sort((a, b) => b.ids.length - a.ids.length);
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const { repoUrl } = (await request.json()) as { repoUrl?: string };
    const { owner, repo } = parseRepo(repoUrl ?? "");

    const tree = await fetchTree(owner, repo);
    const picked = pickFiles(tree);
    if (picked.length === 0) {
      throw new ReviewError(
        "No source code we can review in this repo. We read JavaScript, TypeScript, Python, Go, PHP, Ruby and Java.",
        422,
      );
    }

    const fetched = await Promise.all(
      picked.map(async (entry) => ({
        path: entry.path,
        content: await fetchRaw(owner, repo, entry.path),
      })),
    );
    const files = fetched.filter(
      (f): f is { path: string; content: string } => f.content !== null,
    );

    const [findings, dependencies] = await Promise.all([
      reviewWithClaude(files),
      checkDependencies(owner, repo, tree),
    ]);

    const sources = new Map(files.map((f) => [f.path, f.content]));
    const withSnippets = findings.map((f) => {
      const source = sources.get(f.file.replace(/^\.?\//, ""));
      return source ? { ...f, snippet: snippetAt(source, f.line) } : f;
    });

    return NextResponse.json({
      repo: `${owner}/${repo}`,
      files: files.map((f) => f.path),
      findings: withSnippets,
      dependencies,
    });
  } catch (error) {
    if (error instanceof ReviewError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    const unavailable = "The review service is unavailable right now.";
    let mapped: ReviewError | null = null;
    if (error instanceof Anthropic.AuthenticationError) {
      mapped = serverError(
        unavailable,
        "Anthropic API key is missing or invalid. Check .env.local.",
      );
    } else if (error instanceof Anthropic.RateLimitError) {
      mapped = new ReviewError(
        "Too many reviews at once. Give it a minute and retry.",
        429,
      );
    } else if (error instanceof Anthropic.APIError) {
      mapped = serverError(
        "The review failed. Try again in a minute.",
        `Anthropic API error (${error.status}): ${error.message}`,
        502,
      );
    } else if (error instanceof Anthropic.AnthropicError) {
      mapped = serverError(
        unavailable,
        `Anthropic client error: ${error.message}`,
      );
    }
    if (mapped) {
      return NextResponse.json(
        { error: mapped.message },
        { status: mapped.status },
      );
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Couldn't parse the review output. Try running it again." },
        { status: 502 },
      );
    }
    console.error(error);
    return NextResponse.json(
      { error: "Something went wrong running the review." },
      { status: 500 },
    );
  }
}
