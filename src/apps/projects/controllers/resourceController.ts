import { type Request, type Response } from "express";
import { resourceService } from "../services/resourceService";

export const listResources = async (_req: Request, res: Response) => {
  const tree = await resourceService.listTree();
  return res.json({ data: tree });
};

export const listAssets = async (_req: Request, res: Response) => {
  const tree = await resourceService.listAssetTree();
  return res.json({ data: tree });
};

export const listAssetsByType = async (req: Request, res: Response) => {
  const { types } = req.query;
  const raw = typeof types === "string" ? types : Array.isArray(types) ? types.join(",") : "";
  const filters = raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);

  if (filters.length === 0) {
    return res.status(400).json({ error: "Missing type filter (e.g. ?types=level)" });
  }

  try {
    const assets = await resourceService.listAssetsByType(filters);
    return res.json({ data: assets });
  } catch (err) {
    console.error("Failed to list assets by type", err);
    return res.status(500).json({ error: "Failed to list assets" });
  }
};

export const listProjects = async (_req: Request, res: Response) => {
  try {
    const projects = await resourceService.listProjects();
    return res.json({ data: projects });
  } catch (err) {
    console.error("Failed to list projects", err);
    return res.status(500).json({ error: "Failed to list projects" });
  }
};

export const getProject = async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Missing project id" });
  }

  try {
    const project = await resourceService.getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    return res.json({ data: project });
  } catch (err) {
    console.error("Failed to get project", err);
    return res.status(500).json({ error: "Failed to get project" });
  }
};

// Placeholder stubs to keep route surface; these can be implemented to write files when needed
export const createResource = (_req: Request, res: Response) => {
  return res.status(501).json({ error: "Not implemented for filesystem-backed resources." });
};

export const getResource = async (req: Request, res: Response) => {
  const { path, encoding } = req.query;
  if (typeof path !== "string") {
    return res.status(400).json({ error: "Missing or invalid path query param" });
  }
  const resolvedEncoding = encoding === "base64" ? "base64" : "utf-8";

  try {
    const content = await resourceService.getFile(path, resolvedEncoding);
    if (resolvedEncoding === "base64") {
      res.type("text/plain");
    } else {
      if (path.endsWith(".json")) {
        res.type("application/json");
      } else if (path.endsWith(".tmx") || path.endsWith(".xml")) {
        res.type("application/xml");
      }
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
  const { content, encoding } = req.body ?? {};

  if (typeof path !== "string") {
    return res.status(400).json({ error: "Missing or invalid path query param" });
  }
  if (typeof content !== "string") {
    return res.status(400).json({ error: "Missing or invalid content" });
  }
  const resolvedEncoding = encoding === "base64" ? "base64" : "utf-8";

  try {
    await resourceService.saveFile(path, content, resolvedEncoding);
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("Failed to save resource", err);
    return res.status(500).json({ error: "Failed to save resource" });
  }
};

export const listSpriteSheets = async (req: Request, res: Response) => {
  const { extension = ".png" } = req.query;
  if (typeof extension !== "string" || extension.trim().length === 0) {
    return res.status(400).json({ error: "Missing or invalid extension" });
  }

  try {
    const files = await resourceService.listFilesWithExtension(extension);
    return res.json({ data: files });
  } catch (err) {
    console.error("Failed to list sprite sheets", err);
    return res.status(500).json({ error: "Failed to list sprite sheets" });
  }
};