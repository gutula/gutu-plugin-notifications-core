#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const nestedRoot = join(repoRoot, "framework/builtin-plugins/notifications-core");
const requiredInternalDocs = ["AGENT_CONTEXT.md","BUSINESS_RULES.md","EDGE_CASES.md","FLOWS.md","GLOSSARY.md","MANDATORY_STEPS.md"];
const requiredReadmeHeadings = ["## Part Of The Gutu Stack","## What It Does Now","## Maturity","## Verified Capability Summary","## Dependency And Compatibility Summary","## Capability Matrix","## Quick Start For Integrators","## Current Test Coverage","## Known Boundaries And Non-Goals","## Recommended Next Milestones"];
const requiredDeveloperHeadings = ["## Purpose And Architecture Role","## Repo Map","## Manifest Contract","## Dependency Graph And Capability Requests","## Public Integration Surfaces","## Hooks, Events, And Orchestration","## Storage, Schema, And Migration Notes","## Failure Modes And Recovery","## Mermaid Flows","## Integration Recipes","## Test Matrix","## Current Truth And Recommended Next"];
const requiredTodoHeadings = ["## Shipped Now","## Current Gaps","## Recommended Next","## Later / Optional"];
const placeholderPatterns = [/This folder is the intended standalone git repository/i, /_Document\b[^_]*_/i, /_Explain\b[^_]*_/i, /_Describe\b[^_]*_/i, /_No workflows were discovered\._/i];

const failures = [];

function requireFile(path) {
  if (!existsSync(path)) {
    failures.push("Missing file: " + path.replace(repoRoot + "/", ""));
    return "";
  }
  return readFileSync(path, "utf8");
}

function requireHeadings(text, headings, label) {
  for (const heading of headings) {
    if (!text.includes(heading)) {
      failures.push(label + " is missing heading: " + heading);
    }
  }
}

function checkPlaceholders(text, label) {
  for (const pattern of placeholderPatterns) {
    if (pattern.test(text)) {
      failures.push(label + " still contains placeholder or extraction-stub text matching " + pattern);
    }
  }
}

const readme = requireFile(join(repoRoot, "README.md"));
const developer = requireFile(join(repoRoot, "DEVELOPER.md"));
const todo = requireFile(join(repoRoot, "TODO.md"));
const packageTs = requireFile(join(nestedRoot, "package.ts"));

requireHeadings(readme, requiredReadmeHeadings, "README.md");
requireHeadings(developer, requiredDeveloperHeadings, "DEVELOPER.md");
requireHeadings(todo, requiredTodoHeadings, "TODO.md");
checkPlaceholders(readme, "README.md");
checkPlaceholders(developer, "DEVELOPER.md");
checkPlaceholders(todo, "TODO.md");

if ((readme.match(/img\.shields\.io/g) || []).length < 4) {
  failures.push("README.md must contain four local-status badges.");
}

if (!readme.includes("./docs/assets/gutu-mascot.png")) {
  failures.push("README.md must reference the mascot image.");
}

for (const docName of requiredInternalDocs) {
  const content = requireFile(join(nestedRoot, "docs", docName));
  checkPlaceholders(content, "docs/" + docName);
}

if (!existsSync(join(repoRoot, "docs", "assets", "gutu-mascot.png"))) {
  failures.push("docs/assets/gutu-mascot.png is missing.");
}

if (!packageTs.includes("id:")) {
  failures.push("package.ts is missing the plugin id field.");
}

if (!readme.includes("**Maturity Tier:**") || !developer.includes("**Maturity Tier:**") || !todo.includes("**Maturity Tier:**")) {
  failures.push("README.md, DEVELOPER.md, and TODO.md must all declare the maturity tier.");
}

if (failures.length > 0) {
  console.error("Documentation check failed for gutu-plugin-notifications-core:");
  for (const failure of failures) {
    console.error("- " + failure);
  }
  process.exit(1);
}

console.log("Documentation check passed for gutu-plugin-notifications-core.");
