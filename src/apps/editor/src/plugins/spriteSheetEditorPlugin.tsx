import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AssetManifest, AssetPayloadPackedEntry, AssetService, EditorUIPlugin } from "@repo/engine";
import {
  fetchSpriteSheets,
  loadBinaryResource,
  saveBinaryResource,
  type SpriteSheetResource,
} from "../services/resourceLoader";

const DEFAULT_COLORS = [
  "#000000",
  "#ffffff",
  "#ff3b30",
  "#ff9500",
  "#ffcc00",
  "#34c759",
  "#5ac8fa",
  "#0a84ff",
  "#5856d6",
  "#af52de",
  "#ff2d55",
  "#ffd5e5",
];

type LayerMeta = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
};

type BrushType = "pixel" | "soft" | "eraser";

type Point = { x: number; y: number };

type SerializedLayer = {
  meta: LayerMeta;
  image: string;
};

type SpriteProjectData = {
  version: number;
  width: number;
  height: number;
  palette: string[];
  activeColor: string;
  customColor: string;
  brushType: BrushType;
  brushSize: number;
  gridSize: number;
  showGrid: boolean;
  exportPath: string;
  activeLayerId?: string;
  layers: SerializedLayer[];
};

const SPRITE_PROJECT_VERSION = 1;

const generateId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

const createLayerMeta = (name: string): LayerMeta => ({
  id: generateId(),
  name,
  visible: true,
  opacity: 1,
});

const ToolsMenuModal = ({ onClose, onLaunch }: { onClose: () => void; onLaunch: () => void }) => (
  <div className="fixed inset-0 z-[2050] flex items-center justify-center bg-black/60 p-6">
    <div className="w-[420px] rounded-2xl border border-white/10 bg-[#050914] text-white shadow-[0_25px_80px_rgba(5,9,20,0.65)]">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.5em] text-white/40">Tools</p>
          <p className="text-lg font-semibold">Creative Utilities</p>
        </div>
        <button
          type="button"
          className="rounded-md border border-white/15 px-3 py-1 text-xs uppercase tracking-wide text-white/70 hover:bg-white/10"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      <div className="space-y-4 px-5 py-6 text-sm">
        <p className="text-white/70">
          Launch in-editor authoring tools. Sprite Sheet Editor brings layered painting, palette workflow, and
          resource-server exports for texture authoring.
        </p>
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4">
          <div>
            <p className="text-sm font-semibold text-white">Sprite Sheet Editor</p>
            <p className="text-xs text-white/60">Paint textures with layers, palettes, brushes, and AA strokes.</p>
          </div>
          <button
            type="button"
            className="rounded-md bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-black"
            onClick={onLaunch}
          >
            Launch
          </button>
        </div>
      </div>
    </div>
  </div>
);

const useStableLayersState = () => {
  const initialActiveLayerRef = useRef<string>("");
  const [layers, setLayers] = useState<LayerMeta[]>(() => {
    const base = createLayerMeta("Base Layer");
    initialActiveLayerRef.current = base.id;
    return [base];
  });
  const [activeLayerId, setActiveLayerId] = useState<string>(() => initialActiveLayerRef.current);
  return { layers, setLayers, activeLayerId, setActiveLayerId } as const;
};

const useLayerCanvases = (width: number, height: number) => {
  const canvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

  const ensureCanvas = useCallback(
    (layerId: string) => {
      let canvas = canvasesRef.current.get(layerId);
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
        }
        canvasesRef.current.set(layerId, canvas);
      } else if (canvas.width !== width || canvas.height !== height) {
        const next = document.createElement("canvas");
        next.width = width;
        next.height = height;
        const nextCtx = next.getContext("2d");
        if (nextCtx) {
          nextCtx.imageSmoothingEnabled = false;
          nextCtx.drawImage(canvas, 0, 0);
        }
        canvasesRef.current.set(layerId, next);
        canvas = next;
      }
      return canvas;
    },
    [height, width]
  );

  const removeCanvas = useCallback((layerId: string) => {
    canvasesRef.current.delete(layerId);
  }, []);

  const getCanvas = useCallback(
    (layerId: string) => {
      return ensureCanvas(layerId);
    },
    [ensureCanvas]
  );

  const resizeAll = useCallback(
    (nextWidth: number, nextHeight: number) => {
      canvasesRef.current.forEach((canvas, layerId) => {
        const clone = document.createElement("canvas");
        clone.width = nextWidth;
        clone.height = nextHeight;
        const cloneCtx = clone.getContext("2d");
        if (cloneCtx) {
          cloneCtx.imageSmoothingEnabled = false;
          cloneCtx.drawImage(canvas, 0, 0);
        }
        canvasesRef.current.set(layerId, clone);
      });
    },
    []
  );

  const pruneMissing = useCallback((ids: Set<string>) => {
    canvasesRef.current.forEach((_canvas, layerId) => {
      if (!ids.has(layerId)) {
        canvasesRef.current.delete(layerId);
      }
    });
  }, []);

  return { getCanvas, removeCanvas, resizeAll, pruneMissing } as const;
};

const clampPoint = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const traverseLine = (from: Point, to: Point, visit: (point: Point) => void) => {
  let { x: x0, y: y0 } = from;
  let { x: x1, y: y1 } = to;
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    visit({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) {
      break;
    }
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
};

const toBase64Payload = (dataUrl: string): string => {
  const [, payload] = dataUrl.split(",");
  return payload ?? "";
};

const drawBase64ToCanvas = (canvas: HTMLCanvasElement, base64: string): Promise<void> => {
  if (!base64) {
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to obtain 2D context for layer canvas"));
        return;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve();
    };
    image.onerror = () => reject(new Error("Failed to decode project layer image"));
    image.src = `data:image/png;base64,${base64}`;
  });
};

const decodeBase64ToBinary = (value: string): string => {
  if (typeof atob !== "function") {
    throw new Error("Base64 decoding is not supported in this environment");
  }
  return atob(value);
};

const encodeBinaryToBase64 = (value: string): string => {
  if (typeof btoa !== "function") {
    throw new Error("Base64 encoding is not supported in this environment");
  }
  return btoa(value);
};

const base64ToBytes = (base64: string): Uint8Array => {
  const binary = decodeBase64ToBinary(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return encodeBinaryToBase64(binary);
};

const sliceArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer;
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

const alignUp = (value: number, alignment: number): number => {
  const remainder = value % alignment;
  return remainder === 0 ? value : value + (alignment - remainder);
};

const SpriteSheetEditorModal = ({ onClose }: { onClose: () => void }) => {
  const [sheetWidth, setSheetWidth] = useState(64);
  const [sheetHeight, setSheetHeight] = useState(64);
  const [pendingWidth, setPendingWidth] = useState(64);
  const [pendingHeight, setPendingHeight] = useState(64);
  const [zoom, setZoom] = useState(8);
  const [gridSize, setGridSize] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [palette, setPalette] = useState(DEFAULT_COLORS);
  const [activeColor, setActiveColor] = useState(DEFAULT_COLORS[0]);
  const [customColor, setCustomColor] = useState("#00ffff");
  const [brushType, setBrushType] = useState<BrushType>("pixel");
  const [brushSize, setBrushSize] = useState(1);
  const [filePath, setFilePath] = useState("textures/sprites/new-spritesheet.png");
  const [assetPath, setAssetPath] = useState("textures/sprites/new-spritesheet.n2asset");
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "loading" | "error" | "success"; message?: string }>({ kind: "idle" });
  const [showBrowser, setShowBrowser] = useState(false);
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [spriteSheets, setSpriteSheets] = useState<SpriteSheetResource[]>([]);
  const [sheetFilter, setSheetFilter] = useState("");
  const { layers, setLayers, activeLayerId, setActiveLayerId } = useStableLayersState();
  const { getCanvas, removeCanvas, resizeAll, pruneMissing } = useLayerCanvases(sheetWidth, sheetHeight);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const assetServiceRef = useRef<AssetService>(new AssetService());
  const isPaintingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);

  const ensurePreviewCanvasSize = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) {
      return;
    }
    if (canvas.width !== sheetWidth) {
      canvas.width = sheetWidth;
    }
    if (canvas.height !== sheetHeight) {
      canvas.height = sheetHeight;
    }
  }, [sheetHeight, sheetWidth]);

  const compositeLayers = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    for (let index = layers.length - 1; index >= 0; index -= 1) {
      const layer = layers[index];
      if (!layer.visible) {
        continue;
      }
      const layerCanvas = getCanvas(layer.id);
      ctx.globalAlpha = clampPoint(layer.opacity, 0, 1);
      ctx.drawImage(layerCanvas, 0, 0);
    }
    ctx.globalAlpha = 1;
  }, [getCanvas, layers]);

  useEffect(() => {
    ensurePreviewCanvasSize();
    compositeLayers();
  }, [compositeLayers, ensurePreviewCanvasSize, sheetHeight, sheetWidth]);

  useEffect(() => {
    pruneMissing(new Set(layers.map((layer) => layer.id)));
  }, [layers, pruneMissing]);

  useEffect(() => {
    if (!showBrowser) {
      return;
    }
    let cancelled = false;
    const loadSheets = async () => {
      setIsLoadingSheets(true);
      setSheetError(null);
      try {
        const data = await fetchSpriteSheets();
        if (!cancelled) {
          setSpriteSheets(data);
        }
      } catch (error: any) {
        if (!cancelled) {
          setSheetError(error?.message ?? "Failed to fetch sprite sheets");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSheets(false);
        }
      }
    };
    void loadSheets();
    return () => {
      cancelled = true;
    };
  }, [showBrowser]);

  useEffect(() => {
    // make sure canvases exist for each layer
    layers.forEach((layer) => {
      getCanvas(layer.id);
    });
  }, [getCanvas, layers]);

  const setLayerVisibility = useCallback(
    (layerId: string, visible: boolean) => {
      setLayers((current) => current.map((layer) => (layer.id === layerId ? { ...layer, visible } : layer)));
    },
    [setLayers]
  );

  const setLayerOpacity = useCallback(
    (layerId: string, opacity: number) => {
      setLayers((current) => current.map((layer) => (layer.id === layerId ? { ...layer, opacity } : layer)));
    },
    [setLayers]
  );

  const addLayer = useCallback(() => {
    setLayers((current) => {
      const next = createLayerMeta(`Layer ${current.length + 1}`);
      setActiveLayerId(next.id);
      return [next, ...current];
    });
  }, [setActiveLayerId, setLayers]);

  const removeLayer = useCallback(
    (layerId: string) => {
      setLayers((current) => {
        if (current.length === 1) {
          return current;
        }
        const filtered = current.filter((layer) => layer.id !== layerId);
        if (!filtered.find((layer) => layer.id === activeLayerId)) {
          setActiveLayerId(filtered[0].id);
        }
        removeCanvas(layerId);
        return filtered;
      });
    },
    [activeLayerId, removeCanvas, setActiveLayerId, setLayers]
  );

  const moveLayer = useCallback(
    (layerId: string, direction: "up" | "down") => {
      setLayers((current) => {
        const index = current.findIndex((layer) => layer.id === layerId);
        if (index === -1) {
          return current;
        }
        const swapWith = direction === "up" ? index - 1 : index + 1;
        if (swapWith < 0 || swapWith >= current.length) {
          return current;
        }
        const next = [...current];
        [next[index], next[swapWith]] = [next[swapWith], next[index]];
        return next;
      });
    },
    [setLayers]
  );

  const applyDimensions = useCallback(() => {
    const widthCandidate = Number.isFinite(pendingWidth) ? Math.floor(pendingWidth) : sheetWidth;
    const heightCandidate = Number.isFinite(pendingHeight) ? Math.floor(pendingHeight) : sheetHeight;
    const nextWidth = clampPoint(widthCandidate, 1, 1024);
    const nextHeight = clampPoint(heightCandidate, 1, 1024);
    if (nextWidth === sheetWidth && nextHeight === sheetHeight) {
      setPendingWidth(nextWidth);
      setPendingHeight(nextHeight);
      return;
    }
    resizeAll(nextWidth, nextHeight);
    setSheetWidth(nextWidth);
    setSheetHeight(nextHeight);
    setPendingWidth(nextWidth);
    setPendingHeight(nextHeight);
  }, [clampPoint, pendingHeight, pendingWidth, resizeAll, sheetHeight, sheetWidth]);

  const getPointFromEvent = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>): Point | null => {
      const surface = previewCanvasRef.current;
      if (!surface) {
        return null;
      }
      const rect = surface.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return null;
      }
      const scaleX = sheetWidth / rect.width;
      const scaleY = sheetHeight / rect.height;
      const x = Math.floor((event.clientX - rect.left) * scaleX);
      const y = Math.floor((event.clientY - rect.top) * scaleY);
      if (x < 0 || y < 0 || x >= sheetWidth || y >= sheetHeight) {
        return null;
      }
      return { x, y };
    },
    [sheetHeight, sheetWidth]
  );

  const applyBrush = useCallback(
    (point: Point) => {
      const layerCanvas = getCanvas(activeLayerId);
      const ctx = layerCanvas.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.imageSmoothingEnabled = false;
      if (brushType === "pixel") {
        const size = Math.max(1, Math.floor(brushSize));
        const offset = Math.floor(size / 2);
        ctx.fillStyle = activeColor;
        ctx.globalCompositeOperation = "source-over";
        ctx.fillRect(point.x - offset, point.y - offset, size, size);
      } else if (brushType === "soft") {
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = activeColor;
        const radius = Math.max(0.5, brushSize / 2);
        ctx.beginPath();
        ctx.arc(point.x + 0.5, point.y + 0.5, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        const size = Math.max(1, Math.floor(brushSize));
        ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
        ctx.restore();
      }
    },
    [activeColor, activeLayerId, brushSize, brushType, getCanvas]
  );

  const filteredSpriteSheets = useMemo(() => {
    const query = sheetFilter.trim().toLowerCase();
    if (query.length === 0) {
      return spriteSheets;
    }
    return spriteSheets.filter(
      (sheet) => sheet.name.toLowerCase().includes(query) || sheet.path.toLowerCase().includes(query)
    );
  }, [sheetFilter, spriteSheets]);

  const paintStroke = useCallback(
    (nextPoint: Point, previousPoint?: Point | null) => {
      if (!previousPoint) {
        applyBrush(nextPoint);
      } else {
        traverseLine(previousPoint, nextPoint, applyBrush);
      }
      compositeLayers();
    },
    [applyBrush, compositeLayers]
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0) {
        return;
      }
      const point = getPointFromEvent(event);
      if (!point) {
        return;
      }
      isPaintingRef.current = true;
      lastPointRef.current = point;
      const target = event.currentTarget;
      if (target.setPointerCapture) {
        target.setPointerCapture(event.pointerId);
      }
      paintStroke(point);
    },
    [getPointFromEvent, paintStroke]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!isPaintingRef.current) {
        return;
      }
      const point = getPointFromEvent(event);
      if (!point) {
        return;
      }
      paintStroke(point, lastPointRef.current);
      lastPointRef.current = point;
    },
    [getPointFromEvent, paintStroke]
  );

  const endPainting = useCallback(() => {
    isPaintingRef.current = false;
    lastPointRef.current = null;
  }, []);

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0) {
        return;
      }
      endPainting();
      const target = event.currentTarget;
      if (target.releasePointerCapture) {
        try {
          target.releasePointerCapture(event.pointerId);
        } catch (_err) {
          // ignore
        }
      }
    },
    [endPainting]
  );

  const serializeProject = useCallback((): SpriteProjectData => {
    return {
      version: SPRITE_PROJECT_VERSION,
      width: sheetWidth,
      height: sheetHeight,
      palette: [...palette],
      activeColor,
      customColor,
      brushType,
      brushSize,
      gridSize,
      showGrid,
      exportPath: filePath,
      activeLayerId,
      layers: layers.map((layer) => {
        const layerCanvas = getCanvas(layer.id);
        return {
          meta: { ...layer },
          image: toBase64Payload(layerCanvas.toDataURL("image/png")),
        };
      }),
    };
  }, [activeColor, activeLayerId, brushSize, brushType, customColor, filePath, getCanvas, gridSize, layers, palette, sheetHeight, sheetWidth, showGrid]);

  const applyProjectData = useCallback(
    async (project: SpriteProjectData) => {
      const nextWidth = clampPoint(Math.floor(project.width ?? sheetWidth), 1, 1024);
      const nextHeight = clampPoint(Math.floor(project.height ?? sheetHeight), 1, 1024);

      resizeAll(nextWidth, nextHeight);
      setSheetWidth(nextWidth);
      setSheetHeight(nextHeight);
      setPendingWidth(nextWidth);
      setPendingHeight(nextHeight);

      const nextPalette = Array.isArray(project.palette) && project.palette.length > 0 ? project.palette : DEFAULT_COLORS;
      setPalette(nextPalette);

      const nextActiveColor = project.activeColor ?? nextPalette[0] ?? DEFAULT_COLORS[0];
      setActiveColor(nextActiveColor);
      setCustomColor(project.customColor ?? "#00ffff");

      const nextBrushType: BrushType = project.brushType === "soft" || project.brushType === "eraser" ? project.brushType : "pixel";
      setBrushType(nextBrushType);
      setBrushSize(clampPoint(Math.floor(project.brushSize ?? brushSize), 1, 32));
      setGridSize(clampPoint(Math.floor(project.gridSize ?? gridSize), 1, 16));
      setShowGrid(typeof project.showGrid === "boolean" ? project.showGrid : showGrid);

      if (project.exportPath) {
        setFilePath(project.exportPath);
      }

      const normalizedLayers = project.layers.map((entry, index) => ({
        id: entry.meta?.id ?? generateId(),
        name: entry.meta?.name ?? `Layer ${index + 1}`,
        visible: entry.meta?.visible ?? true,
        opacity: clampPoint(typeof entry.meta?.opacity === "number" ? entry.meta.opacity : 1, 0, 1),
      }));

      await Promise.all(
        normalizedLayers.map(async (layer, index) => {
          const canvas = getCanvas(layer.id);
          canvas.width = nextWidth;
          canvas.height = nextHeight;
          await drawBase64ToCanvas(canvas, project.layers?.[index]?.image ?? "");
        })
      );

      setLayers(normalizedLayers);
      const nextActiveLayerId = normalizedLayers.find((layer) => layer.id === project.activeLayerId)?.id ?? normalizedLayers[0]?.id ?? "";
      setActiveLayerId(nextActiveLayerId);
    },
    [
      brushSize,
      getCanvas,
      gridSize,
      resizeAll,
      setActiveLayerId,
      setActiveColor,
      setBrushSize,
      setBrushType,
      setCustomColor,
      setFilePath,
      setGridSize,
      setLayers,
      setPalette,
      setPendingHeight,
      setPendingWidth,
      setSheetHeight,
      setSheetWidth,
      setShowGrid,
      sheetHeight,
      sheetWidth,
      showGrid,
    ]
  );

  const handleSaveAsset = useCallback(async () => {
    const canvas = previewCanvasRef.current;
    if (!canvas) {
      return;
    }
    setStatus({ kind: "saving", message: `Saving asset ${assetPath}...` });
    try {
      compositeLayers();
      const dataUrl = canvas.toDataURL("image/png");
      const pngBase64 = toBase64Payload(dataUrl);
      if (!pngBase64) {
        throw new Error("Failed to encode sprite sheet");
      }

      const project = serializeProject();
      const primaryLayerMeta = project.layers[0]?.meta;
      const payloadEntry: AssetPayloadPackedEntry = {
        id: project.activeLayerId ?? primaryLayerMeta?.id ?? generateId(),
        name: primaryLayerMeta?.name ?? "Sprite Project",
        type: "sprite",
        contentType: "image/png",
        bytes: base64ToBytes(pngBase64),
        metadata: {
          project,
        },
      };

      const manifest: AssetManifest = {
        format: "n2ar",
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: "SpriteSheetEditor",
        updatedBy: "SpriteSheetEditor",
        entries: [],
      };

      const payloadAlignment = 8;
      let relativeOffset = 0;
      manifest.entries = [
        {
          id: payloadEntry.id,
          name: payloadEntry.name ?? "",
          type: payloadEntry.type,
          contentType: payloadEntry.contentType,
          offset: relativeOffset,
          length: payloadEntry.bytes.byteLength,
          hash: await assetServiceRef.current.computeSha256Hex(payloadEntry.bytes),
          encoding: payloadEntry.encoding ?? "raw",
          metadata: payloadEntry.metadata ?? {},
        },
      ];
      relativeOffset = alignUp(relativeOffset + payloadEntry.bytes.byteLength, payloadAlignment);

      const buffer = await assetServiceRef.current.packAsset(manifest, [payloadEntry]);
      const assetBytes = new Uint8Array(buffer);
      await saveBinaryResource(assetPath, bytesToBase64(assetBytes));
      setStatus({ kind: "success", message: `Saved asset ${assetPath}` });
    } catch (error: any) {
      setStatus({ kind: "error", message: error?.message ?? "Failed to save asset" });
    }
  }, [assetPath, compositeLayers, serializeProject]);

  const handleLoadAsset = useCallback(
    async (pathOverride?: string) => {
      const targetPath = pathOverride ?? assetPath;
      setStatus({ kind: "loading", message: `Loading asset ${targetPath}...` });
      try {
        const base64 = await loadBinaryResource(targetPath);
        const bytes = base64ToBytes(base64);
        const buffer = sliceArrayBuffer(bytes);
        const manifest = assetServiceRef.current.readManifest(buffer);
        if (!manifest.entries || manifest.entries.length === 0) {
          throw new Error("Asset manifest contains no entries");
        }
        const primaryEntry = manifest.entries[0];
        const metadata = primaryEntry.metadata as { project?: SpriteProjectData } | undefined;
        if (!metadata?.project) {
          throw new Error("Sprite project metadata missing from asset");
        }

        const header = assetServiceRef.current.parseHeader(buffer);
        const payloadBytes = assetServiceRef.current.getEntryPayloadBytes(buffer, primaryEntry, header);
        if (primaryEntry.hash) {
          const digest = await assetServiceRef.current.computeSha256Hex(payloadBytes);
          if (digest !== primaryEntry.hash) {
            console.warn(`Sprite asset hash mismatch for ${primaryEntry.id} (expected ${primaryEntry.hash}, got ${digest})`);
          }
        }

        await applyProjectData(metadata.project);
        setAssetPath(targetPath);
        setStatus({ kind: "success", message: `Loaded asset ${targetPath}` });
      } catch (error: any) {
        setStatus({ kind: "error", message: error?.message ?? "Failed to load asset" });
      }
    },
    [applyProjectData, assetPath]
  );

  const handleExportPng = useCallback(async () => {
    const canvas = previewCanvasRef.current;
    if (!canvas) {
      return;
    }
    setStatus({ kind: "saving", message: `Exporting PNG to ${filePath}...` });
    try {
      compositeLayers();
      const dataUrl = canvas.toDataURL("image/png");
      const base64 = toBase64Payload(dataUrl);
      if (!base64) {
        throw new Error("Failed to encode sprite sheet");
      }
      await saveBinaryResource(filePath, base64);
      setStatus({ kind: "success", message: `Exported PNG ${filePath}` });
    } catch (error: any) {
      setStatus({ kind: "error", message: error?.message ?? "Failed to export sprite sheet" });
    }
  }, [compositeLayers, filePath]);

  const handleLoadPng = useCallback(
    async (pathOverride?: string) => {
      const targetPath = pathOverride ?? filePath;
      setStatus({ kind: "loading", message: `Loading texture ${targetPath}...` });
      try {
        const base64 = await loadBinaryResource(targetPath);
        const img = new Image();
        img.src = `data:image/png;base64,${base64}`;
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = (event) => reject(event);
        });
        resizeAll(img.width, img.height);
        setSheetWidth(img.width);
        setSheetHeight(img.height);
        setPendingWidth(img.width);
        setPendingHeight(img.height);
        const baseLayerId = layers[layers.length - 1]?.id ?? activeLayerId;
        const targetCanvas = getCanvas(baseLayerId);
        const ctx = targetCanvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
          ctx.drawImage(img, 0, 0);
        }
        compositeLayers();
        if (pathOverride) {
          setFilePath(targetPath);
        }
        setStatus({ kind: "success", message: `Loaded texture ${targetPath}` });
      } catch (error: any) {
        setStatus({ kind: "error", message: error?.message ?? "Failed to load PNG texture" });
      }
    },
    [activeLayerId, compositeLayers, filePath, getCanvas, layers, resizeAll]
  );

  const addPaletteColor = useCallback(() => {
    if (!palette.includes(customColor)) {
      setPalette((current) => [...current, customColor]);
    }
    setActiveColor(customColor);
  }, [customColor, palette]);

  const canvasStyle = useMemo(() => {
    const size = `${gridSize * zoom}px`;
    const gridBackground = showGrid
      ? {
          backgroundImage:
            "linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)," +
            "linear-gradient(0deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: `${size} ${size}`,
        }
      : {};
    return gridBackground;
  }, [gridSize, showGrid, zoom]);

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/70 p-6 text-white">
      <div className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#03060f] shadow-[0_40px_120px_rgba(0,0,0,0.65)]">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div>
            <p className="text-xs uppercase tracking-[0.5em] text-white/50">Sprite Sheet Editor</p>
            <p className="text-sm text-white/70">Layered painting with resource-server saves</p>
          </div>
          <button
            type="button"
            className="rounded-md border border-white/20 px-3 py-1 text-xs uppercase tracking-wide text-white/70 hover:bg-white/10"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <div className="flex flex-1 overflow-hidden">
          <aside className="w-64 border-r border-white/5 bg-white/5 p-4">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-white/60">
              <span>Layers</span>
              <button className="rounded bg-white/10 px-2 py-1 text-white" onClick={addLayer}>
                +
              </button>
            </div>
            <div className="mt-3 space-y-2 text-xs">
              {layers.map((layer, index) => {
                const isActive = layer.id === activeLayerId;
                return (
                  <div
                    key={layer.id}
                    className={`rounded-lg border px-3 py-2 ${
                      isActive ? "border-cyan-400/60 bg-cyan-400/10" : "border-white/10 bg-white/5"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <button
                        className={`text-left text-sm font-semibold ${isActive ? "text-white" : "text-white/70"}`}
                        onClick={() => setActiveLayerId(layer.id)}
                      >
                        {layer.name}
                      </button>
                      <div className="flex items-center gap-1">
                        <button
                          className="text-white/60 hover:text-white"
                          onClick={() => setLayerVisibility(layer.id, !layer.visible)}
                        >
                          {layer.visible ? "👁" : "🚫"}
                        </button>
                        <button className="text-white/60 hover:text-white" onClick={() => moveLayer(layer.id, "up")}>
                          ↑
                        </button>
                        <button className="text-white/60 hover:text-white" onClick={() => moveLayer(layer.id, "down")}>
                          ↓
                        </button>
                        <button className="text-white/60 hover:text-red-400" onClick={() => removeLayer(layer.id)}>
                          ✕
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-white/60">
                      <span>Opacity</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={layer.opacity}
                        onChange={(event) => setLayerOpacity(layer.id, Number(event.target.value))}
                        className="flex-1"
                      />
                      <span>{Math.round(layer.opacity * 100)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
          <main className="flex flex-1 flex-col">
            <div className="grid grid-cols-2 gap-3 border-b border-white/5 bg-white/5 px-5 py-3 text-xs text-white/80">
              <div className="col-span-2 flex gap-2">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.4em] text-white/40">PNG Export Path</span>
                  <input
                    type="text"
                    className="rounded border border-white/10 bg-black/30 px-2 py-1 text-white"
                    value={filePath}
                    onChange={(event) => setFilePath(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="self-end rounded border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide"
                  onClick={() => setShowBrowser(true)}
                >
                  Browse…
                </button>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.4em] text-white/40">Asset Path (.n2asset)</span>
                  <input
                    type="text"
                    className="rounded border border-white/10 bg-black/30 px-2 py-1 text-white"
                    value={assetPath}
                    onChange={(event) => setAssetPath(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="rounded border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide"
                  onClick={() => handleLoadAsset()}
                  disabled={status.kind === "loading"}
                >
                  {status.kind === "loading" ? "Loading..." : "Load Asset"}
                </button>
                <button
                  type="button"
                  className="rounded bg-gradient-to-r from-emerald-400 to-cyan-500 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-black"
                  onClick={handleSaveAsset}
                  disabled={status.kind === "saving"}
                >
                  {status.kind === "saving" ? "Saving..." : "Save Asset"}
                </button>
              </div>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  className="flex-1 rounded border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide"
                  onClick={() => handleLoadPng()}
                  disabled={status.kind === "loading"}
                >
                  {status.kind === "loading" ? "Loading..." : "Load PNG"}
                </button>
                <button
                  type="button"
                  className="flex-1 rounded bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-black"
                  onClick={handleExportPng}
                  disabled={status.kind === "saving"}
                >
                  {status.kind === "saving" ? "Saving..." : "Export PNG"}
                </button>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex flex-col gap-1 text-white/80">
                  <span className="text-[10px] uppercase tracking-[0.4em] text-white/40">Width</span>
                  <input
                    type="number"
                    min={1}
                    max={1024}
                    value={pendingWidth}
                    className="rounded border border-white/10 bg-black/30 px-2 py-1 text-white"
                    onChange={(event) => setPendingWidth(Number(event.target.value))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-white/80">
                  <span className="text-[10px] uppercase tracking-[0.4em] text-white/40">Height</span>
                  <input
                    type="number"
                    min={1}
                    max={1024}
                    value={pendingHeight}
                    className="rounded border border-white/10 bg-black/30 px-2 py-1 text-white"
                    onChange={(event) => setPendingHeight(Number(event.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className="rounded border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide"
                  onClick={applyDimensions}
                >
                  Apply
                </button>
              </div>
              <div className="flex items-end gap-3">
                <label className="flex flex-col text-white/80">
                  <span className="text-[10px] uppercase tracking-[0.4em] text-white/40">Zoom</span>
                  <input
                    type="range"
                    min={2}
                    max={24}
                    value={zoom}
                    onChange={(event) => setZoom(Number(event.target.value))}
                  />
                </label>
                <label className="flex flex-col text-white/80">
                  <span className="text-[10px] uppercase tracking-[0.4em] text-white/40">Grid</span>
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={gridSize}
                    className="w-20 rounded border border-white/10 bg-black/30 px-2 py-1 text-white"
                    onChange={(event) => setGridSize(Number(event.target.value))}
                  />
                </label>
                <label className="flex items-center gap-2 text-[11px] text-white/70">
                  <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
                  Show Grid
                </label>
              </div>
            </div>
            <div className="flex flex-1 overflow-hidden">
              <div className="flex-1 overflow-auto bg-[#050814] p-6">
                <div
                  className="relative inline-block rounded-lg border border-white/10 bg-[#0a0f1f]"
                  style={{ ...canvasStyle, padding: `${zoom}px` }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={endPainting}
                >
                  <canvas
                    ref={previewCanvasRef}
                    width={sheetWidth}
                    height={sheetHeight}
                    style={{
                      width: sheetWidth * zoom,
                      height: sheetHeight * zoom,
                      imageRendering: "pixelated",
                      display: "block",
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 border border-white/5" />
                </div>
              </div>
              <aside className="w-72 border-l border-white/5 bg-white/5 p-4">
                <section>
                  <p className="text-xs uppercase tracking-[0.4em] text-white/40">Brush</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    {[
                      { id: "pixel", label: "Pixel" },
                      { id: "soft", label: "Soft" },
                      { id: "eraser", label: "Eraser" },
                    ].map((option) => (
                      <button
                        key={option.id}
                        className={`rounded border px-2 py-2 ${
                          brushType === option.id ? "border-cyan-400/60 bg-cyan-400/10" : "border-white/15 bg-white/5"
                        }`}
                        onClick={() => setBrushType(option.id as BrushType)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <label className="mt-3 flex flex-col text-xs text-white/80">
                    Size
                    <input
                      type="range"
                      min={1}
                      max={32}
                      value={brushSize}
                      onChange={(event) => setBrushSize(Number(event.target.value))}
                    />
                  </label>
                </section>
                <section className="mt-6">
                  <p className="text-xs uppercase tracking-[0.4em] text-white/40">Palette</p>
                  <div className="mt-3 grid grid-cols-6 gap-2">
                    {palette.map((color) => (
                      <button
                        key={color}
                        className={`h-8 w-8 rounded border ${
                          activeColor === color ? "border-cyan-400" : "border-white/20"
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setActiveColor(color)}
                        title={color}
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs">
                    <input type="color" value={customColor} onChange={(event) => setCustomColor(event.target.value)} />
                    <button className="rounded border border-white/15 px-3 py-1" onClick={addPaletteColor}>
                      Add
                    </button>
                  </div>
                </section>
                <section className="mt-6 text-xs text-white/70">
                  <p className="uppercase tracking-[0.4em] text-white/40">Status</p>
                  <div className="mt-2 rounded border border-white/10 bg-white/5 px-3 py-2">
                    {status.kind === "idle" && <span>Waiting for changes</span>}
                    {status.kind === "saving" && <span>{status.message}</span>}
                    {status.kind === "loading" && <span>{status.message}</span>}
                    {status.kind === "success" && <span className="text-green-300">{status.message}</span>}
                    {status.kind === "error" && <span className="text-red-300">{status.message}</span>}
                  </div>
                </section>
              </aside>
            </div>
          </main>
        </div>
      </div>
      {showBrowser && (
        <div className="fixed inset-0 z-[2300] flex items-center justify-center bg-black/80 px-4 py-8">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#050914] p-4 text-white shadow-[0_35px_90px_rgba(0,0,0,0.7)]">
            <header className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.5em] text-white/40">Sprite Sheets</p>
                <p className="text-base font-semibold">Resource Browser</p>
              </div>
              <button
                type="button"
                className="rounded-md border border-white/20 px-3 py-1 text-xs uppercase tracking-wide text-white/70 hover:bg-white/10"
                onClick={() => setShowBrowser(false)}
              >
                Close
              </button>
            </header>
            <div className="mt-4 space-y-3 text-sm">
              <input
                type="text"
                placeholder="Search sprite sheets…"
                className="w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-white"
                value={sheetFilter}
                onChange={(event) => setSheetFilter(event.target.value)}
              />
              <div className="max-h-80 overflow-auto rounded-lg border border-white/10 bg-white/5 p-2">
                {isLoadingSheets && <p className="px-2 py-4 text-center text-xs text-white/70">Loading sprite sheets…</p>}
                {sheetError && <p className="px-2 py-4 text-center text-xs text-red-300">{sheetError}</p>}
                {!isLoadingSheets && !sheetError && filteredSpriteSheets.length === 0 && (
                  <p className="px-2 py-4 text-center text-xs text-white/60">No sprite sheets found.</p>
                )}
                {!isLoadingSheets && !sheetError && filteredSpriteSheets.length > 0 && (
                  <ul className="space-y-2 text-xs">
                    {filteredSpriteSheets.map((sheet) => (
                      <li key={sheet.path}>
                        <button
                          className="w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-left transition hover:border-cyan-400/60 hover:bg-cyan-400/5"
                          onClick={() => {
                            setShowBrowser(false);
                            setSheetFilter("");
                            void handleLoadPng(sheet.path);
                          }}
                        >
                          <p className="text-sm font-semibold text-white">{sheet.name}</p>
                          <p className="text-[11px] text-white/60">{sheet.path} • {(sheet.sizeBytes / 1024).toFixed(1)} KB</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const spriteSheetEditorPlugin: EditorUIPlugin = {
  id: "builtin.sprite-sheet-editor",
  activate: ({ modalTriggers, modals }) => {
    const openEditor = () => {
      modals.open((api) => <SpriteSheetEditorModal onClose={api.close} />);
    };

    const unregisterToolsMenu = modalTriggers.register({
      id: "builtin.sprite-sheet-editor.tools",
      event: "toolbar.menu",
      menuId: "tools",
      order: -10,
      render: (_context, api) => (
        <ToolsMenuModal
          onClose={api.close}
          onLaunch={() => {
            api.close();
            openEditor();
          }}
        />
      ),
    });

    return () => {
      unregisterToolsMenu();
    };
  },
};

export default spriteSheetEditorPlugin;
