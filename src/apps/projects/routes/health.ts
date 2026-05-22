import { Router, type Request, type Response } from "express";

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check
 *     responses:
 *       200:
 *         description: Service is healthy
 */
router.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", message: "Resource server healthy" });
});

export default router;