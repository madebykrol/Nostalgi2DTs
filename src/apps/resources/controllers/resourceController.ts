import { type Request, type Response } from "express";
import { resourceService } from "../services/resourceService";

export const listResources = async (_req: Request, res: Response) => {
  const tree = await resourceService.listTree();
  return res.json({ data: tree });
};

// Placeholder stubs to keep route surface; these can be implemented to write files when needed
export const createResource = (_req: Request, res: Response) => {
  return res.status(501).json({ error: "Not implemented for filesystem-backed resources." });
};

export const getResource = async (req: Request, res: Response) => {
  const { path } = req.query;
  if (typeof path !== "string") {
    return res.status(400).json({ error: "Missing or invalid path query param" });
  }

  try {
    const content = await resourceService.getFile(path);
    // naive content-type inference
    if (path.endsWith(".json")) {
      res.type("application/json");
    } else if (path.endsWith(".tmx") || path.endsWith(".xml")) {
      res.type("application/xml");
    }
    return res.send(content);
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return res.status(404).json({ error: "Not found" });
    }
    console.error("Failed to read resource", err);
    return res.status(500).json({ error: "Failed to read resource" });
  }
};

export const saveResource = async (req: Request, res: Response) => {
  const { path } = req.query;
  const { content } = req.body ?? {};

  if (typeof path !== "string") {
    return res.status(400).json({ error: "Missing or invalid path query param" });
  }
  if (typeof content !== "string") {
    return res.status(400).json({ error: "Missing or invalid content" });
  }

  try {
    await resourceService.saveFile(path, content);
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("Failed to save resource", err);
    return res.status(500).json({ error: "Failed to save resource" });
  }
};