import { Router } from "express";
import healthRouter from "./health";
import resourcesRouter from "./resources";

const v1 = Router();

// Mount versioned sub-routes
v1.use(healthRouter);
v1.use("/api/resources", resourcesRouter);

export default v1;