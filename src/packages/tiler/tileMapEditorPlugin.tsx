import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { MeshComponent, type EditorUIPlugin } from "@repo/engine";
import { GameTileMapActor } from "@repo/example";

import {
  TileMapMaterial,
  type TiledMap,
  type TiledTileLayer,
  type TiledObject,
  type TiledPoint,
  type TiledTilesetReference,
  TiledObjectLayer,
} from "@repo/tiler";

const loadImage = (source: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${source}`));
    image.src = source;
  });

const FLIP_HORIZONTAL = 0x80000000;
const FLIP_VERTICAL = 0x40000000;
const FLIP_DIAGONAL = 0x20000000;

const decodeGid = (value: number) => ({
  gid: value & ~(FLIP_HORIZONTAL | FLIP_VERTICAL | FLIP_DIAGONAL),
  flipH: (value & FLIP_HORIZONTAL) !== 0,
  flipV: (value & FLIP_VERTICAL) !== 0,
  flipDiag: (value & FLIP_DIAGONAL) !== 0,
});

const resolveTileset = (
  tilesets: TiledTilesetReference[],
  gid: number
): { tileset: TiledTilesetReference; localId: number } | null => {
  let candidate: TiledTilesetReference | null = null;
  for (const tileset of tilesets) {
    if (gid >= tileset.firstGid) {
      if (!candidate || tileset.firstGid > candidate.firstGid) {
        candidate = tileset;
      }
    }
  }
  if (!candidate) {
    return null;
  }
  const localId = gid - candidate.firstGid;
  if (localId < 0 || localId >= candidate.tileCount) {
    return null;
  }
  return { tileset: candidate, localId };
};

type Vec2 = { x: number; y: number };

const distanceToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const vx = bx - ax;
  const vy = by - ay;
  const lengthSquared = vx * vx + vy * vy;
  if (lengthSquared === 0) {
    const dx = px - ax;
    const dy = py - ay;
    return Math.sqrt(dx * dx + dy * dy);
  }
  let t = ((px - ax) * vx + (py - ay) * vy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  const closestX = ax + t * vx;
  const closestY = ay + t * vy;
  const dx = px - closestX;
  const dy = py - closestY;
  return Math.sqrt(dx * dx + dy * dy);
};

const pointInPolygon = (polygon: Vec2[], pointX: number, pointY: number) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i]?.x ?? 0;
    const yi = polygon[i]?.y ?? 0;
    const xj = polygon[j]?.x ?? 0;
    const yj = polygon[j]?.y ?? 0;
    const intersect = yi > pointY !== yj > pointY && pointX < ((xj - xi) * (pointY - yi)) / ((yj - yi) || 1e-9) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
};

const pointDistanceToPolygon = (polygon: Vec2[], pointX: number, pointY: number) => {
  if (polygon.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  let minDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    minDistance = Math.min(minDistance, distanceToSegment(pointX, pointY, current.x, current.y, next.x, next.y));
  }
  return minDistance;
};

type SelectedTile = {
  gid: number;
  tileset: TiledTilesetReference;
  localId: number;
};

type TileMapEditorModalProps = {
  actor: GameTileMapActor | null;
  onClose: () => void;
};

const TileMapEditorModal = ({ actor, onClose }: TileMapEditorModalProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapState, setMapState] = useState<{
    map: TiledMap;
    layerIndex: number;
  } | null>(null);
  const [tilesetImages, setTilesetImages] = useState<Record<number, HTMLImageElement>>({});
  const [selectedTile, setSelectedTile] = useState<SelectedTile | null>(null);
  const [isPainting, setIsPainting] = useState(false);
  const [mapScale, setMapScale] = useState(1);
  const [paletteScale, setPaletteScale] = useState(1);
  const [mapPanState, setMapPanState] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState<"tiles" | "objects">("tiles");
  const [objectLayerIndex, setObjectLayerIndex] = useState(0);
  const [selectedObject, setSelectedObject] = useState<{ layerIndex: number; objectIndex: number } | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const activePaintTileRef = useRef<SelectedTile | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeMapRef = useRef<TiledMap | null>(null);
  const mapScaleInitializedRef = useRef(false); // Prevent resetting user-controlled zoom after initialization.
  const mapPanRef = useRef({ x: 0, y: 0 });
  const panPointerIdRef = useRef<number | null>(null);
  const lastPanPositionRef = useRef<{ x: number; y: number } | null>(null);
  const polygonPointerIdRef = useRef<number | null>(null);
  const polygonVertexDragRef = useRef<{ layerIndex: number; objectIndex: number; vertexIndex: number } | null>(null);

  const mapPan = mapPanState;
  const setMapPan = useCallback((nextPan: { x: number; y: number }) => {
    const normalized = { x: nextPan.x, y: nextPan.y };
    mapPanRef.current = normalized;
    setMapPanState(normalized);
  }, []);
  const shiftMapPan = useCallback(
    (deltaX: number, deltaY: number) => {
      setMapPan({
        x: mapPanRef.current.x + deltaX,
        y: mapPanRef.current.y + deltaY,
      });
    },
    [setMapPan]
  );

  const tileWidth = mapState?.map.tileWidth ?? 0;
  const tileHeight = mapState?.map.tileHeight ?? 0;
  const mapPixelWidth = (mapState?.map.width ?? 0) * tileWidth;
  const mapPixelHeight = (mapState?.map.height ?? 0) * tileHeight;
  const hasObjectLayers = (mapState?.map.objectLayers.length ?? 0) > 0;

  const recommendedMapScale = useMemo(() => {
    if (mapPixelWidth <= 0 || mapPixelHeight <= 0) {
      return 1;
    }
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : mapPixelWidth;
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : mapPixelHeight;
    const maxWidthScale = mapPixelWidth === 0 ? 1 : (viewportWidth * 0.7) / mapPixelWidth;
    const maxHeightScale = mapPixelHeight === 0 ? 1 : (viewportHeight * 0.8) / mapPixelHeight;
    const targetScale = Math.min(maxWidthScale, maxHeightScale);
    const clamped = Math.min(1.35, Math.max(0.35, targetScale));
    return Number.isFinite(clamped) && clamped > 0 ? clamped : 1;
  }, [mapPixelHeight, mapPixelWidth]);

  useEffect(() => {
    if (!actor) {
      setLoading(false);
      setError("Select a GameTileMapActor to edit its tiles.");
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        await actor.onLoad();
        const map = actor.getMap();
        if (!map) {
          throw new Error("Tile map data is not available.");
        }
        runtimeMapRef.current = map;
        const draft: TiledMap = {
          ...map,
          tileLayers: map.tileLayers.map((layer) => ({
            ...layer,
            data: [...layer.data],
          })),
          tilesets: map.tilesets.map((tileset) => ({
            ...tileset,
            image: tileset.image ? { ...tileset.image } : undefined,
          })),
          objectLayers: map.objectLayers.map((layer) => ({
            ...layer,
            objects: [...layer.objects],
            properties: { ...layer.properties },
          })),
          properties: { ...map.properties },
        };
        if (!cancelled) {
          mapScaleInitializedRef.current = false;
          setMapScale(1);
          setPaletteScale(1);
          setSelectedTile(null);
          setMapPan({ x: 0, y: 0 });
          setActiveTab("tiles");
          setObjectLayerIndex(0);
          setSelectedObject(null);
          setMapState({ map: draft, layerIndex: 0 });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [actor, setMapPan]);

  useEffect(() => {
    const map = mapState?.map;
    if (!actor || !map) {
      return;
    }

    let cancelled = false;

    const loadTilesets = async () => {
      const images: Record<number, HTMLImageElement> = {};
      for (const tileset of map.tilesets) {
        if (!tileset.image || !tileset.image.source) {
          continue;
        }
        try {
          const url = actor.resolveResourcePath(tileset.image.source);
          const image = await loadImage(url);
          if (!cancelled) {
            images[tileset.firstGid] = image;
          }
        } catch (err) {
          console.warn("Failed to load tileset image", tileset.image.source, err);
        }
      }
      if (!cancelled) {
        setTilesetImages(images);
      }
    };

    loadTilesets();

    return () => {
      cancelled = true;
    };
  }, [actor, mapState?.map]);

  useEffect(() => {
    if (!mapState) {
      return;
    }
    if (mapScaleInitializedRef.current) {
      return;
    }
    mapScaleInitializedRef.current = true;
    setMapScale(recommendedMapScale);
  }, [mapState, recommendedMapScale]);

  useEffect(() => {
    if (!mapState) {
      return;
    }
    const totalObjectLayers = mapState.map.objectLayers.length;
    if (totalObjectLayers === 0) {
      if (selectedObject) {
        setSelectedObject(null);
      }
      return;
    }
    if (objectLayerIndex >= totalObjectLayers) {
      setObjectLayerIndex(totalObjectLayers - 1);
    }
  }, [mapState, objectLayerIndex, selectedObject]);

  useEffect(() => {
    if (activeTab === "tiles") {
      return;
    }
    if (activePointerIdRef.current !== null) {
      canvasRef.current?.releasePointerCapture(activePointerIdRef.current);
      activePointerIdRef.current = null;
    }
    if (isPainting) {
      activePaintTileRef.current = null;
      setIsPainting(false);
    }
  }, [activeTab, isPainting]);

  useEffect(() => {
    if (activeTab === "objects") {
      return;
    }
    if (polygonPointerIdRef.current !== null) {
      canvasRef.current?.releasePointerCapture(polygonPointerIdRef.current);
      polygonPointerIdRef.current = null;
      polygonVertexDragRef.current = null;
    }
  }, [activeTab]);

  const invalidateMaterialCache = useCallback(() => {
    if (!actor) {
      return;
    }
    const components = actor.getComponentsOfType(MeshComponent);
    for (const component of components) {
      const material = component.getMaterial();
      if (material && material instanceof TileMapMaterial) {
        try {
          (material as any).caches?.delete?.(actor);
        } catch (err) {
          console.warn("Failed to invalidate tile map cache", err);
        }
      }
    }
  }, [actor]);

  const drawMap = useCallback(() => {
    const map = mapState?.map;
    if (!map) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    if (displayWidth === 0 || displayHeight === 0) {
      return;
    }
    const devicePixelRatio = typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1;
    canvas.width = Math.max(1, Math.floor(displayWidth * devicePixelRatio));
    canvas.height = Math.max(1, Math.floor(displayHeight * devicePixelRatio));

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.scale(devicePixelRatio, devicePixelRatio);
    context.fillStyle = "#0f172a";
    context.fillRect(0, 0, displayWidth, displayHeight);

    context.save();
    context.translate(mapPan.x, mapPan.y);
    context.scale(mapScale, mapScale);
    context.imageSmoothingEnabled = false;

    map.tileLayers.forEach((layer, index) => {
      if (!layer.visible) {
        return;
      }
      const opacity = index === mapState.layerIndex ? 1 : 0.45;
      context.globalAlpha = opacity;
      const data = layer.data;
      for (let ty = 0; ty < layer.height; ty++) {
        for (let tx = 0; tx < layer.width; tx++) {
          const tileIndex = ty * layer.width + tx;
          const rawGid = data[tileIndex] ?? 0;
          if (!rawGid) {
            continue;
          }
          const decoded = decodeGid(rawGid);
          if (decoded.flipDiag) {
            continue;
          }
          const match = resolveTileset(map.tilesets, decoded.gid);
          if (!match) {
            continue;
          }
          const image = tilesetImages[match.tileset.firstGid];
          if (!image) {
            continue;
          }
          const columns = match.tileset.columns || Math.floor((match.tileset.image?.width ?? 0) / match.tileset.tileWidth);
          if (!columns) {
            continue;
          }
          const sx = (match.localId % columns) * match.tileset.tileWidth;
          const sy = Math.floor(match.localId / columns) * match.tileset.tileHeight;
          const dx = tx * map.tileWidth;
          const dy = ty * map.tileHeight;
          context.save();
          if (decoded.flipH || decoded.flipV) {
            context.translate(dx + map.tileWidth / 2, dy + map.tileHeight / 2);
            context.scale(decoded.flipH ? -1 : 1, decoded.flipV ? -1 : 1);
            context.drawImage(
              image,
              sx,
              sy,
              match.tileset.tileWidth,
              match.tileset.tileHeight,
              -map.tileWidth / 2,
              -map.tileHeight / 2,
              map.tileWidth,
              map.tileHeight
            );
          } else {
            context.drawImage(
              image,
              sx,
              sy,
              match.tileset.tileWidth,
              match.tileset.tileHeight,
              dx,
              dy,
              map.tileWidth,
              map.tileHeight
            );
          }
          context.restore();
        }
      }
    });

    context.globalAlpha = 1;
    context.strokeStyle = "rgba(148, 163, 184, 0.18)";
    context.lineWidth = 1 / Math.max(mapScale, 0.0001);
    for (let x = 0; x <= map.width; x++) {
      context.beginPath();
      context.moveTo(x * map.tileWidth, 0);
      context.lineTo(x * map.tileWidth, map.height * map.tileHeight);
      context.stroke();
    }
    for (let y = 0; y <= map.height; y++) {
      context.beginPath();
      context.moveTo(0, y * map.tileHeight);
      context.lineTo(map.width * map.tileWidth, y * map.tileHeight);
      context.stroke();
    }

    if (activeTab === "objects") {
      const selectedStroke = "rgba(56, 189, 248, 0.9)";
      const selectedFill = "rgba(56, 189, 248, 0.18)";
      const inactiveStroke = "rgba(148, 163, 184, 0.55)";
      const activeStroke = "rgba(56, 189, 248, 0.6)";
      const inverseScale = 1 / Math.max(mapScale, 0.0001);
      const pointRadius = Math.max(6 * inverseScale, 4);
      context.font = `${12 * inverseScale}px "JetBrains Mono", monospace`;
      context.textBaseline = "top";
      context.imageSmoothingEnabled = false;

      map.objectLayers.forEach((layer, layerIdx) => {
        if (!layer.visible) {
          return;
        }
        const isActiveLayer = layerIdx === objectLayerIndex;
        const layerStroke = isActiveLayer ? activeStroke : inactiveStroke;
        const layerAlpha = isActiveLayer ? 1 : 0.35;
        context.globalAlpha = layerAlpha;

        layer.objects.forEach((object, objectIndex) => {
          const isSelected = selectedObject?.layerIndex === layerIdx && selectedObject?.objectIndex === objectIndex;
          const x = object.x;
          const y = object.y;
          const width = object.width ?? 0;
          const height = object.height ?? 0;
          const stroke = isSelected ? selectedStroke : layerStroke;
          const polygonPoints = Array.isArray(object.polygon) ? object.polygon : null;

          if (polygonPoints && polygonPoints.length >= 3) {
            const worldPoints = polygonPoints.map((point) => ({ x: x + point.x, y: y + point.y }));
            context.strokeStyle = stroke;
            context.beginPath();
            context.moveTo(worldPoints[0]?.x ?? x, worldPoints[0]?.y ?? y);
            for (let i = 1; i < worldPoints.length; i += 1) {
              context.lineTo(worldPoints[i].x, worldPoints[i].y);
            }
            context.closePath();
            context.stroke();
            if (isSelected) {
              context.fillStyle = selectedFill;
              context.fill();
            }

            if (isSelected) {
              const handleSize = Math.max(6 * inverseScale, 4);
              const halfHandle = handleSize / 2;
              context.fillStyle = selectedStroke;
              worldPoints.forEach((point) => {
                context.fillRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
              });
            }

            if (object.name) {
              context.fillStyle = stroke;
              const labelPadding = 2 * inverseScale;
              context.fillText(object.name, worldPoints[0].x + labelPadding, worldPoints[0].y + labelPadding);
            }
            return;
          }

          if (width === 0 && height === 0) {
            context.strokeStyle = stroke;
            context.beginPath();
            context.arc(x, y, pointRadius, 0, Math.PI * 2);
            context.stroke();
            if (isSelected) {
              context.beginPath();
              context.arc(x, y, pointRadius * 0.6, 0, Math.PI * 2);
              context.fillStyle = selectedFill;
              context.fill();
            }
            return;
          }

          context.strokeStyle = stroke;
          context.strokeRect(x, y, width, height);
          if (isSelected) {
            context.fillStyle = selectedFill;
            context.fillRect(x, y, width, height);
          }

          if (object.name) {
            context.fillStyle = stroke;
            const labelPadding = 2 * inverseScale;
            context.fillText(object.name, x + labelPadding, y + labelPadding);
          }
        });
      });

      context.globalAlpha = 1;
    }
    context.restore();
    context.restore();
  }, [activeTab, mapPan, mapScale, mapState, objectLayerIndex, selectedObject, tilesetImages]);

  useEffect(() => {
    drawMap();
  }, [drawMap]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleResize = () => {
      drawMap();
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [drawMap]);

  const updateTile = useCallback(
    (tileX: number, tileY: number, tile: SelectedTile | null) => {
      setMapState((current) => {
        if (!current) {
          return current;
        }
        const layer = current.map.tileLayers[current.layerIndex];
        if (!layer) {
          return current;
        }
        if (tileX < 0 || tileY < 0 || tileX >= layer.width || tileY >= layer.height) {
          return current;
        }
        const index = tileY * layer.width + tileX;
        const nextGid = tile ? tile.gid : 0;
        if (layer.data[index] === nextGid) {
          return current;
        }
        const nextLayer: TiledTileLayer = {
          ...layer,
          data: layer.data.map((value, valueIndex) => (valueIndex === index ? nextGid : value)),
        };
        const nextMap: TiledMap = {
          ...current.map,
          tileLayers: current.map.tileLayers.map((entry, entryIndex) => (entryIndex === current.layerIndex ? nextLayer : entry)),
        };

        const runtimeMap = runtimeMapRef.current;
        if (actor && runtimeMap) {
          const runtimeLayer = runtimeMap.tileLayers[current.layerIndex];
          if (runtimeLayer) {
            runtimeLayer.data = nextLayer.data.slice();
          }
          invalidateMaterialCache();
        }

        return {
          map: nextMap,
          layerIndex: current.layerIndex,
        };
      });
    },
    [actor, invalidateMaterialCache]
  );

  const updateObjectAt = useCallback(
    (
      layerIndex: number,
      objectIndex: number,
      updater: (object: TiledObject) => TiledObject
    ) => {
      setMapState((current) => {
        if (!current) {
          return current;
        }
        const layer = current.map.objectLayers[layerIndex];
        if (!layer) {
          return current;
        }
        const target = layer.objects[objectIndex];
        if (!target) {
          return current;
        }
        const nextObject = updater(target);
        if (!nextObject || nextObject === target) {
          return current;
        }
        const nextLayer: TiledObjectLayer = {
          ...layer,
          objects: layer.objects.map((object, index) => (index === objectIndex ? nextObject : object)),
        };
        const nextMap: TiledMap = {
          ...current.map,
          objectLayers: current.map.objectLayers.map((entry, index) => (index === layerIndex ? nextLayer : entry)),
        };

        const runtimeMap = runtimeMapRef.current;
        if (runtimeMap) {
          const runtimeLayer = runtimeMap.objectLayers[layerIndex];
          if (runtimeLayer) {
            runtimeMap.objectLayers[layerIndex] = {
              ...runtimeLayer,
              objects: nextLayer.objects.map((object) => ({ ...object })),
            };
          }
        }
        invalidateMaterialCache();

        return {
          map: nextMap,
          layerIndex: current.layerIndex,
        };
      });
    },
    [invalidateMaterialCache]
  );

  const updateSelectedObject = useCallback(
    (updater: (object: TiledObject) => TiledObject) => {
      if (!selectedObject) {
        return;
      }
      updateObjectAt(selectedObject.layerIndex, selectedObject.objectIndex, updater);
    },
    [selectedObject, updateObjectAt]
  );

  const canvasToTile = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = event.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const cssX = event.clientX - rect.left;
      const cssY = event.clientY - rect.top;
      if (tileWidth <= 0 || tileHeight <= 0) {
        return { x: -1, y: -1, cssX, cssY, worldX: Number.NaN, worldY: Number.NaN };
      }
      const worldX = (cssX - mapPan.x) / mapScale;
      const worldY = (cssY - mapPan.y) / mapScale;
      const x = Math.floor(worldX / tileWidth);
      const y = Math.floor(worldY / tileHeight);
      return { x, y, cssX, cssY, worldX, worldY };
    },
    [mapPan, mapScale, tileHeight, tileWidth]
  );

  const findObjectAt = useCallback(
    (worldX: number, worldY: number) => {
      if (!mapState || Number.isNaN(worldX) || Number.isNaN(worldY)) {
        return null;
      }
      const layers = mapState.map.objectLayers;
      for (let layerIdx = layers.length - 1; layerIdx >= 0; layerIdx -= 1) {
        const layer = layers[layerIdx];
        if (!layer.visible) {
          continue;
        }
        for (let objectIndex = layer.objects.length - 1; objectIndex >= 0; objectIndex -= 1) {
          const object = layer.objects[objectIndex];
          const polygon = object.polygon;
          if (Array.isArray(polygon) && polygon.length >= 3) {
            const worldPoints = polygon.map((point) => ({ x: object.x + point.x, y: object.y + point.y }));
            const inside = pointInPolygon(worldPoints, worldX, worldY);
            const edgeDistance = pointDistanceToPolygon(worldPoints, worldX, worldY);
            if (inside || edgeDistance <= 6) {
              return { layerIndex: layerIdx, objectIndex, object };
            }
            continue;
          }
          const width = object.width ?? 0;
          const height = object.height ?? 0;
          const minX = object.x;
          const minY = object.y;
          const maxX = minX + width;
          const maxY = minY + height;
          const withinRect = width > 0 && height > 0 && worldX >= minX && worldX <= maxX && worldY >= minY && worldY <= maxY;
          const withinPoint = width === 0 && height === 0 && Math.abs(worldX - minX) <= 6 && Math.abs(worldY - minY) <= 6;
          if (withinRect || withinPoint) {
            return { layerIndex: layerIdx, objectIndex, object };
          }
        }
      }
      return null;
    },
    [mapState]
  );

  const selectedObjectDetails = useMemo(() => {
    if (!mapState || !selectedObject) {
      return null;
    }
    const layer = mapState.map.objectLayers[selectedObject.layerIndex];
    if (!layer) {
      return null;
    }
    const object = layer.objects[selectedObject.objectIndex];
    if (!object) {
      return null;
    }
    return {
      layer,
      object,
      layerIndex: selectedObject.layerIndex,
      objectIndex: selectedObject.objectIndex,
    };
  }, [mapState, selectedObject]);

  const findSelectedPolygonVertexAt = useCallback(
    (worldX: number, worldY: number) => {
      if (!selectedObjectDetails) {
        return null;
      }
      const { object, layerIndex, objectIndex } = selectedObjectDetails;
      const polygon = object.polygon;
      if (!Array.isArray(polygon) || polygon.length === 0) {
        return null;
      }
      const inverseScale = 1 / Math.max(mapScale, 0.0001);
      const handleSize = Math.max(6 * inverseScale, 4);
      const halfHandle = handleSize / 2 + handleSize * 0.35;
      for (let i = 0; i < polygon.length; i += 1) {
        const point = polygon[i];
        if (!point) {
          continue;
        }
        const worldPointX = object.x + point.x;
        const worldPointY = object.y + point.y;
        if (Math.abs(worldX - worldPointX) <= halfHandle && Math.abs(worldY - worldPointY) <= halfHandle) {
          return { layerIndex, objectIndex, vertexIndex: i };
        }
      }
      return null;
    },
    [mapScale, selectedObjectDetails]
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const isPanGesture = event.button === 1 || (event.button === 0 && event.altKey);
      if (isPanGesture) {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        panPointerIdRef.current = event.pointerId;
        const { cssX, cssY } = canvasToTile(event);
        lastPanPositionRef.current = { x: cssX, y: cssY };
        return;
      }

      if (activeTab === "objects") {
        if (event.button !== 0) {
          return;
        }
        event.preventDefault();
        const { worldX, worldY } = canvasToTile(event);
        const vertexHit = findSelectedPolygonVertexAt(worldX, worldY);
        if (vertexHit) {
          event.currentTarget.setPointerCapture(event.pointerId);
          polygonPointerIdRef.current = event.pointerId;
          polygonVertexDragRef.current = vertexHit;
          setSelectedObject({ layerIndex: vertexHit.layerIndex, objectIndex: vertexHit.objectIndex });
          return;
        }
        const hit = findObjectAt(worldX, worldY);
        if (hit) {
          setObjectLayerIndex(hit.layerIndex);
          setSelectedObject({ layerIndex: hit.layerIndex, objectIndex: hit.objectIndex });
        } else {
          setSelectedObject(null);
        }
        return;
      }

      if (event.button !== 0 && event.button !== 2) {
        return;
      }
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      activePointerIdRef.current = event.pointerId;
      setIsPainting(true);
      activePaintTileRef.current = event.button === 2 ? null : selectedTile;
      const tile = canvasToTile(event);
      updateTile(tile.x, tile.y, activePaintTileRef.current);
    },
    [activeTab, canvasToTile, findObjectAt, findSelectedPolygonVertexAt, selectedTile, setObjectLayerIndex, setSelectedObject, updateTile]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (panPointerIdRef.current === event.pointerId) {
        const last = lastPanPositionRef.current;
        const { cssX, cssY } = canvasToTile(event);
        if (last) {
          shiftMapPan(cssX - last.x, cssY - last.y);
        }
        lastPanPositionRef.current = { x: cssX, y: cssY };
        return;
      }
      if (polygonPointerIdRef.current === event.pointerId) {
        const dragState = polygonVertexDragRef.current;
        if (!dragState) {
          return;
        }
        event.preventDefault();
        const { worldX, worldY } = canvasToTile(event);
        if (Number.isNaN(worldX) || Number.isNaN(worldY)) {
          return;
        }
        updateObjectAt(dragState.layerIndex, dragState.objectIndex, (current) => {
          const polygon = Array.isArray(current.polygon) ? current.polygon.slice() : [];
          if (!polygon[dragState.vertexIndex]) {
            return current;
          }
          const originX = current.x ?? 0;
          const originY = current.y ?? 0;
          const nextPoint = {
            x: worldX - originX,
            y: worldY - originY,
          };
          const existing = polygon[dragState.vertexIndex];
          if (existing && existing.x === nextPoint.x && existing.y === nextPoint.y) {
            return current;
          }
          polygon[dragState.vertexIndex] = nextPoint;
          return {
            ...current,
            polygon,
          };
        });
        return;
      }
      if (!isPainting || activePointerIdRef.current !== event.pointerId) {
        return;
      }
      const tile = canvasToTile(event);
      updateTile(tile.x, tile.y, activePaintTileRef.current);
    },
    [canvasToTile, isPainting, shiftMapPan, updateObjectAt, updateTile]
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (panPointerIdRef.current === event.pointerId) {
        event.currentTarget.releasePointerCapture(event.pointerId);
        panPointerIdRef.current = null;
        lastPanPositionRef.current = null;
        return;
      }
      if (polygonPointerIdRef.current === event.pointerId) {
        event.currentTarget.releasePointerCapture(event.pointerId);
        polygonPointerIdRef.current = null;
        polygonVertexDragRef.current = null;
        return;
      }
      if (activePointerIdRef.current === event.pointerId) {
        event.currentTarget.releasePointerCapture(event.pointerId);
        activePointerIdRef.current = null;
        activePaintTileRef.current = null;
        setIsPainting(false);
      }
    },
    []
  );

  const paletteEntries = useMemo(() => {
    if (!mapState) {
      return [];
    }
    return mapState.map.tilesets.map((tileset) => ({
      tileset,
      image: tilesetImages[tileset.firstGid] ?? null,
    }));
  }, [mapState, tilesetImages]);

  const addObjectProperty = useCallback(() => {
    if (!selectedObjectDetails) {
      return;
    }
    const existing = selectedObjectDetails.object.properties ?? {};
    const baseKey = "property";
    let candidate = baseKey;
    let suffix = 1;
    while (Object.prototype.hasOwnProperty.call(existing, candidate)) {
      candidate = `${baseKey}_${suffix}`;
      suffix += 1;
    }
    updateSelectedObject((object) => ({
      ...object,
      properties: {
        ...(object.properties ?? {}),
        [candidate]: "",
      },
    }));
  }, [selectedObjectDetails, updateSelectedObject]);

  const removeObjectProperty = useCallback(
    (key: string) => {
      if (!selectedObjectDetails) {
        return;
      }
      updateSelectedObject((object) => {
        const properties = { ...(object.properties ?? {}) };
        delete properties[key];
        return {
          ...object,
          properties,
        };
      });
    },
    [selectedObjectDetails, updateSelectedObject]
  );

  const handleSelectTile = useCallback(
    (tileset: TiledTilesetReference, localId: number, event: ReactMouseEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      const gid = tileset.firstGid + localId;
      setSelectedTile({ gid, tileset, localId });
    },
    []
  );

  const renderTilePalette = () => (
    <div className="flex-1 space-y-3 overflow-hidden p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-wide text-white/60">Tilesets</h3>
        <button
          type="button"
          className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
          onClick={() => setSelectedTile(null)}
        >
          Eraser
        </button>
      </div>
      <div className="rounded border border-white/10 bg-white/5 p-2 text-[11px] text-white/70">
        <div className="flex items-center justify-between">
          <span>Tileset scale</span>
          <span>{Math.round(paletteScale * 100)}%</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="range"
            min={0.5}
            max={3}
            step={0.1}
            value={paletteScale}
            onChange={(event) => {
              const parsed = Number.parseFloat(event.target.value);
              if (Number.isNaN(parsed)) {
                return;
              }
              setPaletteScale(Math.min(3, Math.max(0.5, parsed)));
            }}
            className="h-1 w-full cursor-pointer"
          />
          <button
            type="button"
            className="whitespace-nowrap rounded border border-white/20 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
            onClick={() => setPaletteScale(1)}
          >
            Reset
          </button>
        </div>
      </div>
      <div className="space-y-3 h-full overflow-auto pr-1">
        {paletteEntries.map(({ tileset, image }) => {
          if (!image || !tileset.image) {
            return (
              <div
                key={tileset.firstGid}
                className="rounded border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60"
              >
                Unable to load tileset {tileset.name}
              </div>
            );
          }

          const columns = tileset.columns || Math.floor(image.width / tileset.tileWidth) || 1;
          const rows = Math.max(1, Math.ceil(tileset.tileCount / columns));
          const baseCanvasWidth = columns * tileset.tileWidth;
          const baseCanvasHeight = rows * tileset.tileHeight;
          const scaledCanvasWidth = Math.max(1, Math.round(baseCanvasWidth * paletteScale));
          const scaledCanvasHeight = Math.max(1, Math.round(baseCanvasHeight * paletteScale));
          const scaledTileWidth = scaledCanvasWidth / columns;
          const scaledTileHeight = scaledCanvasHeight / rows;

          return (
            <div key={tileset.firstGid} className="space-y-2">
              <div className="text-xs text-white/70">{tileset.name}</div>
              <canvas
                key={`${tileset.firstGid}-${paletteScale}`}
                width={scaledCanvasWidth}
                height={scaledCanvasHeight}
                style={{
                  width: `${scaledCanvasWidth}px`,
                  height: `${scaledCanvasHeight}px`,
                  imageRendering: "pixelated" as const,
                }}
                ref={(element) => {
                  if (!element) {
                    return;
                  }
                  const context = element.getContext("2d");
                  if (!context) {
                    return;
                  }
                  context.clearRect(0, 0, scaledCanvasWidth, scaledCanvasHeight);
                  context.imageSmoothingEnabled = false;
                  context.drawImage(image, 0, 0, scaledCanvasWidth, scaledCanvasHeight);
                  context.strokeStyle = "rgba(148, 163, 184, 0.3)";
                  context.lineWidth = 1;
                  for (let x = 0; x <= columns; x++) {
                    context.beginPath();
                    context.moveTo(x * scaledTileWidth, 0);
                    context.lineTo(x * scaledTileWidth, scaledCanvasHeight);
                    context.stroke();
                  }
                  for (let y = 0; y <= rows; y++) {
                    context.beginPath();
                    context.moveTo(0, y * scaledTileHeight);
                    context.lineTo(scaledCanvasWidth, y * scaledTileHeight);
                    context.stroke();
                  }
                }}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const scaleX = event.currentTarget.width / rect.width;
                  const scaleY = event.currentTarget.height / rect.height;
                  const localX = Math.floor(((event.clientX - rect.left) * scaleX) / scaledTileWidth);
                  const localY = Math.floor(((event.clientY - rect.top) * scaleY) / scaledTileHeight);
                  if (localX < 0 || localY < 0) {
                    return;
                  }
                  const localId = localY * columns + localX;
                  if (localId >= tileset.tileCount) {
                    return;
                  }
                  handleSelectTile(tileset, localId, event);
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderObjectInspector = () => {
    if (!mapState) {
      return (
        <div className="flex h-full items-center justify-center px-4 text-xs text-white/60">
          Load a tile map to edit object layers.
        </div>
      );
    }

    if (mapState.map.objectLayers.length === 0) {
      return (
        <div className="flex h-full items-center justify-center px-4 text-xs text-white/60">
          This tile map does not define any object layers.
        </div>
      );
    }

    if (!selectedObjectDetails) {
      return (
        <div className="flex h-full items-center justify-center px-4 text-xs text-white/60">
          Select an object from the canvas to edit its properties.
        </div>
      );
    }

    const { object, layer } = selectedObjectDetails;
    const properties = object.properties ?? {};
    const polygonPoints = Array.isArray(object.polygon) ? object.polygon : [];

    const renderPropertyValueControl = (key: string, value: unknown) => {
      if (typeof value === "number") {
        return (
          <input
            type="number"
            className="w-full rounded border border-white/20 bg-slate-900 px-2 py-1 text-xs text-white"
            value={Number.isFinite(value) ? String(value) : ""}
            onChange={(event) => {
              const parsed = Number.parseFloat(event.target.value);
              updateSelectedObject((current) => ({
                ...current,
                properties: {
                  ...(current.properties ?? {}),
                  [key]: Number.isNaN(parsed) ? value : parsed,
                },
              }));
            }}
          />
        );
      }
      if (typeof value === "boolean") {
        return (
          <label className="inline-flex items-center gap-2 text-xs text-white/80">
            <input
              type="checkbox"
              checked={value}
              onChange={(event) => {
                updateSelectedObject((current) => ({
                  ...current,
                  properties: {
                    ...(current.properties ?? {}),
                    [key]: event.target.checked,
                  },
                }));
              }}
            />
            <span>Enabled</span>
          </label>
        );
      }
      return (
        <input
          type="text"
          className="w-full rounded border border-white/20 bg-slate-900 px-2 py-1 text-xs text-white"
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(event) => {
            updateSelectedObject((current) => ({
              ...current,
              properties: {
                ...(current.properties ?? {}),
                [key]: event.target.value,
              },
            }));
          }}
        />
      );
    };

    const handleRenameProperty = (key: string, nextKey: string) => {
      const trimmed = nextKey.trim();
      if (!trimmed || trimmed === key) {
        return;
      }
      if (Object.prototype.hasOwnProperty.call(properties, trimmed)) {
        return;
      }
      const value = properties[key];
      updateSelectedObject((current) => {
        const currentProperties = { ...(current.properties ?? {}) };
        delete currentProperties[key];
        currentProperties[trimmed] = value;
        return {
          ...current,
          properties: currentProperties,
        };
      });
    };

    const updatePolygonPoint = (index: number, axis: "x" | "y", nextValue: number) => {
      updateSelectedObject((current) => {
        const currentPolygon = Array.isArray(current.polygon) ? [...current.polygon] : [];
        if (!currentPolygon[index]) {
          return current;
        }
        currentPolygon[index] = {
          ...currentPolygon[index],
          [axis]: nextValue,
        } as TiledPoint;
        return {
          ...current,
          polygon: currentPolygon,
        };
      });
    };

    const addPolygonPoint = () => {
      const fallbackPoint: TiledPoint = { x: 0, y: 0 };
      const lastPoint = polygonPoints[polygonPoints.length - 1] ?? fallbackPoint;
      updateSelectedObject((current) => {
        const currentPolygon = Array.isArray(current.polygon) ? [...current.polygon] : [];
        return {
          ...current,
          polygon: [...currentPolygon, { x: lastPoint.x, y: lastPoint.y }],
        };
      });
    };

    const removePolygonPoint = (index: number) => {
      if (polygonPoints.length <= 3) {
        return;
      }
      updateSelectedObject((current) => {
        const currentPolygon = Array.isArray(current.polygon) ? current.polygon.slice() : [];
        if (currentPolygon.length <= 3) {
          return current;
        }
        const nextPolygon = currentPolygon.filter((_, polygonIndex) => polygonIndex !== index);
        return {
          ...current,
          polygon: nextPolygon,
        };
      });
    };

    return (
      <div className="flex h-full flex-col gap-4 overflow-auto p-4 text-xs text-white/80">
        <div>
          <h3 className="text-[11px] uppercase tracking-wide text-white/60">Selected Object</h3>
          <div className="mt-2 space-y-2 rounded border border-white/10 bg-white/5 p-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-white/50">Name</span>
              <input
                type="text"
                className="rounded border border-white/20 bg-slate-900 px-2 py-1 text-xs text-white"
                value={object.name ?? ""}
                onChange={(event) => {
                  const nextValue = event.target.value.trim();
                  updateSelectedObject((current) => ({
                    ...current,
                    name: nextValue.length > 0 ? nextValue : null,
                  }));
                }}
                placeholder="Unnamed"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-white/50">Type</span>
              <input
                type="text"
                className="rounded border border-white/20 bg-slate-900 px-2 py-1 text-xs text-white"
                value={object.type ?? ""}
                onChange={(event) => {
                  const nextValue = event.target.value.trim();
                  updateSelectedObject((current) => ({
                    ...current,
                    type: nextValue.length > 0 ? nextValue : null,
                  }));
                }}
                placeholder="Type"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "X", value: object.x, accessor: "x" as const },
                { label: "Y", value: object.y, accessor: "y" as const },
                { label: "Width", value: object.width, accessor: "width" as const },
                { label: "Height", value: object.height, accessor: "height" as const },
                { label: "Rotation", value: object.rotation, accessor: "rotation" as const },
              ].map(({ label, value, accessor }) => (
                <label key={accessor} className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-wide text-white/50">{label}</span>
                  <input
                    type="number"
                    className="rounded border border-white/20 bg-slate-900 px-2 py-1 text-xs text-white"
                    value={Number.isFinite(value) ? String(value) : ""}
                    onChange={(event) => {
                      const parsed = Number.parseFloat(event.target.value);
                      updateSelectedObject((current) => ({
                        ...current,
                        [accessor]: Number.isNaN(parsed) ? value ?? 0 : parsed,
                      }));
                    }}
                  />
                </label>
              ))}
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-white/80">
              <input
                type="checkbox"
                checked={object.visible}
                onChange={(event) => {
                  updateSelectedObject((current) => ({
                    ...current,
                    visible: event.target.checked,
                  }));
                }}
              />
              <span>Visible in layer</span>
            </label>
            <div className="rounded border border-white/10 bg-white/5 p-2 text-[11px] text-white/50">
              <div>Layer: {layer.name}</div>
              <div>Object ID: {object.id}</div>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] uppercase tracking-wide text-white/60">Polygon Vertices</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
                onClick={addPolygonPoint}
                disabled={!Array.isArray(object.polygon)}
              >
                Add vertex
              </button>
            </div>
          </div>
          {polygonPoints.length === 0 ? (
            <div className="rounded border border-dashed border-white/20 bg-white/5 px-3 py-2 text-white/50">
              This object does not define a polygon. Add vertices to begin shaping it.
            </div>
          ) : (
            <div className="space-y-2">
              {polygonPoints.map((point, index) => (
                <div key={index} className="space-y-2 rounded border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between text-white/60">
                    <span>Vertex {index + 1}</span>
                    <button
                      type="button"
                      className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent"
                      onClick={() => removePolygonPoint(index)}
                      disabled={polygonPoints.length <= 3}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {["x", "y"].map((axis) => (
                      <label key={axis} className="flex flex-col gap-1">
                        <span className="text-[11px] uppercase tracking-wide text-white/50">{axis.toUpperCase()}</span>
                        <input
                          type="number"
                          className="rounded border border-white/20 bg-slate-900 px-2 py-1 text-xs text-white"
                          value={Number.isFinite(point[axis as "x" | "y"]) ? String(point[axis as "x" | "y"]) : ""}
                          onChange={(event) => {
                            const parsed = Number.parseFloat(event.target.value);
                            updatePolygonPoint(index, axis as "x" | "y", Number.isNaN(parsed) ? 0 : parsed);
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="rounded border border-slate-500/20 bg-slate-900/40 px-2 py-1 text-[11px] text-white/50">
                    Coordinates are relative to the object origin ({object.x}, {object.y}).
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] uppercase tracking-wide text-white/60">Custom Properties</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
                onClick={addObjectProperty}
              >
                Add property
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {Object.keys(properties).length === 0 ? (
              <div className="rounded border border-dashed border-white/20 bg-white/5 px-3 py-2 text-white/50">
                No custom properties defined.
              </div>
            ) : (
              Object.entries(properties).map(([key, value]) => (
                <div key={key} className="rounded border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      className="flex-1 rounded border border-white/20 bg-slate-900 px-2 py-1 text-xs text-white"
                      value={key}
                      onBlur={(event) => handleRenameProperty(key, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
                      onClick={() => removeObjectProperty(key)}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="mt-2">{renderPropertyValueControl(key, value)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-950/70 p-6 text-white">
        <div className="rounded border border-white/10 bg-slate-900/70 px-6 py-4 text-sm">Loading tile map editor...</div>
      </div>
    );
  }

  if (error || !mapState) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-950/70 p-6 text-white">
        <div className="rounded border border-white/10 bg-slate-900/70 px-6 py-4 text-sm">
          {error ?? "Tile map data is unavailable."}
          <div className="mt-3 text-right">
            <button
              type="button"
              className="rounded border border-white/20 px-3 py-1 text-xs text-white/70 hover:bg-white/10"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="pointer-events-auto flex h-full w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 text-white shadow-[0_0_45px_rgba(8,247,254,0.35)]">
        <header className="flex items-center justify-between border-b border-white/10 bg-white/5 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Tile Map Editor</h2>
            <p className="text-xs text-white/60">
              Editing layer {mapState.layerIndex + 1} of {mapState.map.tileLayers.length} ({mapState.map.tileLayers[mapState.layerIndex]?.name ?? "Unnamed"})
            </p>
          </div>
          <button
            type="button"
            className="rounded border border-white/20 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <PanelGroup direction="horizontal" className="flex-1 overflow-hidden">
          <Panel defaultSize={66} minSize={40} className="flex min-w-[280px] flex-col">
            <div className="flex flex-col gap-4 p-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className={`rounded px-3 py-1 text-xs transition ${
                    activeTab === "tiles" ? "bg-cyan-500/30 text-white" : "border border-white/20 text-white/70 hover:bg-white/10"
                  }`}
                  onClick={() => setActiveTab("tiles")}
                >
                  Tiles
                </button>
                <button
                  type="button"
                  className={`rounded px-3 py-1 text-xs transition ${
                    activeTab === "objects" ? "bg-cyan-500/30 text-white" : "border border-white/20 text-white/70 hover:bg-white/10"
                  }`}
                  onClick={() => setActiveTab("objects")}
                >
                  Objects
                </button>
              </div>

              {activeTab === "tiles" ? (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs text-white/70">
                    Layer
                    <select
                      className="ml-2 rounded border border-white/20 bg-slate-900 px-2 py-1 text-xs"
                      value={mapState.layerIndex}
                      onChange={(event) => {
                        const nextIndex = Number.parseInt(event.target.value, 10);
                        setMapState((current) =>
                          current
                            ? {
                                map: current.map,
                                layerIndex: Number.isNaN(nextIndex) ? current.layerIndex : nextIndex,
                              }
                            : current
                        );
                      }}
                    >
                      {mapState.map.tileLayers.map((layer, index) => (
                        <option key={layer.id} value={index}>
                          {layer.name || `Layer ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="text-xs text-white/60">
                    Selected tile: {selectedTile ? `${selectedTile.tileset.name} (#${selectedTile.localId})` : "Eraser"}
                  </div>
                </div>
              ) : (
                hasObjectLayers ? (
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <label className="text-white/70">
                      Object layer
                      <select
                        className="ml-2 rounded border border-white/20 bg-slate-900 px-2 py-1 text-xs"
                        value={objectLayerIndex}
                        onChange={(event) => {
                          const nextIndex = Number.parseInt(event.target.value, 10);
                          if (Number.isNaN(nextIndex)) {
                            return;
                          }
                          setObjectLayerIndex(nextIndex);
                        }}
                      >
                        {mapState.map.objectLayers.map((layer, index) => (
                          <option key={layer.id} value={index}>
                            {layer.name || `Objects ${index + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="text-white/60">
                      {selectedObjectDetails
                        ? `Selected object: ${selectedObjectDetails.object.name ?? `#${selectedObjectDetails.object.id}`}`
                        : "Click an object to select"}
                    </div>
                  </div>
                ) : (
                  <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
                    This tile map does not contain any object layers.
                  </div>
                )
              )}

              <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
                <span>Canvas zoom</span>
                <input
                  type="range"
                  min={0.35}
                  max={3}
                  step={0.05}
                  value={mapScale}
                  onChange={(event) => {
                    const parsed = Number.parseFloat(event.target.value);
                    if (Number.isNaN(parsed)) {
                      return;
                    }
                    mapScaleInitializedRef.current = true;
                    const clamped = Math.min(3, Math.max(0.35, parsed));
                    setMapScale(clamped);
                  }}
                  className="h-1 w-28 cursor-pointer"
                />
                <span className="w-12 text-right">{Math.round(mapScale * 100)}%</span>
                <button
                  type="button"
                  className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
                  onClick={() => {
                    mapScaleInitializedRef.current = true;
                    setMapScale(recommendedMapScale);
                    setMapPan({ x: 0, y: 0 });
                  }}
                >
                  Reset
                </button>
              </div>

              <div className="flex-1 overflow-hidden">
                <div className="h-full w-full rounded border border-white/10 bg-black/40">
                  <canvas
                    ref={canvasRef}
                    className="h-full w-full"
                    style={{ imageRendering: "pixelated" as const, touchAction: "none" as const }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerEnd}
                    onPointerCancel={handlePointerEnd}
                    onContextMenu={(event) => event.preventDefault()}
                  />
                </div>
              </div>

              <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/70">
                {activeTab === "tiles" ? (
                  <>
                    <p>Left click to paint the selected tile. Right click or choose Eraser to clear tiles.</p>
                    <p className="mt-1">Alt + drag (or middle mouse) to pan while zoomed. Changes apply immediately to the selected GameTileMapActor.</p>
                  </>
                ) : (
                  <>
                    <p>Left click objects to select them for editing. Use the form on the right to adjust metadata and custom properties.</p>
                    <p className="mt-1">Alt + drag (or middle mouse) to pan while zoomed. Changes apply immediately to the selected GameTileMapActor.</p>
                  </>
                )}
              </div>
            </div>
          </Panel>
          <PanelResizeHandle className="w-[5px] cursor-col-resize bg-cyan-500/20 transition hover:bg-cyan-500/40" />
          <Panel defaultSize={34} minSize={20} className="flex min-w-[240px] flex-col border-l border-white/10 bg-white/5 text-xs text-white/80">
            {activeTab === "tiles" ? renderTilePalette() : renderObjectInspector()}
          </Panel>
        </PanelGroup>
        <footer className="flex items-center justify-between border-t border-white/10 bg-white/5 px-6 py-3 text-[11px] text-white/70">
          <span>Tiles come from the tilesets defined in the TMX file. Unsupported flags (e.g., diagonal flip) are ignored.</span>
          <button
            type="button"
            className="rounded border border-white/20 px-3 py-1 text-xs text-white/70 hover:bg-white/10"
            onClick={onClose}
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
};

export const tileMapEditorPlugin: EditorUIPlugin = {
  id: "builtin.tilemap-editor",
  activate: ({ editor, modals }) => {
    if (!modals) {
      console.warn("Tile map editor plugin requires modal services.");
      return () => {};
    }

    let detachButton: (() => void) | null = null;
    const observer = new MutationObserver(() => {
      if (!detachButton) {
        attachButton();
      }
    });

    const openModal = () => {
      const selected = editor.getSelectedActors();
      const tileMap = selected.find((actor): actor is GameTileMapActor => actor instanceof GameTileMapActor) ?? null;
      modals.open((api) => <TileMapEditorModal actor={tileMap} onClose={api.close} />);
    };

    const attachButton = () => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const editButton = buttons.find((button) => button.textContent?.trim().toLowerCase() === "edit");
      if (!editButton) {
        return;
      }
      const handler = (event: MouseEvent) => {
        event.preventDefault();
        openModal();
      };
      editButton.addEventListener("click", handler);
      detachButton = () => {
        editButton.removeEventListener("click", handler);
        detachButton = null;
      };
    };

    attachButton();
    if (!detachButton) {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      observer.disconnect();
      detachButton?.();
    };
  },
};

export default tileMapEditorPlugin;
