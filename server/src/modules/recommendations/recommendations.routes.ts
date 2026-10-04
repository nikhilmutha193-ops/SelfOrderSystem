import { Router } from "express";

import { getRecommendations } from "./recommendations.controller";

const recommendationRoutes = Router();

recommendationRoutes.get("/", getRecommendations);

export default recommendationRoutes;
