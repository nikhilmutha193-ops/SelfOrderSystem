import { Router } from "express";

import { requireAuth, requireModule } from "../../middleware/auth";
import {
  agentJobResult,
  agentJobs,
  createAgent,
  createPrinter,
  createStation,
  deletePrinter,
  deleteStation,
  listAgents,
  listJobs,
  listPrinters,
  listStations,
  myStation,
  pairAgent,
  renameStation,
  renewPairingCode,
  requireAgent,
  retryJob,
  revokeAgent,
  setChefStation,
  status,
  testPrinter,
  updatePrinter,
} from "./printing.controller";

export const printingRoutes = Router();

printingRoutes.get("/status", requireAuth("admin", "chef"), status);
printingRoutes.get("/my-station", requireAuth("admin", "chef"), myStation);
printingRoutes.put("/chefs/:chefId/station", requireAuth("admin"), requireModule("chefs"), setChefStation);

printingRoutes.use(requireAuth("admin"), requireModule("printing"));
printingRoutes.get("/stations", listStations);
printingRoutes.post("/stations", createStation);
printingRoutes.put("/stations/:id", renameStation);
printingRoutes.delete("/stations/:id", deleteStation);
printingRoutes.get("/agents", listAgents);
printingRoutes.post("/agents", createAgent);
printingRoutes.post("/agents/:id/pairing-code", renewPairingCode);
printingRoutes.delete("/agents/:id", revokeAgent);
printingRoutes.get("/printers", listPrinters);
printingRoutes.post("/printers", createPrinter);
printingRoutes.put("/printers/:id", updatePrinter);
printingRoutes.delete("/printers/:id", deletePrinter);
printingRoutes.post("/printers/:id/test", testPrinter);
printingRoutes.get("/jobs", listJobs);
printingRoutes.post("/jobs/:id/retry", retryJob);

export const printAgentRoutes = Router();

printAgentRoutes.post("/pair", pairAgent);
printAgentRoutes.get("/jobs", requireAgent, agentJobs);
printAgentRoutes.post("/jobs/:id/result", requireAgent, agentJobResult);
