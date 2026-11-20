// Builds dist/PrintAgent.exe: the agent plus its own copy of Node.js in one file, so the printing computer needs
// nothing installed. Run this on any Windows computer that has Node.js 20 or newer (it needs internet for npm):
//
//   node build-exe.js
//
// Then copy the dist folder (PrintAgent.exe, pair.bat, start-agent.bat) to the printing computer.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

if (process.platform !== "win32") {
  console.error("Build the .exe on Windows: it copies this computer's node.exe.");
  process.exit(1);
}
const major = Number(process.versions.node.split(".")[0]);
if (major < 20) {
  console.error(`Node.js 20 or newer is needed to build the exe (this is ${process.versions.node}).`);
  process.exit(1);
}

const root = __dirname;
const dist = path.join(root, "dist");
const exe = path.join(dist, "PrintAgent.exe");
const blob = path.join(dist, "agent.blob");
const seaConfig = path.join(dist, "sea-config.json");

fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(
  seaConfig,
  JSON.stringify({ main: path.join(root, "agent.js"), output: blob, disableExperimentalSEAWarning: true })
);

console.log("1/3 Bundling agent.js ...");
execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], { stdio: "inherit" });

console.log("2/3 Copying node.exe ...");
fs.copyFileSync(process.execPath, exe);

console.log("3/3 Putting the agent into the exe ...");
// postject is installed into dist/.tools and run by node itself with --liftoff-only: through npx, on Node 24, its
// WebAssembly part runs out of memory ("Fatal process out of memory: Zone").
const tools = path.join(dist, ".tools");
fs.mkdirSync(tools, { recursive: true });
// Its own package.json, or npm would install into (and edit) the nearest one up the tree: print-agent's.
fs.writeFileSync(path.join(tools, "package.json"), '{"private":true}');
execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["i", "postject", "--no-audit", "--no-fund", "--silent"], {
  stdio: "inherit",
  shell: true, // npm.cmd needs a shell; no path with spaces is passed on this line (cwd is used instead)
  cwd: tools,
});
execFileSync(
  process.execPath,
  [
    "--liftoff-only",
    path.join(tools, "node_modules", "postject", "dist", "cli.js"),
    exe,
    "NODE_SEA_BLOB",
    blob,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ],
  { stdio: "inherit" }
);
fs.rmSync(tools, { recursive: true, force: true });

fs.rmSync(blob, { force: true });
fs.rmSync(seaConfig, { force: true });
for (const name of ["pair.bat", "start-agent.bat"]) fs.copyFileSync(path.join(root, name), path.join(dist, name));

console.log(`\nDone: ${exe} (${Math.round(fs.statSync(exe).size / 1048576)} MB)`);
console.log("Copy the dist folder to the printing computer, then run:  pair.bat https://your-server CODE");
