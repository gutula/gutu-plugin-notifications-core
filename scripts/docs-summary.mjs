#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const nestedRelative = "framework/builtin-plugins/notifications-core";
const nestedRoot = join(repoRoot, nestedRelative);
const packageTs = readFileSync(join(nestedRoot, "package.ts"), "utf8");
const readme = existsSync(join(repoRoot, "README.md")) ? readFileSync(join(repoRoot, "README.md"), "utf8") : "";
const developer = existsSync(join(repoRoot, "DEVELOPER.md")) ? readFileSync(join(repoRoot, "DEVELOPER.md"), "utf8") : "";
const todo = existsSync(join(repoRoot, "TODO.md")) ? readFileSync(join(repoRoot, "TODO.md"), "utf8") : "";

function parse(field) {
  const match = packageTs.match(new RegExp(field + String.raw`\s*:\s*"([^"]+)"`));
  return match ? match[1] : "";
}

function countBadges(text) {
  return (text.match(/img\.shields\.io/g) || []).length;
}

const summary = {
  repo: "gutu-plugin-notifications-core",
  packageId: parse("id"),
  displayName: parse("displayName"),
  version: parse("version"),
  hasReadme: readme.length > 0,
  hasDeveloper: developer.length > 0,
  hasTodo: todo.length > 0,
  badgeCount: countBadges(readme)
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(summary.displayName + " (" + summary.packageId + ")");
  console.log("README:", summary.hasReadme ? "yes" : "no");
  console.log("DEVELOPER:", summary.hasDeveloper ? "yes" : "no");
  console.log("TODO:", summary.hasTodo ? "yes" : "no");
  console.log("Badges:", summary.badgeCount);
}
