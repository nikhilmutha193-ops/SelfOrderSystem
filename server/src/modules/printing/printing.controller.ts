import { NextFunction, Request, Response } from "express";
import { HydratedDocument } from "mongoose";
import { z } from "zod";

import { getContext } from "../../core/context";
import { objectId, parse } from "../../core/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { IPrintAgent } from "../../models/PrintAgent";
import {
  agentSchema,
  idParams,
  jobResultSchema,
  jobsQuery,
  pairSchema,
  printerSchema,
  stationSchema,
} from "./printing.schema";
import * as printing from "./printing.service";

const chefStationSchema = z.object({ stationId: z.union([objectId("Invalid station"), z.null()]) });
const chefParams = z.object({ chefId: objectId() });

function agentOf(res: Response): HydratedDocument<IPrintAgent> {
  return res.locals.printAgent as HydratedDocument<IPrintAgent>;
}

export const requireAgent = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Agent ")) {
    res.status(401).json({ message: "This print computer is not paired" });
    return;
  }
  const agent = await printing.authenticateAgent(req.restaurantId!, header.slice("Agent ".length).trim());
  if (!agent) {
    res.status(401).json({ message: "This print computer was removed or needs to be paired again" });
    return;
  }
  res.locals.printAgent = agent;
  next();
});

export const status = asyncHandler(async (req: Request, res: Response) => {
  res.json(await printing.printingStatus(getContext(req)));
});

export const myStation = asyncHandler(async (req: Request, res: Response) => {
  res.json(await printing.myStation(getContext(req)));
});

export const listStations = asyncHandler(async (req: Request, res: Response) => {
  res.json(await printing.listStations(getContext(req)));
});

export const createStation = asyncHandler(async (req: Request, res: Response) => {
  const { name } = parse(stationSchema, req.body);
  res.status(201).json(await printing.createStation(getContext(req), name));
});

export const renameStation = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(idParams, req.params);
  const { name } = parse(stationSchema, req.body);
  res.json(await printing.renameStation(getContext(req), id, name));
});

export const deleteStation = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(idParams, req.params);
  res.json(await printing.deleteStation(getContext(req), id));
});

export const setChefStation = asyncHandler(async (req: Request, res: Response) => {
  const { chefId } = parse(chefParams, req.params);
  const { stationId } = parse(chefStationSchema, req.body);
  res.json(await printing.setChefStation(getContext(req), chefId, stationId));
});

export const listAgents = asyncHandler(async (req: Request, res: Response) => {
  res.json(await printing.listAgents(getContext(req)));
});

export const createAgent = asyncHandler(async (req: Request, res: Response) => {
  const { name } = parse(agentSchema, req.body);
  res.status(201).json(await printing.createAgent(getContext(req), name));
});

export const renewPairingCode = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(idParams, req.params);
  res.json(await printing.renewPairingCode(getContext(req), id));
});

export const revokeAgent = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(idParams, req.params);
  res.json(await printing.revokeAgent(getContext(req), id));
});

export const listPrinters = asyncHandler(async (req: Request, res: Response) => {
  res.json(await printing.listPrinters(getContext(req)));
});

export const createPrinter = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(printerSchema, req.body);
  res.status(201).json(await printing.createPrinter(getContext(req), input));
});

export const updatePrinter = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(idParams, req.params);
  const input = parse(printerSchema, req.body);
  res.json(await printing.updatePrinter(getContext(req), id, input));
});

export const deletePrinter = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(idParams, req.params);
  res.json(await printing.deletePrinter(getContext(req), id));
});

export const testPrinter = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(idParams, req.params);
  res.json(await printing.testPrinter(getContext(req), id));
});

export const listJobs = asyncHandler(async (req: Request, res: Response) => {
  const { status: jobStatus } = parse(jobsQuery, req.query);
  res.json(await printing.listJobs(getContext(req), jobStatus));
});

export const retryJob = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(idParams, req.params);
  res.json(await printing.retryJob(getContext(req), id));
});

export const pairAgent = asyncHandler(async (req: Request, res: Response) => {
  const { code } = parse(pairSchema, req.body);
  res.json(await printing.pairAgent(req.restaurantId!, code));
});

export const agentJobs = asyncHandler(async (req: Request, res: Response) => {
  res.json(await printing.claimJobs(req.restaurantId!, agentOf(res)));
});

export const agentJobResult = asyncHandler(async (req: Request, res: Response) => {
  const { id } = parse(idParams, req.params);
  const result = parse(jobResultSchema, req.body);
  res.json(await printing.reportJobResult(req.restaurantId!, agentOf(res), id, result));
});
