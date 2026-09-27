import { createHash, randomBytes, randomInt } from "crypto";
import { HydratedDocument, Types } from "mongoose";

import { RequestContext } from "../../core/context";
import { IOrder } from "../../models/Order";
import { IPrintAgent } from "../../models/PrintAgent";
import { IPrinter } from "../../models/Printer";
import { IPrintJob } from "../../models/PrintJob";
import { writeAudit } from "../../utils/audit";
import { HttpError } from "../../utils/httpError";
import { totalsForOrder } from "../orders/orders.billing";
import { renderBill, renderKot, renderTestPage } from "./printing.render";
import { MAX_ATTEMPTS, PrintingRepository } from "./printing.repository";
import { PrinterInput } from "./printing.schema";

const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAIRING_MINUTES = 15;
const ONLINE_WITHIN_MS = 30_000;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function pairingCode(): string {
  return Array.from({ length: 8 }, () => PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)]).join("");
}

function isDuplicate(err: unknown): boolean {
  return (err as { code?: number }).code === 11000;
}

async function orderLabel(repo: PrintingRepository, order: Pick<IOrder, "orderType" | "tableId" | "deliveryProvider">) {
  if (order.orderType === "takeaway") return "TAKE AWAY";
  if (order.orderType === "delivery") return `DELIVERY (${order.deliveryProvider ?? "Other"})`;
  if (!order.tableId) return "COUNTER";
  const table = await repo.findTableCode(order.tableId);
  return table ? `TABLE ${table.code}` : "DINE-IN";
}

export async function listStations(ctx: RequestContext) {
  return new PrintingRepository(ctx.restaurantId).listStations();
}

export async function createStation(ctx: RequestContext, name: string) {
  try {
    const station = await new PrintingRepository(ctx.restaurantId).createStation(name);
    await writeAudit(ctx, "station.create", `Added kitchen station ${name}`);
    return station;
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `A station called ${name} already exists`);
    throw err;
  }
}

export async function renameStation(ctx: RequestContext, id: string, name: string) {
  const station = await new PrintingRepository(ctx.restaurantId).findStation(id);
  if (!station) throw new HttpError(404, "Station not found");
  station.name = name;
  try {
    await station.save();
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, `A station called ${name} already exists`);
    throw err;
  }
  return station;
}

export async function deleteStation(ctx: RequestContext, id: string) {
  const repo = new PrintingRepository(ctx.restaurantId);
  const station = await repo.findStation(id);
  if (!station) throw new HttpError(404, "Station not found");
  await repo.deleteStation(station._id);
  await writeAudit(ctx, "station.delete", `Removed kitchen station ${station.name}`);
  return { message: "Station removed" };
}

export async function listAgents(ctx: RequestContext) {
  const agents = await new PrintingRepository(ctx.restaurantId).listAgents();
  const now = Date.now();
  return agents.map((agent) => ({
    ...agent,
    paired: !!agent.pairedAt,
    online: !!agent.lastSeenAt && now - new Date(agent.lastSeenAt).getTime() < ONLINE_WITHIN_MS,
  }));
}

async function issuePairingCode(agent: HydratedDocument<IPrintAgent>) {
  const code = pairingCode();
  agent.pairingCodeHash = sha256(code);
  agent.pairingExpiresAt = new Date(Date.now() + PAIRING_MINUTES * 60_000);
  await agent.save();
  return { agentId: agent._id, name: agent.name, pairingCode: code, expiresAt: agent.pairingExpiresAt };
}

export async function createAgent(ctx: RequestContext, name: string) {
  const code = pairingCode();
  const agent = await new PrintingRepository(ctx.restaurantId).createAgent(
    name,
    sha256(code),
    new Date(Date.now() + PAIRING_MINUTES * 60_000)
  );
  await writeAudit(ctx, "printAgent.create", `Added print computer ${name}`);
  return { agentId: agent._id, name: agent.name, pairingCode: code, expiresAt: agent.pairingExpiresAt };
}

export async function renewPairingCode(ctx: RequestContext, id: string) {
  const agent = await new PrintingRepository(ctx.restaurantId).findAgent(id);
  if (!agent) throw new HttpError(404, "Print computer not found");
  return issuePairingCode(agent);
}

export async function revokeAgent(ctx: RequestContext, id: string) {
  const agent = await new PrintingRepository(ctx.restaurantId).findAgent(id);
  if (!agent) throw new HttpError(404, "Print computer not found");
  agent.set({ revokedAt: new Date(), tokenHash: undefined, pairingCodeHash: undefined });
  await agent.save();
  await writeAudit(ctx, "printAgent.revoke", `Removed print computer ${agent.name}`);
  return { message: "Print computer removed" };
}

export async function pairAgent(restaurantId: string, code: string) {
  const repo = new PrintingRepository(restaurantId);
  const agent = await repo.findAgentByPairingCode(sha256(code));
  if (!agent) throw new HttpError(404, "That pairing code is wrong or has expired");
  const token = randomBytes(32).toString("hex");
  agent.set({ tokenHash: sha256(token), pairingCodeHash: undefined, pairingExpiresAt: null, pairedAt: new Date() });
  await agent.save();
  const restaurant = await repo.findRestaurant();
  return { token, agentId: agent._id, name: agent.name, restaurantName: restaurant?.name ?? "" };
}

export async function authenticateAgent(restaurantId: string, token: string) {
  const agent = await new PrintingRepository(restaurantId).findAgentByToken(sha256(token));
  if (!agent) return null;
  if (!agent.lastSeenAt || Date.now() - agent.lastSeenAt.getTime() > 10_000) {
    agent.lastSeenAt = new Date();
    await agent.save();
  }
  return agent;
}

async function validatePrinter(repo: PrintingRepository, input: PrinterInput) {
  if (!(await repo.findAgent(input.agentId))) throw new HttpError(404, "Print computer not found");
  if (input.stationIds.length && (await repo.countStations(input.stationIds)) !== input.stationIds.length) {
    throw new HttpError(404, "One of those stations no longer exists");
  }
}

function printerData(input: PrinterInput): Partial<IPrinter> {
  return {
    name: input.name,
    agentId: new Types.ObjectId(input.agentId),
    connection: input.connection,
    paperWidth: input.paperWidth,
    printsBills: input.printsBills,
    printsUnroutedKots: input.printsUnroutedKots,
    stationIds: input.stationIds.map((id) => new Types.ObjectId(id)),
    isActive: input.isActive,
  };
}

export async function listPrinters(ctx: RequestContext) {
  return new PrintingRepository(ctx.restaurantId).listPrinters();
}

export async function createPrinter(ctx: RequestContext, input: PrinterInput) {
  const repo = new PrintingRepository(ctx.restaurantId);
  await validatePrinter(repo, input);
  const printer = await repo.createPrinter(printerData(input));
  await writeAudit(ctx, "printer.create", `Added printer ${input.name}`);
  return printer;
}

export async function updatePrinter(ctx: RequestContext, id: string, input: PrinterInput) {
  const repo = new PrintingRepository(ctx.restaurantId);
  const printer = await repo.findPrinter(id);
  if (!printer) throw new HttpError(404, "Printer not found");
  await validatePrinter(repo, input);
  printer.set(printerData(input));
  await printer.save();
  return printer;
}

export async function deletePrinter(ctx: RequestContext, id: string) {
  const printer = await new PrintingRepository(ctx.restaurantId).findPrinter(id);
  if (!printer) throw new HttpError(404, "Printer not found");
  await printer.deleteOne();
  await writeAudit(ctx, "printer.delete", `Removed printer ${printer.name}`);
  return { message: "Printer removed" };
}

export async function testPrinter(ctx: RequestContext, id: string) {
  const repo = new PrintingRepository(ctx.restaurantId);
  const printer = await repo.findPrinter(id);
  if (!printer) throw new HttpError(404, "Printer not found");
  await repo.createJobs([
    {
      printerId: printer._id,
      agentId: printer.agentId,
      kind: "test",
      title: `Test page · ${printer.name}`,
      data: renderTestPage(printer.name, printer.paperWidth).toString("base64"),
    },
  ]);
  return { queued: 1 };
}

export async function enqueueKot(
  restaurantId: string,
  orderId: string | Types.ObjectId,
  round: number,
  options: { reprint?: boolean } = {}
): Promise<number> {
  const repo = new PrintingRepository(restaurantId);
  const printers = await repo.activePrinters();
  if (printers.length === 0) return 0;
  const order = await repo.findOrder(orderId);
  if (!order) return 0;
  const items = await repo.findRoundItems(order._id, round);
  if (items.length === 0) return 0;

  const [restaurant, stations, label] = await Promise.all([
    repo.findRestaurant(),
    repo.listStations(),
    orderLabel(repo, order),
  ]);
  if (!restaurant) return 0;
  const stationName = new Map(stations.map((s) => [s._id.toString(), s.name]));
  const fallback = printers.filter((p) => p.printsUnroutedKots);

  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.stationId?.toString() ?? "";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const jobs: Omit<Partial<IPrintJob>, "restaurantId">[] = [];
  for (const [key, groupItems] of groups) {
    const routed = key ? printers.filter((p) => p.stationIds.some((s) => s.toString() === key)) : [];
    const targets = routed.length ? routed : fallback;
    const station = key ? stationName.get(key) : undefined;
    for (const printer of targets) {
      const data = renderKot({
        restaurant,
        orderLabel: label,
        customerName: order.customerName,
        tokenNumber: groupItems[0].tokenNumber,
        round,
        stationName: station,
        items: groupItems,
        printedAt: groupItems[0].kotPrintedAt ?? new Date(),
        paperWidth: printer.paperWidth,
        reprint: options.reprint,
      });
      jobs.push({
        printerId: printer._id,
        agentId: printer.agentId,
        kind: "kot",
        title: `KOT ${groupItems[0].tokenNumber != null ? `T${groupItems[0].tokenNumber} ` : ""}· ${station ?? label}`,
        data: data.toString("base64"),
        orderId: order._id,
        round,
      });
    }
  }
  if (jobs.length) await repo.createJobs(jobs);
  return jobs.length;
}

export async function enqueueBill(restaurantId: string, orderId: string | Types.ObjectId): Promise<number> {
  const repo = new PrintingRepository(restaurantId);
  const printers = (await repo.activePrinters()).filter((p) => p.printsBills);
  if (printers.length === 0) return 0;
  const order = await repo.findOrder(orderId);
  const restaurant = await repo.findRestaurant();
  if (!order || !restaurant) return 0;
  const items = await repo.findOrderItems(order._id);
  const totals = totalsForOrder(order, items, restaurant);
  const vpa = restaurant.billingSettings?.upiVpa;
  const upiLink =
    vpa && order.invoiceNumber
      ? `upi://pay?${new URLSearchParams({
          pa: vpa,
          pn: restaurant.billingSettings?.upiPayeeName || restaurant.name,
          am: totals.grandTotal.toFixed(2),
          cu: "INR",
          tn: order.invoiceNumber,
        }).toString()}`
      : null;
  const label = await orderLabel(repo, order);

  await repo.createJobs(
    printers.map((printer) => ({
      printerId: printer._id,
      agentId: printer.agentId,
      kind: "bill" as const,
      title: `Bill ${order.invoiceNumber ?? order.customerName}`,
      data: renderBill({
        restaurant,
        order,
        orderLabel: label,
        items,
        totals,
        upiLink,
        openDrawer:
          order.status === "closed" &&
          (order.paymentMethod === "cash" || order.payments.some((p) => p.method === "cash")),
        paperWidth: printer.paperWidth,
      }).toString("base64"),
      orderId: order._id,
    }))
  );
  return printers.length;
}

export async function claimJobs(restaurantId: string, agent: HydratedDocument<IPrintAgent>) {
  const repo = new PrintingRepository(restaurantId);
  const printers = await repo.activePrintersForAgent(agent._id);
  const jobs = [];
  for (let i = 0; i < 10; i++) {
    const job = await repo.claimNextJob(agent._id);
    if (!job) break;
    jobs.push({ id: job._id, printerId: job.printerId, kind: job.kind, title: job.title, data: job.data });
  }
  return {
    printers: printers.map((p) => ({ id: p._id, name: p.name, connection: p.connection, paperWidth: p.paperWidth })),
    jobs,
  };
}

export async function reportJobResult(
  restaurantId: string,
  agent: HydratedDocument<IPrintAgent>,
  jobId: string,
  result: { ok: boolean; error?: string }
) {
  const job = await new PrintingRepository(restaurantId).findJob(jobId);
  if (!job || !job.agentId.equals(agent._id)) throw new HttpError(404, "Print job not found");
  if (result.ok) job.set({ status: "printed", printedAt: new Date(), lastError: undefined });
  else
    job.set({ status: job.attempts >= MAX_ATTEMPTS ? "failed" : "queued", lastError: result.error ?? "Unknown error" });
  await job.save();
  return { status: job.status };
}

export async function listJobs(ctx: RequestContext, status?: string) {
  const repo = new PrintingRepository(ctx.restaurantId);
  const [jobs, printers] = await Promise.all([repo.listJobs(status), repo.listPrinters()]);
  const printerName = new Map(printers.map((p) => [p._id.toString(), p.name]));
  return jobs.map((job) => ({ ...job, printerName: printerName.get(job.printerId.toString()) ?? "Removed printer" }));
}

export async function retryJob(ctx: RequestContext, id: string) {
  const job = await new PrintingRepository(ctx.restaurantId).findJob(id);
  if (!job) throw new HttpError(404, "Print job not found");
  job.set({ status: "queued", attempts: 0, lastError: undefined, sentAt: null });
  await job.save();
  return { status: job.status };
}

export async function printingStatus(ctx: RequestContext) {
  const repo = new PrintingRepository(ctx.restaurantId);
  const [printers, agents, failedToday, restaurant] = await Promise.all([
    repo.activePrinters(),
    listAgents(ctx),
    repo.countRecentFailures(new Date(Date.now() - 24 * 60 * 60 * 1000)),
    repo.findRestaurant(),
  ]);
  return {
    printersConfigured: printers.length > 0,
    billPrinterConfigured: printers.some((p) => p.printsBills),
    autoPrintBill: !!restaurant?.invoiceSettings?.autoPrintBill,
    agentsOnline: agents.filter((a) => a.online).length,
    agentsTotal: agents.length,
    failedToday,
  };
}

export async function myStation(ctx: RequestContext) {
  const repo = new PrintingRepository(ctx.restaurantId);
  const [stations, chef] = await Promise.all([
    repo.listStations(),
    ctx.auth.role === "chef" ? repo.findChefStation(ctx.auth.id) : Promise.resolve(null),
  ]);
  return { stationId: chef?.stationId ?? null, stations };
}

export async function setChefStation(ctx: RequestContext, chefId: string, stationId: string | null) {
  const repo = new PrintingRepository(ctx.restaurantId);
  if (stationId && !(await repo.findStation(stationId))) throw new HttpError(404, "Station not found");
  const chef = await repo.setChefStation(chefId, stationId ? new Types.ObjectId(stationId) : null);
  if (!chef) throw new HttpError(404, "Chef not found");
  return chef;
}
