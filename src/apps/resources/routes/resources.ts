import { Router, type Request, type Response } from "express";
import { listResources, createResource, getResource, saveResource } from "../controllers/resourceController";

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     Resource:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
  *         kind:
  *           type: string
  *           description: Resource kind/extension (e.g. .level, .mesh)
  *         uri:
  *           type: string
  *         sizeBytes:
  *           type: integer
  *         description:
  *           type: string
  *         tags:
  *           type: array
  *           items:
  *             type: string
  *         metadata:
  *           type: object
 *     ResourceNode:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         path:
 *           type: string
 *           description: Path relative to the content root
 *         kind:
 *           type: string
 *           enum: [directory, file]
 *         sizeBytes:
 *           type: integer
 *         extension:
 *           type: string
 *         children:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ResourceNode'
 */

/**
 * @openapi
 * /api/resources:
 *   get:
 *     summary: List all resources with folder hierarchy
 *     responses:
 *       200:
 *         description: Root node containing the full resource tree
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/ResourceNode'
 *   post:
 *     summary: Create a resource (not implemented)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               kind:
 *                 type: string
 *                 description: Resource kind/extension (e.g. .level, .mesh)
 *               uri:
 *                 type: string
 *                 description: Optional URI/path for the resource
 *               sizeBytes:
 *                 type: integer
 *               description:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Not implemented
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Resource'
 */
router.route("/")
  .get(async (req: Request, res: Response) => listResources(req, res))
  .post((req: Request, res: Response) => createResource(req, res));

/**
 * @openapi
 * /api/resources/{id}:
 *   get:
 *     summary: Get a single resource (not implemented)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Not implemented
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Resource'
 *       404:
 *         description: Not found
 */
router.get("/:id", (req: Request, res: Response) => getResource(req, res));

/**
 * @openapi
 * /api/resources:
 *   get:
 *     summary: List all resources with folder hierarchy
 *   post:
 *     summary: Create a resource (not implemented)
 * /api/resources/content:
 *   get:
 *     summary: Fetch file content by path query (?path=relative/path)
 *     parameters:
 *       - in: query
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Path relative to the content root
 *   put:
 *     summary: Save file content by path query (?path=relative/path)
 *     parameters:
 *       - in: query
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Path relative to the content root
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: Raw file contents to write
 */
router.get("/content", async (req: Request, res: Response) => getResource(req, res));
router.put("/content", async (req: Request, res: Response) => saveResource(req, res));

export default router;