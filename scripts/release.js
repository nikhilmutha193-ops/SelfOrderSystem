#!/usr/bin/env node
// Bumps the one project version and records it.
//
//   node scripts/release.js patch|minor|major [--commit]
//
// - VERSION (repo root) is the single source of truth; client/ and server/ package.json follow it.
// - CHANGELOG.md gets a new entry listing the commit subjects since the previous release tag.
// - Without --commit the files are only changed, so you can review them. With --commit the changed
//   files are committed as "release: vX.Y.Z" and tagged vX.Y.Z. Nothing is ever pushed.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const file = (...p) => path.join(root, ...p);
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

const kind = process.argv[2];
const commit = process.argv.includes("--commit");
if (!["patch", "minor", "major"].includes(kind)) {
  console.error("Usage: node scripts/release.js patch|minor|major [--commit]");
  process.exit(1);
}

const current = fs.readFileSync(file("VERSION"), "utf8").trim();
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
if (!match) {
  console.error(`VERSION must look like 1.2.3, found "${current}"`);
  process.exit(1);
}
let [major, minor, patch] = match.slice(1).map(Number);
if (kind === "major") [major, minor, patch] = [major + 1, 0, 0];
else if (kind === "minor") [minor, patch] = [minor + 1, 0];
else patch += 1;
const next = `${major}.${minor}.${patch}`;
const tag = `v${next}`;

if (git("tag", "--list", tag)) {
  console.error(`Tag ${tag} already exists.`);
  process.exit(1);
}

// Commits since the last release tag (or the whole history before the first release).
let lastTag = "";
try {
  lastTag = git("describe", "--tags", "--abbrev=0", "--match", "v*");
} catch {
  // No release yet.
}
const subjects = git("log", lastTag ? `${lastTag}..HEAD` : "HEAD", "--pretty=%s")
  .split("\n")
  .map((s) => s.trim())
  .filter((s) => s && !s.startsWith("release:"));

const changed = [];

function writeJson(rel, edit) {
  const p = file(rel);
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const json = JSON.parse(raw);
  edit(json);
  fs.writeFileSync(p, JSON.stringify(json, null, 2).replace(/\n/g, eol) + eol);
  changed.push(rel);
}

fs.writeFileSync(file("VERSION"), `${next}\n`);
changed.push("VERSION");
for (const dir of ["client", "server"]) {
  writeJson(`${dir}/package.json`, (json) => {
    json.version = next;
  });
  writeJson(`${dir}/package-lock.json`, (json) => {
    json.version = next;
    if (json.packages?.[""]) json.packages[""].version = next;
  });
}

const date = new Date().toISOString().slice(0, 10);
const entry = [
  `## ${next} - ${date}`,
  "",
  ...(subjects.length ? subjects.map((s) => `- ${s}`) : ["- No commits since the last release."]),
  "",
].join("\n");
const changelog = file("CHANGELOG.md");
const header = "# Changelog\n\nOne entry per release, newest first. Made by `scripts/release.js`.\n\n";
const existing = fs.existsSync(changelog) ? fs.readFileSync(changelog, "utf8").replace(/^# Changelog\n+[^\n]*\n+/, "") : "";
fs.writeFileSync(changelog, `${header}${entry}\n${existing.replace(/^\n+/, "")}`);
changed.push("CHANGELOG.md");

console.log(`Version ${current} -> ${next} (${subjects.length} commit${subjects.length === 1 ? "" : "s"} listed)`);
if (commit) {
  git("add", ...changed);
  git("commit", "-m", `release: ${tag}`);
  git("tag", "-a", tag, "-m", `Release ${tag}`);
  console.log(`Committed and tagged ${tag}. Push with: git push && git push origin ${tag}`);
} else {
  console.log("Files changed (not committed):", changed.join(", "));
  console.log(`Review, then run again with --commit, or commit and tag ${tag} yourself.`);
}
