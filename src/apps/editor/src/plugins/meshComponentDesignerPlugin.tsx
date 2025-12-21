import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Actor, MeshComponent } from "@repo/engine";
import type {
  ComponentAsset,
  MeshComponentAssetPayload,
  EditorUIPlugin,
} from "@repo/engine";

type MeshVertex = { x: number; y: number };

type MeshDesignerMetadata = {
  vertices: MeshVertex[];
};

const DEFAULT_MESH_METADATA: MeshDesignerMetadata = {
  vertices: [
    { x: -0.5, y: -0.5 },
    { x: 0.5, y: -0.5 },
    { x: 0.5, y: 0.5 },
    { x: -0.5, y: 0.5 },
  ],
};

const cloneVertices = (vertices: MeshVertex[]): MeshVertex[] => vertices.map((vertex) => ({ x: vertex.x, y: vertex.y }));

const normalizeMeshMetadata = (metadata: unknown): MeshDesignerMetadata => {
  if (!metadata || typeof metadata !== "object") {
    return { vertices: cloneVertices(DEFAULT_MESH_METADATA.vertices) };
  }

  const rawVertices = Array.isArray((metadata as any).vertices) ? (metadata as any).vertices : [];

  const normalized = rawVertices
    .map((entry: unknown) => {
      if (Array.isArray(entry) && entry.length >= 2 && Number.isFinite(entry[0]) && Number.isFinite(entry[1])) {
        return { x: Number(entry[0]), y: Number(entry[1]) };
      }
      if (entry && typeof entry === "object" && Number.isFinite((entry as any).x) && Number.isFinite((entry as any).y)) {
        return { x: Number((entry as any).x), y: Number((entry as any).y) };
      }
      return null;
    })
    .filter((value:any): value is MeshVertex => value !== null);

  if (normalized.length >= 3) {
    return { vertices: cloneVertices(normalized) };
  }

  return { vertices: cloneVertices(DEFAULT_MESH_METADATA.vertices) };
};

const serializeMeshMetadata = (metadata: MeshDesignerMetadata): MeshComponentAssetPayload["metadata"] => ({
  vertices: cloneVertices(metadata.vertices),
});

const ensureMeshMetadata = (payload: MeshComponentAssetPayload | null | undefined): MeshDesignerMetadata =>
  normalizeMeshMetadata(payload?.metadata);

const normalizeMeshAsset = (asset: ComponentAsset): ComponentAsset => {
  if (asset.type !== "mesh") {
    return { ...asset };
  }
  const payload = (asset.payload ?? {}) as MeshComponentAssetPayload;
  const normalized = ensureMeshMetadata(payload);
  return {
    ...asset,
    payload: {
      meshId: payload.meshId ?? "",
      materialId: payload.materialId ?? "",
      metadata: serializeMeshMetadata(normalized),
    },
  };
};

const WORLD_LIMIT = 1.5;
const CANVAS_SIZE = 480;
const WORLD_SCALE = CANVAS_SIZE / (WORLD_LIMIT * 2);
const GRID_SPACING = 40;
const VERTEX_RADIUS = 7;
const DETECTION_RADIUS = 16;

const clampVertex = (vertex: MeshVertex): MeshVertex => ({
  x: Math.min(WORLD_LIMIT, Math.max(-WORLD_LIMIT, vertex.x)),
  y: Math.min(WORLD_LIMIT, Math.max(-WORLD_LIMIT, vertex.y)),
});

type MeshAssetFormProps = {
  asset: ComponentAsset | null;
  onChange: (asset: ComponentAsset) => void;
  onSave: (asset: ComponentAsset) => Promise<void>;
  onDelete?: (asset: ComponentAsset) => Promise<void>;
  onOpenDesigner?: () => void;
};

const MeshAssetForm = ({ asset, onChange, onSave, onDelete, onOpenDesigner }: MeshAssetFormProps) => {
  const hasAsset = Boolean(asset);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!asset) {
    return <div className="text-xs text-white/70">Select or create a mesh component asset.</div>;
  }

  const payload = asset.payload as MeshComponentAssetPayload;

  const handleChange = <T extends keyof MeshComponentAssetPayload>(key: T, value: MeshComponentAssetPayload[T]) => {
    onChange({
      ...asset,
      payload: {
        ...payload,
        [key]: value,
      },
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(asset);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) {
      return;
    }
    setIsDeleting(true);
    try {
      await onDelete(asset);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-3 text-xs text-white/80">
      <div className="space-y-2">
        <label className="flex flex-col gap-1">
          <span className="uppercase text-white/50 tracking-wide text-[11px]">Name</span>
          <input
            className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
            value={asset.name}
            onChange={(event) => onChange({ ...asset, name: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="uppercase text-white/50 tracking-wide text-[11px]">Mesh Asset ID</span>
          <input
            className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
            value={payload.meshId}
            onChange={(event) => handleChange("meshId", event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="uppercase text-white/50 tracking-wide text-[11px]">Material Asset ID</span>
          <input
            className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
            value={payload.materialId}
            onChange={(event) => handleChange("materialId", event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="uppercase text-white/50 tracking-wide text-[11px]">Description</span>
          <textarea
            className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
            value={asset.description ?? ""}
            onChange={(event) => onChange({ ...asset, description: event.target.value })}
            rows={3}
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        {onOpenDesigner && (
          <button
            type="button"
            className="rounded border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10 disabled:opacity-40"
            onClick={onOpenDesigner}
            disabled={!asset || isSaving || isDeleting}
          >
            Open Designer
          </button>
        )}
        <button
          type="button"
          className="rounded bg-cyan-500/80 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : hasAsset ? "Save" : "Create"}
        </button>
        {onDelete && (
          <button
            type="button"
            className="rounded border border-white/20 px-3 py-1 text-xs text-white/70 hover:bg-white/10"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        )}
      </div>
    </div>
  );
};

const MeshComponentList = ({
  assets,
  selected,
  onSelect,
  onCreate,
}: {
  assets: ComponentAsset[];
  selected: ComponentAsset | null;
  onSelect: (asset: ComponentAsset) => void;
  onCreate: () => void;
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-wide text-white/60">Mesh Components</h3>
        <button
          type="button"
          className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
          onClick={onCreate}
        >
          New
        </button>
      </div>
      <div className="space-y-1">
        {assets.length === 0 ? (
          <div className="rounded border border-dashed border-white/15 bg-white/5 px-3 py-2 text-xs text-white/60">
            No mesh component assets defined.
          </div>
        ) : (
          assets.map((asset) => {
            const isSelected = selected?.id === asset.id;
            return (
              <button
                key={asset.id}
                type="button"
                className={`flex w-full flex-col rounded border px-3 py-2 text-left transition ${
                  isSelected
                    ? "border-cyan-400/60 bg-cyan-400/10 text-white"
                    : "border-white/10 bg-white/5 text-white/80 hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-white"
                }`}
                onClick={() => onSelect(asset)}
              >
                <span className="text-xs font-semibold">{asset.name}</span>
                {asset.description && (
                  <span className="text-[11px] text-white/60">{asset.description}</span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

const createEmptyMeshAsset = (): ComponentAsset => ({
  id: `mesh-${crypto.randomUUID()}`,
  name: "New Mesh Component",
  type: "mesh",
  description: "",
  payload: {
    meshId: "",
    materialId: "",
    metadata: serializeMeshMetadata(DEFAULT_MESH_METADATA),
  } satisfies MeshComponentAssetPayload,
});

type MeshDesignerModalProps = {
  asset: ComponentAsset;
  onApply: (metadata: MeshComponentAssetPayload["metadata"]) => void;
  onClose: () => void;
};

const MeshDesignerModal = ({ asset, onApply, onClose }: MeshDesignerModalProps) => {
  const payload = asset.payload as MeshComponentAssetPayload;
  const baseMetadata = useMemo(() => ensureMeshMetadata(payload), [asset]);
  const [vertices, setVertices] = useState<MeshVertex[]>(() => cloneVertices(baseMetadata.vertices));
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    setVertices(cloneVertices(baseMetadata.vertices));
    setSelectedIndex(null);
  }, [baseMetadata]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ratio = window.devicePixelRatio ?? 1;
    canvas.width = CANVAS_SIZE * ratio;
    canvas.height = CANVAS_SIZE * ratio;
    canvas.style.width = `${CANVAS_SIZE}px`;
    canvas.style.height = `${CANVAS_SIZE}px`;
  }, []);

  const toCanvasPoint = useCallback(
    (vertex: MeshVertex) => ({
      x: CANVAS_SIZE / 2 + vertex.x * WORLD_SCALE,
      y: CANVAS_SIZE / 2 - vertex.y * WORLD_SCALE,
    }),
    []
  );

  const canvasToWorld = useCallback(
    (point: { x: number; y: number }): MeshVertex => ({
      x: (point.x - CANVAS_SIZE / 2) / WORLD_SCALE,
      y: (CANVAS_SIZE / 2 - point.y) / WORLD_SCALE,
    }),
    []
  );

  const getCanvasPosition = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }, []);

  const findNearestVertex = useCallback(
    (point: { x: number; y: number }) => {
      let nearestIndex = -1;
      let nearestDistanceSq = DETECTION_RADIUS * DETECTION_RADIUS;
      vertices.forEach((vertex, index) => {
        const canvasPoint = toCanvasPoint(vertex);
        const dx = canvasPoint.x - point.x;
        const dy = canvasPoint.y - point.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq <= nearestDistanceSq) {
          nearestIndex = index;
          nearestDistanceSq = distanceSq;
        }
      });
      return nearestIndex;
    },
    [toCanvasPoint, vertices]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    const ratio = window.devicePixelRatio ?? 1;
    context.save();
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    context.fillStyle = "#020617";
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    context.strokeStyle = "rgba(148, 163, 184, 0.15)";
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 0; x <= CANVAS_SIZE; x += GRID_SPACING) {
      context.moveTo(x, 0);
      context.lineTo(x, CANVAS_SIZE);
    }
    for (let y = 0; y <= CANVAS_SIZE; y += GRID_SPACING) {
      context.moveTo(0, y);
      context.lineTo(CANVAS_SIZE, y);
    }
    context.stroke();

    context.strokeStyle = "rgba(236, 72, 153, 0.35)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(CANVAS_SIZE / 2, 0);
    context.lineTo(CANVAS_SIZE / 2, CANVAS_SIZE);
    context.moveTo(0, CANVAS_SIZE / 2);
    context.lineTo(CANVAS_SIZE, CANVAS_SIZE / 2);
    context.stroke();

    if (vertices.length >= 3) {
      context.lineWidth = 2;
      context.strokeStyle = "rgba(34, 211, 238, 0.9)";
      context.fillStyle = "rgba(34, 211, 238, 0.18)";
      context.beginPath();
      vertices.forEach((vertex, index) => {
        const point = toCanvasPoint(vertex);
        if (index === 0) {
          context.moveTo(point.x, point.y);
        } else {
          context.lineTo(point.x, point.y);
        }
      });
      context.closePath();
      context.fill();
      context.stroke();
    }

    vertices.forEach((vertex, index) => {
      const point = toCanvasPoint(vertex);
      context.beginPath();
      context.fillStyle = index === selectedIndex ? "rgba(244, 114, 182, 0.95)" : "rgba(94, 234, 212, 0.95)";
      context.strokeStyle = "#020617";
      context.lineWidth = 2;
      context.arc(point.x, point.y, VERTEX_RADIUS, 0, Math.PI * 2);
      context.fill();
      context.stroke();

      context.fillStyle = "#e2e8f0";
      context.font = "11px 'JetBrains Mono', monospace";
      context.textAlign = "center";
      context.textBaseline = "top";
      context.fillText(String(index + 1), point.x, point.y + VERTEX_RADIUS + 4);
    });

    context.restore();
  }, [selectedIndex, toCanvasPoint, vertices]);

  const releasePointer = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== null) {
      try {
        if (event.currentTarget.hasPointerCapture(pointerIdRef.current)) {
          event.currentTarget.releasePointerCapture(pointerIdRef.current);
        }
      } catch {
        // ignore release errors
      }
    }
    dragIndexRef.current = null;
    pointerIdRef.current = null;
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      const canvasPosition = getCanvasPosition(event);
      const nearest = findNearestVertex(canvasPosition);
      if (nearest !== -1) {
        if (event.shiftKey) {
          setVertices((current) => {
            if (current.length <= 3) {
              return current;
            }
            const next = current.filter((_, index) => index !== nearest);
            setSelectedIndex((previous) => {
              if (previous === null) {
                return null;
              }
              if (previous === nearest) {
                return null;
              }
              if (previous > nearest) {
                return previous - 1;
              }
              return previous;
            });
            return next;
          });
          return;
        }
        dragIndexRef.current = nearest;
        pointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        setSelectedIndex(nearest);
        return;
      }

      if (event.shiftKey) {
        return;
      }

      const worldPoint = clampVertex(canvasToWorld(canvasPosition));
      setVertices((current) => {
        const next = [...current, worldPoint];
        setSelectedIndex(next.length - 1);
        return next;
      });
    },
    [canvasToWorld, findNearestVertex, getCanvasPosition]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (dragIndexRef.current === null || pointerIdRef.current !== event.pointerId) {
        return;
      }
      event.preventDefault();
      const canvasPosition = getCanvasPosition(event);
      const worldPoint = clampVertex(canvasToWorld(canvasPosition));
      const index = dragIndexRef.current;
      setVertices((current) => current.map((vertex, vertexIndex) => (vertexIndex === index ? worldPoint : vertex)));
    },
    [canvasToWorld, getCanvasPosition]
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (pointerIdRef.current !== event.pointerId) {
        return;
      }
      releasePointer(event);
    },
    [releasePointer]
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (pointerIdRef.current !== event.pointerId) {
        return;
      }
      releasePointer(event);
    },
    [releasePointer]
  );

  const handlePointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (dragIndexRef.current !== null) {
        releasePointer(event);
      }
    },
    [releasePointer]
  );

  const handleSelectVertex = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const handleCoordinateChange = useCallback(
    (index: number, axis: "x" | "y") => (event: ReactChangeEvent<HTMLInputElement>) => {
      const value = Number.parseFloat(event.target.value);
      if (!Number.isFinite(value)) {
        return;
      }
      setVertices((current) =>
        current.map((vertex, vertexIndex) => {
          if (vertexIndex !== index) {
            return vertex;
          }
          const next = { ...vertex, [axis]: value } as MeshVertex;
          return clampVertex(next);
        })
      );
    },
    []
  );

  const handleRemoveVertex = useCallback((index: number) => {
    setVertices((current) => {
      if (current.length <= 3) {
        return current;
      }
      const next = current.filter((_, vertexIndex) => vertexIndex !== index);
      setSelectedIndex((previous) => {
        if (previous === null) {
          return null;
        }
        if (previous === index) {
          return null;
        }
        if (previous > index) {
          return previous - 1;
        }
        return previous;
      });
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setVertices(cloneVertices(DEFAULT_MESH_METADATA.vertices));
    setSelectedIndex(null);
  }, []);

  const handleApply = useCallback(() => {
    onApply(serializeMeshMetadata({ vertices: cloneVertices(vertices) }));
    onClose();
  }, [onApply, onClose, vertices]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-950/70 p-6 backdrop-blur-sm">
      <div className="pointer-events-auto flex h-[640px] w-[920px] max-w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-950/95 text-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 bg-white/5 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Mesh Designer</h2>
            <p className="text-xs text-white/60">Editing asset {(asset.name ?? asset.id) || asset.id}</p>
          </div>
          <button
            type="button"
            className="rounded border border-white/20 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <div className="flex flex-1 flex-col gap-6 overflow-hidden px-6 py-4 lg:flex-row">
          <div className="flex flex-1 flex-col items-center gap-3">
            <div className="relative">
              <canvas
                ref={canvasRef}
                className="h-[480px] w-[480px] max-w-full rounded border border-white/15 bg-black/40"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onPointerLeave={handlePointerLeave}
                onContextMenu={(event) => event.preventDefault()}
              />
            </div>
            <div className="text-[11px] text-white/60">
              <p>Click to add vertices, drag points to move them.</p>
              <p>Shift + click a point or press Remove to delete (minimum of three vertices).</p>
            </div>
          </div>
          <div className="flex w-full max-w-sm flex-col gap-3">
            <div>
              <h3 className="text-[11px] uppercase tracking-wide text-white/60">Vertices</h3>
              <div className="mt-2 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: "420px" }}>
                {vertices.map((vertex, index) => {
                  const isSelected = selectedIndex === index;
                  return (
                    <div
                      key={index}
                      className={`flex items-center gap-2 rounded border px-2 py-1 text-xs transition ${
                        isSelected
                          ? "border-cyan-400/60 bg-cyan-400/10 text-white"
                          : "border-white/10 bg-white/5 text-white/80 hover:border-cyan-400/40 hover:bg-cyan-400/10"
                      }`}
                    >
                      <button
                        type="button"
                        className="flex-1 text-left font-semibold"
                        onClick={() => handleSelectVertex(index)}
                      >
                        V{index + 1}
                      </button>
                      <label className="flex items-center gap-1 text-[11px] text-white/60">
                        x
                        <input
                          type="number"
                          step="0.05"
                          className="w-20 rounded border border-white/15 bg-slate-900 px-2 py-1 text-xs text-white focus:border-cyan-400/60 focus:outline-none"
                          value={Number(vertex.x.toFixed(3))}
                          onChange={handleCoordinateChange(index, "x")}
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-white/60">
                        y
                        <input
                          type="number"
                          step="0.05"
                          className="w-20 rounded border border-white/15 bg-slate-900 px-2 py-1 text-xs text-white focus:border-cyan-400/60 focus:outline-none"
                          value={Number(vertex.y.toFixed(3))}
                          onChange={handleCoordinateChange(index, "y")}
                        />
                      </label>
                      <button
                        type="button"
                        className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10 disabled:opacity-30"
                        onClick={() => handleRemoveVertex(index)}
                        disabled={vertices.length <= 3}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded border border-white/10 bg-white/5 p-3 text-[11px] text-white/70">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Tips</h4>
              <ul className="mt-2 space-y-1 list-disc pl-4">
                <li>Vertices are ordered; keep a consistent winding for best results.</li>
                <li>Use Reset to return to the default quad layout.</li>
                <li>Save the asset after applying to persist your changes.</li>
              </ul>
            </div>
          </div>
        </div>
        <footer className="flex flex-col gap-3 border-t border-white/10 bg-white/5 px-6 py-4 text-xs text-white/70 sm:flex-row sm:items-center sm:justify-between">
          <div>Shift + click a vertex to remove it. Drag vertices to refine your mesh silhouette.</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded border border-white/20 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
              onClick={handleReset}
            >
              Reset
            </button>
            <button
              type="button"
              className="rounded bg-cyan-500/80 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
              onClick={handleApply}
            >
              Apply
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

const MeshComponentDesignerPanel = ({
  assets,
  onSave,
  onDelete,
  onAttach,
  selectedActor,
  openDesigner,
}: {
  assets: ComponentAsset[];
  onSave: (asset: ComponentAsset) => Promise<void>;
  onDelete: (asset: ComponentAsset) => Promise<void>;
  onAttach: (asset: ComponentAsset, actor: Actor) => Promise<void>;
  selectedActor: Actor | null;
  openDesigner: (asset: ComponentAsset, apply: (metadata: MeshComponentAssetPayload["metadata"]) => void) => void;
}) => {
  const [workingAsset, setWorkingAsset] = useState<ComponentAsset | null>(assets[0] ?? null);
  const [hasLocalChanges, setHasLocalChanges] = useState(false);
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const isStored = workingAsset ? assetsById.has(workingAsset.id) : false;

  useEffect(() => {
    if (!workingAsset) {
      if (assets.length > 0) {
        const next = assets[0];
        setHasLocalChanges(false);
        setWorkingAsset(next);
      }
      return;
    }

    const canonical = assetsById.get(workingAsset.id);
    if (canonical) {
      if (!hasLocalChanges && canonical !== workingAsset) {
        setHasLocalChanges(false);
        setWorkingAsset(canonical);
      }
      return;
    }

    if (!hasLocalChanges) {
      if (assets.length === 0) {
        if (workingAsset !== null) {
          setHasLocalChanges(false);
          setWorkingAsset(null);
        }
        return;
      }
      const fallback = assets[0];
      if (fallback !== workingAsset) {
        setHasLocalChanges(false);
        setWorkingAsset(fallback);
      }
    }
  }, [assets, assetsById, hasLocalChanges, workingAsset]);

  const handleSelectAsset = useCallback((asset: ComponentAsset) => {
    setWorkingAsset(normalizeMeshAsset(asset));
    setHasLocalChanges(false);
  }, []);

  const handleCreate = useCallback(() => {
    const asset = createEmptyMeshAsset();
    setWorkingAsset(asset);
    setHasLocalChanges(true);
  }, []);

  const handleChange = useCallback((asset: ComponentAsset) => {
    setWorkingAsset(normalizeMeshAsset(asset));
    setHasLocalChanges(true);
  }, []);

  const handleOpenDesigner = useCallback(() => {
    if (!workingAsset) {
      return;
    }
    const activeAsset = workingAsset;
    openDesigner(activeAsset, (metadata) => {
      setWorkingAsset((current) => {
        if (!current || current.id !== activeAsset.id) {
          return current;
        }
        const payload = (current.payload as MeshComponentAssetPayload) ?? {
          meshId: "",
          materialId: "",
          metadata: serializeMeshMetadata(DEFAULT_MESH_METADATA),
        };
        return {
          ...current,
          payload: {
            ...payload,
            metadata,
          },
        };
      });
      setHasLocalChanges(true);
    });
  }, [openDesigner, workingAsset]);

  const handleAttach = useCallback(async () => {
    if (!workingAsset || !selectedActor) {
      return;
    }
    await onAttach(workingAsset, selectedActor);
  }, [onAttach, selectedActor, workingAsset]);

  const handleSaveAsset = useCallback(
    async (asset: ComponentAsset) => {
      await onSave(asset);
      setHasLocalChanges(false);
    },
    [onSave]
  );

  const handleDeleteAsset = useCallback(
    async (asset: ComponentAsset) => {
      await onDelete(asset);
      setHasLocalChanges(false);
    },
    [onDelete]
  );

  return (
    <div className="space-y-3 text-xs text-white/90">
      <MeshComponentList assets={assets} selected={workingAsset} onSelect={handleSelectAsset} onCreate={handleCreate} />
      <MeshAssetForm
        asset={workingAsset}
        onChange={handleChange}
        onSave={handleSaveAsset}
        onDelete={workingAsset && isStored ? handleDeleteAsset : undefined}
        onOpenDesigner={workingAsset ? handleOpenDesigner : undefined}
      />
      <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
        <div className="flex items-center justify-between">
          <span>
            Selected Actor:
            <strong className="ml-1 text-white">
              {selectedActor ? (selectedActor as any).name ?? selectedActor.constructor.name : "None"}
            </strong>
          </span>
          <button
            type="button"
            className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10 disabled:opacity-40"
            disabled={!selectedActor || !workingAsset}
            onClick={handleAttach}
          >
            Attach Component
          </button>
        </div>
        <p className="mt-2 text-[11px] text-white/50">
          Attaching will create a MeshComponent on the actor using the selected mesh and material identifiers.
        </p>
      </div>
    </div>
  );
};

const meshComponentDesignerPlugin: EditorUIPlugin = {
  id: "builtin.mesh-component-designer",
  activate: ({ panels, editor, componentAssets, componentAssembler, modals }) => {
    if (!componentAssets) {
      console.warn("Mesh component designer plugin requires component asset storage services.");
      return () => {};
    }

    if (!modals) {
      console.warn("Mesh component designer plugin requires modal services.");
      return () => {};
    }

    const assetsRef = { current: componentAssets.getAssets().map(normalizeMeshAsset) };
    const listeners = new Set<() => void>();

    const registerListener = (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };

    const notify = () => {
      listeners.forEach((listener) => listener());
    };

    const saveAsset = async (asset: ComponentAsset) => {
      const normalized = normalizeMeshAsset(asset);
      await componentAssets.saveAsset(normalized);
      assetsRef.current = componentAssets.getAssets().map(normalizeMeshAsset);
      notify();
    };

    const deleteAsset = async (asset: ComponentAsset) => {
      await componentAssets.deleteAsset(asset.id);
      assetsRef.current = componentAssets.getAssets().map(normalizeMeshAsset);
      notify();
    };

    const unregisterPanel = panels.register({
      id: "builtin.mesh-designer.panel",
      title: "Meshes",
      location: "right",
      order: 70,
      render: () => {
        const [revision, setRevision] = useState(0);
        useEffect(() => {
            registerListener(() => setRevision((value) => value + 1)), []});

        const assets = useMemo(() => assetsRef.current, [revision]);
        const selectedActor = editor.getSelectedActors()[0] ?? null;
        const assembler = componentAssembler;

        const handleSave = useCallback(
          async (asset: ComponentAsset) => {
            await saveAsset(asset);
          },
          []
        );

        const handleDelete = useCallback(
          async (asset: ComponentAsset) => {
            await deleteAsset(asset);
          },
          []
        );

        const handleAttach = useCallback(
          async (asset: ComponentAsset, actor: Actor) => {
            if (assembler) {
              await assembler.attachComponentToActor(actor, asset);
            } else {
              console.warn("No component assembler service detected. Prototype only.");
            }
          },
          [assembler]
        );

        const handleOpenDesignerModal = useCallback(
          (asset: ComponentAsset, apply: (metadata: MeshComponentAssetPayload["metadata"]) => void) => {
            const sanitized = normalizeMeshAsset(asset);
            modals.open((api) => (
              <MeshDesignerModal
                asset={sanitized}
                onClose={api.close}
                onApply={(metadata) => {
                  apply(metadata);
                  const exists = assetsRef.current.some((entry) => entry.id === sanitized.id);
                  if (exists) {
                    assetsRef.current = assetsRef.current.map((entry) =>
                      entry.id === sanitized.id
                        ? normalizeMeshAsset({
                            ...entry,
                            payload: {
                              ...(entry.payload as MeshComponentAssetPayload),
                              metadata,
                            },
                          })
                        : entry
                    );
                    notify();
                  }
                  api.close();
                }}
              />
            ));
          },
          [modals, notify]
        );

        return (
          <MeshComponentDesignerPanel
            assets={assets}
            onSave={handleSave}
            onDelete={handleDelete}
            onAttach={handleAttach}
            selectedActor={selectedActor}
            openDesigner={handleOpenDesignerModal}
          />
        );
      },
    });

    return () => {
      unregisterPanel();
    };
  },
};

export default meshComponentDesignerPlugin;