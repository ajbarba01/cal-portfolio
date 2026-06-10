// Verifies relative markdown links in tracked .md files resolve to real files.
// Reads the STAGED version of each file (git show :file) — stage docs before running.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// Anchor everything to the repo root so the check is cwd-independent.
const root = execSync("git rev-parse --show-toplevel", {
  encoding: "utf8",
}).trim();

// Another project's instruction file, kept as a style reference; its links target that repo, not this one.
const SKIP_FILES = new Set(["docs/reference/OTHER.md"]);
// Archived plans are read-only historical records; their relative links naturally break after being moved.
const SKIP_PREFIXES = ["docs/superpowers/plans/archive/"];

const files = execSync("git ls-files *.md **/*.md", {
  encoding: "utf8",
  cwd: root,
})
  .split("\n")
  .filter(Boolean);
let bad = 0;
let skipped = 0;
let checked = 0;
for (const file of files) {
  if (SKIP_FILES.has(file) || SKIP_PREFIXES.some((p) => file.startsWith(p))) {
    skipped++;
    continue;
  }
  checked++;
  const text = execSync(`git show :"${file}"`, { encoding: "utf8", cwd: root });
  const lines = text.split("\n");
  let inCodeBlock = false;
  for (const rawLine of lines) {
    // Toggle fenced code block state; skip links inside code blocks.
    if (rawLine.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    // Inline code spans hold example syntax, not real links.
    const line = rawLine.replace(/`[^`]*`/g, "");
    for (const m of line.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1];
      // Skip absolute URLs, anchors, site-root paths, and angle-bracket paths.
      if (/^(https?:|mailto:|#|\/|<)/.test(target)) continue;
      const path = resolve(join(root, dirname(file)), target.split("#")[0]);
      if (!existsSync(path)) {
        console.error(`${file}: broken link -> ${target}`);
        bad++;
      }
    }
  }
}
if (bad) process.exit(1);
console.log(
  `OK: checked ${checked} files (${skipped} skipped), no broken relative links.`,
);
