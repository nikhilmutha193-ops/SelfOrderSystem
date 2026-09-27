#!/usr/bin/env node
const { execFile } = require("child_process");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");

const CONFIG_PATH = process.env.PRINT_AGENT_CONFIG || path.join(__dirname, "config.json");
const POLL_MS = 2000;
const IDLE_BACKOFF_MS = 30000;
const PRINTER_TIMEOUT_MS = 10000;

function log(message) {
  console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
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

async function run(config) {
  log(`Printing for ${config.restaurantName || config.server} as "${config.name || "this computer"}"`);
  for (;;) {
    let wait = POLL_MS;
    try {
      await pollOnce(config);
    } catch (err) {
      wait = IDLE_BACKOFF_MS;
      if (err.status === 401) log("This computer was removed in Printers & Stations. Pair it again with a new code.");
      else log(`Cannot reach the server: ${err.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
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
      console.log("Usage: node agent.js pair --server https://your-restaurant-server --code ABCD2345");
      process.exit(1);
    }
    const config = await pair(server, code);
    writeConfig(config);
    log(`Paired as "${config.name}" for ${config.restaurantName}. Start printing with: node agent.js`);
    return;
  }
  const config = readConfig();
  if (!config || !config.token) {
    console.log("This computer is not paired yet.");
    console.log("In Admin > Printers & Stations, add this computer, then run:");
    console.log("  node agent.js pair --server https://your-restaurant-server --code <pairing code>");
    process.exit(1);
  }
  await run(config);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { pair, pollOnce, sendToPrinter };
