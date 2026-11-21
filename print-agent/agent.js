#!/usr/bin/env node
const { execFile, spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");

// Built into PrintAgent.exe (see build-exe.js) there is no Node.js to install: the exe carries its own. Then the
// config sits next to the exe and the help texts name the exe instead of "node agent.js".
const IS_EXE = (() => {
  try {
    return require("node:sea").isSea();
  } catch {
    return false; // plain Node (also older versions without node:sea)
  }
})();
const RUN = IS_EXE ? "PrintAgent.exe" : "node agent.js";
const HOME_DIR = IS_EXE ? path.dirname(process.execPath) : __dirname;
const CONFIG_PATH = process.env.PRINT_AGENT_CONFIG || path.join(HOME_DIR, "config.json");
// Everything the app keeps sits next to it: the pairing, the log, what the running agent last reported, and a marker
// saying it was set to start with Windows.
const LOG_PATH = path.join(HOME_DIR, "agent.log");
const STATUS_PATH = path.join(HOME_DIR, "agent.status.json");
const AUTOSTART_MARK = path.join(HOME_DIR, "autostart.installed");
const ADMIN_RESULT = path.join(HOME_DIR, "admin-result.json");
const SERVER_HINT = path.join(HOME_DIR, "server.txt");
const TASK_NAME = "SelfOrder Print Agent";
const POLL_MS = 2000;
const IDLE_BACKOFF_MS = 30000;
const PRINTER_TIMEOUT_MS = 10000;

let fileLog = false;

function log(message) {
  console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
  if (!fileLog) return;
  try {
    fs.appendFileSync(LOG_PATH, `[${new Date().toLocaleString()}] ${message}\n`);
  } catch {
    // a log that can't be written must never stop printing
  }
}

/** Keeps agent.log from growing for ever: past 2 MB the old one is kept as agent.log.old. */
function trimLog() {
  try {
    if (fs.statSync(LOG_PATH).size > 2 * 1024 * 1024) fs.renameSync(LOG_PATH, `${LOG_PATH}.old`);
  } catch {
    // no log yet
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function tailLines(file, count) {
  try {
    return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).slice(-count);
  } catch {
    return [];
  }
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function apiUrl(server, route) {
  return `${server.replace(/\/+$/, "")}/api/print-agent${route}`;
}

async function request(config, route, init = {}) {
  const res = await fetch(apiUrl(config.server, route), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(config.token ? { Authorization: `Agent ${config.token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body.message || `Server replied ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return body;
}

async function pair(server, code) {
  const result = await request({ server }, "/pair", { method: "POST", body: JSON.stringify({ code }) });
  return {
    server,
    token: result.token,
    agentId: result.agentId,
    name: result.name,
    restaurantName: result.restaurantName,
  };
}

function sendToNetworkPrinter(connection, data) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: connection.host, port: connection.port || 9100 });
    socket.setTimeout(PRINTER_TIMEOUT_MS);
    socket.once("connect", () => socket.end(data));
    socket.once("timeout", () => socket.destroy(new Error(`Printer at ${connection.host} did not respond`)));
    socket.once("error", (err) => reject(new Error(`Printer at ${connection.host}: ${err.message}`)));
    socket.once("close", (hadError) => {
      if (!hadError) resolve();
    });
  });
}

function sendToSharedPrinter(connection, data) {
  if (process.platform !== "win32") return Promise.reject(new Error("Shared printers work only on Windows"));
  const file = path.join(os.tmpdir(), `selforder-print-${process.pid}-${Date.now()}.bin`);
  fs.writeFileSync(file, data);
  return new Promise((resolve, reject) => {
    execFile(
      "cmd.exe",
      ["/d", "/s", "/c", `copy /b "${file}" "\\\\localhost\\${connection.shareName}"`],
      { windowsVerbatimArguments: true, timeout: PRINTER_TIMEOUT_MS },
      (err) => {
        fs.rm(file, { force: true }, () => {});
        if (err) reject(new Error(`Shared printer ${connection.shareName}: ${err.message.trim()}`));
        else resolve();
      }
    );
  });
}

function sendToPrinter(printer, data) {
  if (printer.connection.type === "network") return sendToNetworkPrinter(printer.connection, data);
  if (printer.connection.type === "shared") return sendToSharedPrinter(printer.connection, data);
  return Promise.reject(new Error(`Unknown printer connection ${printer.connection.type}`));
}

async function pollOnce(config, print = sendToPrinter) {
  const { printers, jobs } = await request(config, "/jobs");
  const byId = new Map(printers.map((printer) => [String(printer.id), printer]));
  const results = [];
  for (const job of jobs) {
    const printer = byId.get(String(job.printerId));
    let outcome;
    try {
      if (!printer) throw new Error("This printer is no longer set up on this computer");
      await print(printer, Buffer.from(job.data, "base64"));
      outcome = { ok: true };
      log(`Printed ${job.title} on ${printer.name}`);
    } catch (err) {
      outcome = { ok: false, error: err.message };
      log(`Could not print ${job.title}: ${err.message}`);
    }
    await request(config, `/jobs/${job.id}/result`, { method: "POST", body: JSON.stringify(outcome) });
    results.push({ id: String(job.id), ...outcome });
  }
  return results;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM"; // exists, but belongs to another account
  }
}

let lastStatusWrite = 0;
let lastStatusOk = null;
/** What the app window shows: whether the agent is alive and whether the server answered the last time. */
function writeStatus(config, startedAt, ok, error) {
  const now = Date.now();
  if (ok === lastStatusOk && now - lastStatusWrite < 4000) return;
  lastStatusWrite = now;
  lastStatusOk = ok;
  try {
    fs.writeFileSync(
      STATUS_PATH,
      JSON.stringify({ pid: process.pid, startedAt, lastPollAt: now, ok, error: error || null, name: config.name })
    );
  } catch {
    // not being able to write the status must never stop printing
  }
}

async function run(config) {
  fileLog = true;
  trimLog();
  const other = readJson(STATUS_PATH);
  if (other && other.pid && other.pid !== process.pid && Date.now() - other.lastPollAt < 15000 && isAlive(other.pid)) {
    log("The print agent is already running on this computer.");
    return;
  }
  const startedAt = Date.now();
  log(`Printing for ${config.restaurantName || config.server} as "${config.name || "this computer"}"`);
  for (;;) {
    let wait = POLL_MS;
    try {
      await pollOnce(config);
      writeStatus(config, startedAt, true, null);
    } catch (err) {
      wait = IDLE_BACKOFF_MS;
      const message =
        err.status === 401
          ? "This computer was removed in Printers & Stations. Pair it again with a new code."
          : `Cannot reach the server: ${err.message}`;
      log(message);
      writeStatus(config, startedAt, false, message);
    }
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The app window. Opening PrintAgent.exe on Windows starts a small web page that only this computer can reach and shows
// it in its own window: type the pairing code, press one button. Anything that needs administrator rights (starting with
// Windows) is done by running this same exe again, elevated, with an "admin" command, so nothing else has to be installed.

function runCommand(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: 60000 }, (err, stdout, stderr) =>
      resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    );
  });
}

const psQuote = (text) => `'${String(text).replace(/'/g, "''")}'`;

/** Runs this program again as administrator (Windows asks the user once) and waits. 1223 means they said no. */
async function runElevated(adminArgs) {
  const args = IS_EXE ? adminArgs : [`"${__filename}"`, ...adminArgs];
  const script =
    `try { $p = Start-Process -FilePath ${psQuote(process.execPath)} -ArgumentList ${args.map(psQuote).join(",")} ` +
    "-Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode } catch { exit 1223 }";
  fs.rmSync(ADMIN_RESULT, { force: true });
  const { code } = await runCommand("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
  return { code, result: readJson(ADMIN_RESULT) };
}

/** What is run when Windows starts: this program with the `run` command. */
function taskCommand() {
  return IS_EXE ? `"${process.execPath}" run` : `"${process.execPath}" "${__filename}" run`;
}

async function stopAgents() {
  await runCommand("schtasks", ["/End", "/TN", TASK_NAME]);
  const status = readJson(STATUS_PATH);
  if (status && status.pid && status.pid !== process.pid) await runCommand("taskkill", ["/PID", String(status.pid), "/F", "/T"]);
  fs.rmSync(STATUS_PATH, { force: true });
}

/** The work that needs administrator rights. The outcome goes to admin-result.json for the window to read. */
async function adminMain(action) {
  const result = { ok: false, message: "" };
  try {
    if (process.platform !== "win32") throw new Error("Starting with the computer is set up on Windows only");
    if (action === "install") {
      await stopAgents();
      // 30 seconds after Windows starts, so the network and the printer are ready; as the system, so nobody has to sign in.
      const made = await runCommand("schtasks", [
        "/Create", "/TN", TASK_NAME, "/TR", taskCommand(), "/SC", "ONSTART", "/DELAY", "0000:30", "/RU", "SYSTEM", "/RL", "HIGHEST", "/F",
      ]);
      if (made.code !== 0) throw new Error(`Windows would not create the startup task: ${made.stderr.trim() || made.stdout.trim()}`);
      fs.writeFileSync(AUTOSTART_MARK, new Date().toISOString());
      await runCommand("schtasks", ["/Run", "/TN", TASK_NAME]);
    } else if (action === "start") {
      await stopAgents();
      const started = await runCommand("schtasks", ["/Run", "/TN", TASK_NAME]);
      if (started.code !== 0) throw new Error("The startup task is not set up yet. Press Set up and start first.");
    } else if (action === "stop") {
      await stopAgents();
    } else if (action === "remove") {
      await stopAgents();
      await runCommand("schtasks", ["/Delete", "/TN", TASK_NAME, "/F"]);
      fs.rmSync(AUTOSTART_MARK, { force: true });
    } else {
      throw new Error(`Unknown action ${action}`);
    }
    result.ok = true;
  } catch (err) {
    result.message = err.message;
  }
  fs.writeFileSync(ADMIN_RESULT, JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}

function normalizeServer(value) {
  const text = String(value || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s/]+/i.test(text)) throw new Error("Enter the server address, starting with https://");
  return text;
}

function currentState() {
  const config = readConfig();
  const status = readJson(STATUS_PATH);
  const alive = !!status && Date.now() - status.lastPollAt < 20000;
  let hint = "";
  try {
    hint = fs.readFileSync(SERVER_HINT, "utf8").trim();
  } catch {
    // no address was packed with this copy
  }
  return {
    paired: !!(config && config.token),
    server: (config && config.server) || "",
    serverHint: hint,
    name: (config && config.name) || "",
    restaurantName: (config && config.restaurantName) || "",
    autostart: fs.existsSync(AUTOSTART_MARK),
    running: alive,
    connected: alive ? !!status.ok : null,
    error: alive && !status.ok ? status.error : null,
    lastPollAt: alive ? status.lastPollAt : null,
    log: tailLines(LOG_PATH, 14),
    windows: process.platform === "win32",
  };
}

async function waitForAgent(timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const state = currentState();
    if (state.running) return state;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return currentState();
}

/** Runs an administrator action, or says in words why it did not happen. */
async function adminAction(action) {
  // PRINT_AGENT_NO_ADMIN is for automated tests, where nobody can answer the Windows permission prompt: the agent is
  // started directly instead of through the startup task.
  if (process.env.PRINT_AGENT_NO_ADMIN) {
    if (action === "install" || action === "start") {
      await stopAgents();
      spawn(process.execPath, IS_EXE ? ["run"] : [__filename, "run"], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    } else {
      await stopAgents();
    }
    return { ok: true, message: "" };
  }
  if (process.platform !== "win32") {
    return { ok: false, message: "On this system start it with: node agent.js run" };
  }
  const { code, result } = await runElevated(["admin", action]);
  if (code === 1223) {
    return { ok: false, message: "Windows asked for permission and it was not given, so nothing was changed." };
  }
  if (result && result.ok) return { ok: true, message: "" };
  return { ok: false, message: (result && result.message) || "That did not work. Try again." };
}

async function handleApi(route, body) {
  if (route === "state") return currentState();
  if (route === "setup") {
    const server = normalizeServer(body.server);
    const code = String(body.code || "").replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z0-9]{4,16}$/.test(code)) throw new Error("Enter the pairing code shown in Printers & Stations");
    const config = await pair(server, code);
    writeConfig(config);
    const started = await adminAction("install");
    if (!started.ok) {
      return { ok: false, paired: true, message: `Paired, but it is not running yet. ${started.message}`, state: currentState() };
    }
    const state = await waitForAgent(25000);
    return {
      ok: state.running,
      paired: true,
      message: state.running ? "" : "Paired and started, but the agent has not reported in yet. Give it a moment.",
      state,
    };
  }
  if (route === "start" || route === "stop" || route === "remove") {
    const done = await adminAction(route);
    return { ...done, state: route === "start" ? await waitForAgent(20000) : currentState() };
  }
  throw Object.assign(new Error("Not found"), { notFoundRoute: true });
}

function uiHtml() {
  try {
    if (IS_EXE) return require("node:sea").getAsset("setup-ui.html", "utf8");
  } catch {
    // fall through to the file next to this script
  }
  return fs.readFileSync(path.join(__dirname, "setup-ui.html"), "utf8");
}

function openWindow(url) {
  // PRINT_AGENT_NO_WINDOW is for automated tests: print the address instead of opening a window.
  if (process.platform !== "win32" || process.env.PRINT_AGENT_NO_WINDOW) {
    console.log(`Open this address in a browser: ${url}`);
    return;
  }
  // Edge's app mode gives a window of its own, without tabs or an address bar; the default browser is the fallback.
  execFile("cmd.exe", ["/c", "start", "", "msedge", `--app=${url}`, "--window-size=560,760"], { windowsHide: true }, (err) => {
    if (err) execFile("cmd.exe", ["/c", "start", "", url], { windowsHide: true }, () => {});
  });
}

function startUi() {
  const key = crypto.randomBytes(16).toString("hex");
  let lastSeen = Date.now();
  let seen = false;
  const server = http.createServer((req, res) => {
    const reply = (status, body, type = "application/json") => {
      res.writeHead(status, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store" });
      res.end(type === "application/json" ? JSON.stringify(body) : body);
    };
    const address = server.address();
    const url = new URL(req.url, "http://127.0.0.1");
    // Only this computer, and only the page that was opened with the secret: a web page in another tab can't use it.
    if (req.headers.host !== `127.0.0.1:${address.port}` || (url.searchParams.get("k") || req.headers["x-key"]) !== key) {
      return reply(403, { message: "Forbidden" });
    }
    lastSeen = Date.now();
    if (req.method === "GET" && url.pathname === "/") {
      seen = true;
      return reply(200, uiHtml(), "text/html");
    }
    if (!url.pathname.startsWith("/api/")) return reply(404, { message: "Not found" });
    const route = url.pathname.slice(5);
    if (route === "ping") return reply(200, { ok: true });
    if (route === "quit") {
      reply(200, { ok: true });
      return setTimeout(() => process.exit(0), 100);
    }
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 10000) req.destroy();
    });
    req.on("end", async () => {
      try {
        reply(200, await handleApi(route, raw ? JSON.parse(raw) : {}));
      } catch (err) {
        // The server's own status (a wrong code is its 404) is not this window's: any problem is a plain 400 here.
        reply(err.notFoundRoute ? 404 : 400, { message: err.message });
      }
    });
  });
  server.listen(0, "127.0.0.1", () => {
    openWindow(`http://127.0.0.1:${server.address().port}/?k=${key}`);
  });
  // Closing the window ends the app: the page pings while it is open.
  setInterval(() => {
    if (Date.now() - lastSeen > (seen ? 30000 : 120000)) process.exit(0);
  }, 5000).unref();
}

/** On Windows the exe has a console window; open the app from a hidden copy of itself so only the app window shows. */
function openApp() {
  if (IS_EXE && process.platform === "win32" && !process.env.PRINT_AGENT_UI_CHILD) {
    spawn(process.execPath, ["ui"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: { ...process.env, PRINT_AGENT_UI_CHILD: "1" },
    }).unref();
    return;
  }
  startUi();
}

function argValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(args) {
  if (args[0] === "pair") {
    const server = argValue(args, "--server");
    const code = argValue(args, "--code");
    if (!server || !code) {
      console.log(`Usage: ${RUN} pair --server https://your-restaurant-server --code ABCD2345`);
      process.exit(1);
    }
    const config = await pair(server, code);
    writeConfig(config);
    log(`Paired as "${config.name}" for ${config.restaurantName}. Start printing with: ${RUN} run`);
    return;
  }
  if (args[0] === "admin") return adminMain(args[1]);
  // On Windows, opening the program (no command) opens the app window.
  if (args[0] === "ui" || (args[0] === undefined && process.platform === "win32")) return openApp();

  const config = readConfig();
  if (!config || !config.token) {
    console.log("This computer is not paired yet.");
    console.log("In Admin > Printers & Stations, add this computer, then run:");
    console.log(`  ${RUN} pair --server https://your-restaurant-server --code <pairing code>`);
    process.exit(1);
  }
  await run(config);
}

if (IS_EXE || require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { pair, pollOnce, sendToPrinter };
