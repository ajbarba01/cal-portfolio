// Verifies relative markdown links in tracked .md files resolve to real files.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Files that belong to a different project and whose links are intentionally unreachable here.
const SKIP_FILES = new Set(["OTHER.md"]);

const files = execSync("git ls-files *.md **/*.md", { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
let bad = 0;
for (const file of files) {
  if (SKIP_FILES.has(file)) continue;
  const text = execSync(`git show :"${file}"`, { encoding: "utf8" });
  const lines = text.split("\n");
  let inCodeBlock = false;
  for (const line of lines) {
    // Toggle fenced code block state; skip links inside code blocks.
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    for (const m of line.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1];
      // Skip absolute URLs, anchors, site-root paths, and angle-bracket paths.
      if (/^(https?:|mailto:|#|\/|<)/.test(target)) continue;
      // Skip bare "href" used as example syntax in docs.
      if (target === "href") continue;
      const path = resolve(dirname(file), target.split("#")[0]);
      if (!existsSync(path)) {
        console.error(`${file}: broken link -> ${target}`);
        bad++;
      }
    }
  }
}
if (bad) process.exit(1);
console.log(`OK: ${files.length} files, no broken relative links.`);
