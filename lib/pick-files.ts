export type TreeEntry = { path: string; type: string; size?: number };

// Always review at least MIN_FILES, then keep adding the next best files
// until the byte budget or MAX_FILES is reached.
const MIN_FILES = 10;
const MAX_FILES = 20;
const BYTE_BUDGET = 50_000;
const MAX_FILE_BYTES = 20_000;
// Spreads picks across the codebase so one folder can't take every slot.
const MAX_PER_FOLDER = 4;
// Skips stubs like empty __init__.py files that only re-export.
const MIN_FILE_BYTES = 150;

const SOURCE_EXTENSIONS = [
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".py",
  ".go",
  ".php",
  ".rb",
  ".java",
];

// The spec's words first, then others that tend to sit next to security bugs.
const SECURITY_WORDS = [
  "auth",
  "login",
  "session",
  "api",
  "route",
  "controller",
  "db",
  "sql",
  "query",
  "upload",
  "exec",
  "config",
  "handler",
  "middleware",
  "admin",
  "user",
  "account",
  "password",
  "token",
  "crypto",
  "download",
  "proxy",
  "redirect",
  "dao",
  "model",
  "payment",
];

// Folders where server side logic usually lives.
const SERVER_DIRS = [
  "routes",
  "controllers",
  "handlers",
  "api",
  "server",
  "app",
  "src",
  "lib",
  "core",
  "services",
  "middleware",
  "models",
  "dao",
];

// Folders that are rarely where an exploitable bug lives.
const LOW_VALUE_DIRS = [
  "frontend",
  "client",
  "public",
  "static",
  "assets",
  "components",
  "ui",
  "styles",
  "docs",
  "examples",
  "tools",
];

const SKIP_DIRS = [
  "node_modules",
  "dist",
  "build",
  "out",
  "vendor",
  "third_party",
  "bower_components",
  "coverage",
  "migrations",
  "migrate",
  "fixtures",
  "mocks",
  "__pycache__",
];

// Tests, library copies, minified bundles, type stubs and build tooling.
const SKIP_PATTERN =
  /test|(^|[/._-])specs?([/._-]|$)|\.min\.|jquery|bootstrap|\.d\.ts$|\.config\.[cm]?[jt]s$|gruntfile|gulpfile|webpack/;

function isCandidate(entry: TreeEntry): boolean {
  if (entry.type !== "blob") return false;
  const path = entry.path.toLowerCase();
  const size = entry.size ?? 0;
  if (!SOURCE_EXTENSIONS.some((ext) => path.endsWith(ext))) return false;
  if (size < MIN_FILE_BYTES || size > MAX_FILE_BYTES) return false;
  if (path.split("/").some((dir) => SKIP_DIRS.includes(dir))) return false;
  return !SKIP_PATTERN.test(path);
}

function score(entry: TreeEntry): number {
  const segments = entry.path.toLowerCase().split("/");
  const name = segments.pop() ?? "";
  const dirs = segments.join("/");

  let total = 0;
  for (const word of SECURITY_WORDS) {
    if (name.includes(word)) total += 10;
    else if (dirs.includes(word)) total += 4;
  }
  if (segments.some((d) => SERVER_DIRS.includes(d))) total += 3;
  if (segments.some((d) => LOW_VALUE_DIRS.includes(d))) total -= 12;
  // Bigger files hold more logic, worth up to 5 points.
  total += Math.min(entry.size ?? 0, MAX_FILE_BYTES) / 4_000;
  return total;
}

// Picks source files from anywhere in the repo: keyword matches first, then
// the best guesses from the rest of the code.
export function pickFiles(tree: TreeEntry[]): TreeEntry[] {
  const ranked = tree
    .filter(isCandidate)
    .map((entry) => ({ entry, score: score(entry) }))
    .sort(
      (a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path),
    )
    .map(({ entry }) => entry);

  const perFolder = new Map<string, number>();
  const spread: TreeEntry[] = [];
  const overflow: TreeEntry[] = [];
  for (const entry of ranked) {
    const folder = entry.path.slice(0, entry.path.lastIndexOf("/") + 1);
    const count = perFolder.get(folder) ?? 0;
    if (count < MAX_PER_FOLDER) {
      perFolder.set(folder, count + 1);
      spread.push(entry);
    } else {
      overflow.push(entry);
    }
  }

  const picked: TreeEntry[] = [];
  let bytes = 0;
  for (const entry of [...spread, ...overflow]) {
    if (picked.length >= MAX_FILES) break;
    const size = entry.size ?? 0;
    if (picked.length >= MIN_FILES && bytes + size > BYTE_BUDGET) continue;
    picked.push(entry);
    bytes += size;
  }
  return picked;
}
