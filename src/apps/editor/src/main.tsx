import { DOMParser } from "@xmldom/xmldom";
import http from "http";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { BaseActorRenderer, Canvas, UnlitMaterial } from "@repo/basicrenderer";
import { ContainerContext } from "./ioc/ioc";
import { EngineContext } from "@repo/ui";
import {
  Vector2,
  EngineBuilder,
  SoundManager,
  OrthoCamera,
  PlayerState,
  DefaultResourceManager,
  InputManager,
  Actor,
  StringUtils,
  TranslationGizmoActor,
  Container,
  MeshComponent,
  Mesh,
  Quad,
} from "@repo/engine";
import { PlanckWorld } from "@repo/planckphysics";
import {
  BombActor,
  DemoActor,
  ExampleTopDownRPGGameMode,
  GameTileMapActor,
  GrasslandsMap,
  PlayerController,
  WallActor,
} from "@repo/example";
import { Parser, tileMapEditorPlugin } from "@repo/tiler";
import { ClientEndpoint, ClientEngine, DefaultInputManager } from "@repo/client";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { FolderOpen, Play, Save, Square, Undo, Redo } from "lucide-react";
import { EditorInputResponder } from "./editorInputResponder";
import { Editor } from "../../../packages/engine/editor/editor";
import { theme } from "./theme";
import {
  ModalHost,
  ModalManager,
  PanelRegistry,
  SceneContextMenuRegistry,
  SceneContextMenuSurface,
  SceneDragDropRegistry,
  ModalTriggerRegistry,
  activateEditorPlugins,
} from "./plugins/pluginSystem";
import type {
  ComponentAsset,
  ComponentAssetStorage,
  EditorComponentAssembler,
  MeshComponentAssetPayload,
} from "@repo/engine";
import transformPropertiesPlugin from "./plugins/transformPropertiesPlugin";
import sceneGraphPanelPlugin from "./plugins/sceneGraphPanelPlugin";
import actorPalettePlugin from "./plugins/actorPalettePlugin";
import simpleModalPlugin from "./plugins/simpleModalPlugin";
import meshComponentDesignerPlugin from "./plugins/meshComponentDesignerPlugin";
import type { EditorUIPlugin } from "@repo/engine";

type ConsoleEntryType = "log" | "warn" | "error";

type ConsoleEntry = {
  id: number;
  type: ConsoleEntryType;
  message: string;
  timestamp: string;
};

const formatConsoleArg = (arg: unknown): string => {
  if (typeof arg === "string") {
    return arg;
  }

  if (arg instanceof Error) {
    const stack = arg.stack ? `\n${arg.stack}` : "";
    return `${arg.name}: ${arg.message}${stack}`;
  }

  try {
    return StringUtils.cleanStringify(arg);
  } catch (_error) {
    return String(arg);
  }
};

type SceneNode = {
  id: string;
  name: string;
  actor: Actor;
  children: SceneNode[];
};


const areSceneNodesEqual = (a: SceneNode, b: SceneNode): boolean => {
  if (a.id !== b.id || a.name !== b.name) {
    return false;
  }
  return areSceneGraphsEqual(a.children, b.children);
};
const areSceneGraphsEqual = (a: SceneNode[], b: SceneNode[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (!areSceneNodesEqual(a[i], b[i])) {
      return false;
    }
  }
  return true;
};

const cloneComponentAsset = (asset: ComponentAsset): ComponentAsset => ({
  ...asset,
  payload: asset.payload ? JSON.parse(JSON.stringify(asset.payload)) : null,
});

type MeshMetadataVertex = { x: number; y: number };

type MeshMetadata = {
  vertices: MeshMetadataVertex[];
};

const DEFAULT_MESH_VERTICES: MeshMetadataVertex[] = [
  { x: -0.5, y: -0.5 },
  { x: 0.5, y: -0.5 },
  { x: 0.5, y: 0.5 },
  { x: -0.5, y: 0.5 },
];

const cloneMeshVertices = (vertices: MeshMetadataVertex[]): MeshMetadataVertex[] =>
  vertices.map((vertex) => ({ x: vertex.x, y: vertex.y }));

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const normalizeMeshMetadataPayload = (metadata: unknown): MeshMetadata => {
  if (!metadata || typeof metadata !== "object") {
    return { vertices: cloneMeshVertices(DEFAULT_MESH_VERTICES) };
  }

  const rawVertices = Array.isArray((metadata as any).vertices) ? (metadata as any).vertices : [];
  const normalized = rawVertices
    .map((entry: unknown) => {
      if (Array.isArray(entry) && entry.length >= 2 && isFiniteNumber(entry[0]) && isFiniteNumber(entry[1])) {
        return { x: Number(entry[0]), y: Number(entry[1]) };
      }
      if (entry && typeof entry === "object" && isFiniteNumber((entry as any).x) && isFiniteNumber((entry as any).y)) {
        return { x: Number((entry as any).x), y: Number((entry as any).y) };
      }
      return null;
    })
    .filter((value: any): value is MeshMetadataVertex => value !== null);

  if (normalized.length >= 3) {
    return { vertices: cloneMeshVertices(normalized) };
  }

  return { vertices: cloneMeshVertices(DEFAULT_MESH_VERTICES) };
};

const computePolygonIndices = (vertexCount: number): Uint16Array => {
  if (vertexCount < 3) {
    return new Uint16Array();
  }
  const result = new Uint16Array((vertexCount - 2) * 3);
  let offset = 0;
  for (let index = 1; index < vertexCount - 1; index++) {
    result[offset++] = 0;
    result[offset++] = index;
    result[offset++] = index + 1;
  }
  return result;
};

const computePolygonUvs = (vertices: MeshMetadataVertex[]): Float32Array => {
  if (vertices.length === 0) {
    return new Float32Array();
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const vertex of vertices) {
    minX = Math.min(minX, vertex.x);
    maxX = Math.max(maxX, vertex.x);
    minY = Math.min(minY, vertex.y);
    maxY = Math.max(maxY, vertex.y);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const uvs = new Float32Array(vertices.length * 2);
  vertices.forEach((vertex, index) => {
    const u = width === 0 ? 0.5 : (vertex.x - minX) / width;
    const v = height === 0 ? 0.5 : 1 - (vertex.y - minY) / height;
    uvs[index * 2] = u;
    uvs[index * 2 + 1] = v;
  });
  return uvs;
};

class EditorPolygonMesh extends Mesh {
  constructor(vertices: Float32Array, indices: Uint16Array, uvs: Float32Array) {
    super();
    this.vertices = vertices;
    this.indices = indices;
    this.uvs = uvs;
  }

  rotate(angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let index = 0; index < this.vertices.length; index += 2) {
      const x = this.vertices[index];
      const y = this.vertices[index + 1];
      this.vertices[index] = x * cos - y * sin;
      this.vertices[index + 1] = x * sin + y * cos;
    }
  }

  scale(sx: number, sy: number): void {
    for (let index = 0; index < this.vertices.length; index += 2) {
      this.vertices[index] *= sx;
      this.vertices[index + 1] *= sy;
    }
  }

  translate(tx: number, ty: number): void {
    for (let index = 0; index < this.vertices.length; index += 2) {
      this.vertices[index] += tx;
      this.vertices[index + 1] += ty;
    }
  }

  clone(): Mesh {
    return new EditorPolygonMesh(new Float32Array(this.vertices), new Uint16Array(this.indices), new Float32Array(this.uvs));
  }

  getVertexCount(): number {
    return this.vertices.length / 2;
  }
}

const buildMeshFromMetadata = (metadata: unknown): { mesh: Mesh; metadata: MeshMetadata } => {
  const normalized = normalizeMeshMetadataPayload(metadata);
  const vertices = normalized.vertices;

  if (vertices.length < 3) {
    return {
      metadata: normalized,
      mesh: new Quad(),
    };
  }

  const vertexArray = new Float32Array(vertices.length * 2);
  vertices.forEach((vertex, index) => {
    vertexArray[index * 2] = vertex.x;
    vertexArray[index * 2 + 1] = vertex.y;
  });

  const indices = computePolygonIndices(vertices.length);
  const uvs = computePolygonUvs(vertices);

  return {
    metadata: normalized,
    mesh: new EditorPolygonMesh(vertexArray, indices, uvs),
  };
};

type RegisteredPanelInstance = ReturnType<PanelRegistry["resolve"]>[number];

const PanelInstance = ({ panel, editor }: { panel: RegisteredPanelInstance; editor: Editor }) => {
  return <>{panel.render({ editor })}</>;
};

const createPrototypeComponentAssetStorage = (): ComponentAssetStorage => {
  let store: ComponentAsset[] = [];
  return {
    getAssets: () => store.map(cloneComponentAsset),
    saveAsset: async (asset) => {
      const copy = cloneComponentAsset(asset);
      const index = store.findIndex((entry) => entry.id === asset.id);
      if (index >= 0) {
        store = [...store.slice(0, index), copy, ...store.slice(index + 1)];
      } else {
        store = [...store, copy];
      }
    },
    deleteAsset: async (assetId) => {
      store = store.filter((asset) => asset.id !== assetId);
    },
  };
};

const hashStringToColor = (value: string): [number, number, number, number] => {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  const r = ((hash >> 16) & 0xff) / 255;
  const g = ((hash >> 8) & 0xff) / 255;
  const b = (hash & 0xff) / 255;
  return [r, g, b, 1];
};

const createPrototypeComponentAssembler = (): EditorComponentAssembler => ({
  attachComponentToActor: async (actor, asset) => {
    if (asset.type !== "mesh") {
      console.warn(`Unsupported component type "${asset.type}" for attachment.`);
      return;
    }

    const payload = asset.payload as MeshComponentAssetPayload | undefined;
    if (!payload) {
      console.warn("Mesh asset payload missing; cannot attach component.");
      return;
    }

    const material = new UnlitMaterial();
    material.setColor(hashStringToColor(`${payload.meshId ?? "mesh"}:${payload.materialId ?? "material"}`));

    const { mesh, metadata } = buildMeshFromMetadata(payload.metadata);
    const component = new MeshComponent(mesh, material);
    (component as any).editorAssetId = asset.id;
    (component as any).editorMeshMetadata = metadata;
    actor.addComponent(component);

    console.log(
      `Attached mesh component asset "${asset.name}" to actor ${actor.getId()} (vertices=${metadata.vertices.length})`
    );
  },
});

const App = () => {
  const [engine, setEngine] = useState<ClientEngine | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [logs, setLogs] = useState<ConsoleEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [sceneGraph, setSceneGraph] = useState<SceneNode[]>([]);
  const engineInitialized = useRef(false);
  const engineRef = useRef<ClientEngine | null>(null);
  const inputManagerRef = useRef<InputManager | null>(null);
  const editorInputRef = useRef<EditorInputResponder | null>(null);
  const logIdRef = useRef(0);
  const editorRef = useRef<Editor | null>(null);
  const panelRegistryRef = useRef(new PanelRegistry());
  const modalManagerRef = useRef(new ModalManager());
  const sceneContextMenuRegistryRef = useRef(new SceneContextMenuRegistry());
  const sceneDragDropRegistryRef = useRef(new SceneDragDropRegistry());
  const modalTriggerRegistryRef = useRef(new ModalTriggerRegistry());
  const componentAssetStorageRef = useRef<ComponentAssetStorage | null>(null);
  const componentAssemblerRef = useRef<EditorComponentAssembler | null>(null);
  const pluginCleanupRef = useRef<(() => void) | null>(null);
  const containerRef = useRef<Container | null>(null);
  const [container, setContainer] = useState<Container | null>(null);
  const [panelRevision, setPanelRevision] = useState(0);
  const [activeLeftPanelId, setActiveLeftPanelId] = useState<string | null>(null);
  const [activeRightPanelId, setActiveRightPanelId] = useState<string | null>(null);
  const leftPanels = useMemo(() => panelRegistryRef.current.resolve("left"), [panelRevision]);
  const rightPanels = useMemo(() => panelRegistryRef.current.resolve("right"), [panelRevision]);
  const activeLeftPanel = useMemo(
    () => leftPanels.find((panel) => panel.id === activeLeftPanelId) ?? null,
    [leftPanels, activeLeftPanelId]
  );
  const activeRightPanel = useMemo(
    () => rightPanels.find((panel) => panel.id === activeRightPanelId) ?? null,
    [rightPanels, activeRightPanelId]
  );

  const componentAssetStorage = useMemo(() => componentAssetStorageRef.current ?? createPrototypeComponentAssetStorage(), []);
  const componentAssembler = useMemo(() => componentAssemblerRef.current ?? createPrototypeComponentAssembler(), []);
  componentAssetStorageRef.current = componentAssetStorage;
  componentAssemblerRef.current = componentAssembler;

  useEffect(() => {
    setActiveLeftPanelId((previous) => {
      if (leftPanels.length === 0) {
        return null;
      }
      if (previous && leftPanels.some((panel) => panel.id === previous)) {
        return previous;
      }
      return leftPanels[0].id;
    });
  }, [leftPanels]);

  useEffect(() => {
    setActiveRightPanelId((previous) => {
      if (rightPanels.length === 0) {
        return null;
      }
      if (previous && rightPanels.some((panel) => panel.id === previous)) {
        return previous;
      }
      return rightPanels[0].id;
    });
  }, [rightPanels]);

  useEffect(() => {
    type ConsoleMethods = {
      log: typeof console.log;
      warn: typeof console.warn;
      error: typeof console.error;
    };

    const originals: ConsoleMethods = {
      log: console.log,
      warn: console.warn,
      error: console.error,
    };

    const append = (type: ConsoleEntryType, args: unknown[]) => {
      const serialized = args.map(formatConsoleArg).join(" ");
      const entry: ConsoleEntry = {
        id: ++logIdRef.current,
        type,
        message: serialized.trim().length > 0 ? serialized : "(no output)",
        timestamp: new Date().toLocaleTimeString(),
      };

      setLogs((previous) => {
        const next = [...previous, entry];
        const maxEntries = 300;
        return next.length > maxEntries ? next.slice(next.length - maxEntries) : next;
      });
    };

    console.log = (...args: unknown[]) => {
      originals.log.apply(console, args as unknown[]);
      append("log", args);
    };

    console.warn = (...args: unknown[]) => {
      originals.warn.apply(console, args as unknown[]);
      append("warn", args);
    };

    console.error = (...args: unknown[]) => {
      originals.error.apply(console, args as unknown[]);
      append("error", args);
    };

    return () => {
      console.log = originals.log;
      console.warn = originals.warn;
      console.error = originals.error;
    };
  }, []);

  const handleClearLogs = () => setLogs([]);

  const buildSceneGraph = useCallback((rootActors: Actor[]): SceneNode[] => {
    const traverse = (actor: Actor): SceneNode => {
      const children = actor.getChildrenOfType(Actor).map(traverse);
      return {
        id: actor.getId(),
        name: (actor as any).name ?? actor.constructor?.name ?? "Actor",
        actor,
        children,
      };
    };
    return rootActors.map(traverse);
  }, []);

  const handleSceneDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const editorInstance = editorRef.current;
      if (!editorInstance) {
        return;
      }

      const handlers = sceneDragDropRegistryRef.current.resolve();
      if (handlers.length === 0) {
        return;
      }

      const context = {
        editor: editorInstance,
        engine,
        canvas: document.getElementById("gamescreen") as HTMLCanvasElement | null,
      };

      for (const handler of handlers) {
        if (!handler.onDragOver) {
          continue;
        }
        const handled = handler.onDragOver(event, context);
        if (handled === true) {
          event.preventDefault();
          event.stopPropagation();
          break;
        }
      }
    },
    [engine]
  );

  const handleSceneDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      const editorInstance = editorRef.current;
      if (!editorInstance) {
        return;
      }

      const handlers = sceneDragDropRegistryRef.current.resolve();
      if (handlers.length === 0) {
        return;
      }

      const context = {
        editor: editorInstance,
        engine,
        canvas: document.getElementById("gamescreen") as HTMLCanvasElement | null,
      };

      for (const handler of handlers) {
        if (!handler.onDrop) {
          continue;
        }
        const result = handler.onDrop(event, context);
        const handled = result instanceof Promise ? await result : result;
        if (handled === true) {
          event.preventDefault();
          event.stopPropagation();
          break;
        }
      }
    },
    [engine]
  );

  const handleTouchDrop = useCallback(
    async (event: CustomEvent<{ actorTypeId: string; clientX: number; clientY: number }>) => {
      const editorInstance = editorRef.current;
      if (!editorInstance || !engine) {
        return;
      }

      const { actorTypeId, clientX, clientY } = event.detail;

      // Create a synthetic drag event to reuse the existing drop handler logic
      // This provides a minimal implementation of the DragEvent interface needed by handlers
      const syntheticDataTransfer = {
        getData: (type: string) => {
          if (type === "application/x-editor-actor") {
            return JSON.stringify({ type: actorTypeId });
          }
          return "";
        },
      };

      const syntheticEvent: Partial<DragEvent<HTMLDivElement>> = {
        clientX,
        clientY,
        dataTransfer: syntheticDataTransfer as DataTransfer,
        preventDefault: () => {},
        stopPropagation: () => {},
      };

      const handlers = sceneDragDropRegistryRef.current.resolve();
      const context = {
        editor: editorInstance,
        engine,
        canvas: document.getElementById("gamescreen") as HTMLCanvasElement | null,
      };

      for (const handler of handlers) {
        if (!handler.onDrop) {
          continue;
        }
        const result = handler.onDrop(syntheticEvent as DragEvent<HTMLDivElement>, context);
        const handled = result instanceof Promise ? await result : result;
        if (handled === true) {
          break;
        }
      }
    },
    [engine]
  );

  const handleMenuButtonClick = useCallback(
    (menuId: string) => (event: MouseEvent<HTMLButtonElement>) => {
      const editorInstance = editorRef.current;
      const modalManager = modalManagerRef.current;
      if (!editorInstance || !modalManager) {
        return;
      }

      event.preventDefault();
      void modalTriggerRegistryRef.current.dispatch(
        "toolbar.menu",
        {
          editor: editorInstance,
          menuId,
          event,
        },
        modalManager
      );
    },
    []
  );

  useEffect(() => {
    
    if (engineInitialized.current) return;
    engineInitialized.current = true;

    // Begin performance timing
    const startTime = performance.now();

    const builder = new EngineBuilder<WebSocket, http.IncomingMessage>();
    builder
      .withWorldInstance(new PlanckWorld())
      .withEndpointInstance(new ClientEndpoint("localhost", 3001))
      .withServiceInstance(DOMParser, new DOMParser())
      .withService(Editor)
      .withService(Parser)
      .withInputManager(DefaultInputManager)
      .withSoundManager(SoundManager)
      .withGameMode(ExampleTopDownRPGGameMode)
      .withResourceManager(DefaultResourceManager)
      .withActor(DemoActor)
      .withActor(GameTileMapActor)
      .withActor(BombActor)
      .withActor(WallActor)
      .withActor(TranslationGizmoActor)
      .withPlayerController(PlayerController<WebSocket, http.IncomingMessage>)
      .withDebugLogging()
      .asSinglePlayer("LocalPlayer", "local_player");

    const e = builder.build(ClientEngine);
    // builder.container.registerSingletonInstance(ClientEngine, e);
    containerRef.current = builder.container;
    setContainer(builder.container);

    const inputManager = builder.container.get(InputManager);
    if (!inputManager) {
      console.warn("Editor failed to resolve InputManager instance");
    }
    inputManagerRef.current = inputManager;

    editorRef.current = builder.container.get(Editor);
    editorRef.current.initialize();

    const handleActorDoubleClick = (actor: Actor) => {
      const editorInstance = editorRef.current;
      const modalManager = modalManagerRef.current;
      if (!editorInstance || !modalManager) {
        return;
      }

      void modalTriggerRegistryRef.current.dispatch(
        "actor.doubleClick",
        {
          editor: editorInstance,
          actor,
        },
        modalManager
      );
    };

    editorRef.current.subscribe("actor:double-click", handleActorDoubleClick);

    const panelRegistry = panelRegistryRef.current;
    const modalManager = modalManagerRef.current;
    const sceneContextMenuRegistry = sceneContextMenuRegistryRef.current;
    const sceneDragDropRegistry = sceneDragDropRegistryRef.current;
    const modalTriggerRegistry = modalTriggerRegistryRef.current;
    panelRegistry.clear();
    sceneContextMenuRegistry.clear();
    sceneDragDropRegistry.clear();
    modalTriggerRegistry.clear();
    modalManager.clear();
    pluginCleanupRef.current?.();
    pluginCleanupRef.current = null;

    let cancelled = false;

    const loadPlugins = async () => {
      try {
        const builtInPlugins: EditorUIPlugin[] = [
          sceneGraphPanelPlugin,
          actorPalettePlugin,
          transformPropertiesPlugin,
          simpleModalPlugin,
          meshComponentDesignerPlugin,
          tileMapEditorPlugin,
        ];
        const dynamicPlugins = (await editorRef.current?.loadEnabledEditorPlugins()) ?? [];
        const activePlugins = [...builtInPlugins, ...dynamicPlugins];
        if (cancelled || !editorRef.current) {
          return;
        }

        pluginCleanupRef.current = activateEditorPlugins(
          editorRef.current,
          {
            panels: panelRegistry,
            modals: modalManager,
            sceneContextMenu: sceneContextMenuRegistry,
            sceneDragDrop: sceneDragDropRegistry,
            modalTriggers: modalTriggerRegistry,
          },
          activePlugins,
          {
            componentAssetStorage,
            componentAssembler,
          }
        );
      } catch (error) {
        console.error("Failed to activate editor UI plugins", error);
      }
    };

    loadPlugins();
    // Log time to startup
    const endTime = performance.now();
    console.log(`Engine built in ${(endTime - startTime).toFixed(4)} ms`);

    const newLevel = new GrasslandsMap(builder.container);
    setEngine(e);
    setIsPlaying(false);

    const demoActor = new DemoActor();
    demoActor.layer = 5;
    newLevel.addActor(demoActor);

    const setupLevel = async () => {
      try {
        const levelStartTime = performance.now();
        await e.loadLevelObject(newLevel);

        const worldSize = newLevel.getWorldSize();

        if (worldSize) {
          const camera = new OrthoCamera(new Vector2(worldSize.x / 2, worldSize.y / 2), 1, 40);
          e.setCurrentCamera(camera);
        } else {
          e.setCurrentCamera(new OrthoCamera(new Vector2(0, 0), 1));
        }

        const levelEndTime = performance.now();
        console.log(`Level loaded in ${(levelEndTime - levelStartTime).toFixed(2)} ms`);
      } catch (error) {
        console.error("Failed to initialize level", error);
      }

      e.addPlayer(new PlayerState("local_player", "LocalPlayer"));
      console.log(e.getLocalPlayerState());
      e.getLocalPlayerState()?.getController()?.possess(demoActor);
    };

    setupLevel();

    e.run(true);
    engineRef.current = e;

    const updateSceneGraph = () => {
      const activeEngine = engineRef.current;
      if (!activeEngine) {
        return;
      }
      const rootActors = activeEngine.getRootActors();
      const nextGraph = buildSceneGraph(rootActors);
      setSceneGraph((previous) => (areSceneGraphsEqual(previous, nextGraph) ? previous : nextGraph));
    };

    updateSceneGraph();
    const afterRenderId = e.onAfterRender(updateSceneGraph);

    if (inputManagerRef.current) {
      const responder = new EditorInputResponder(inputManagerRef.current, e, editorRef.current);
      responder.activate();
      editorInputRef.current = responder;
    }

    return () => {
      cancelled = true;
      editorInputRef.current?.dispose();
      editorInputRef.current = null;
      pluginCleanupRef.current?.();
      pluginCleanupRef.current = null;
      panelRegistryRef.current.clear();
      sceneContextMenuRegistryRef.current.clear();
      sceneDragDropRegistryRef.current.clear();
      modalTriggerRegistryRef.current.clear();
      modalManagerRef.current.clear();
      editorRef.current?.unsubscribe("actor:double-click", handleActorDoubleClick);
      editorRef.current = null;
      e.offAfterRender(afterRenderId);
      engineRef.current = null;
      containerRef.current = null;
      setContainer(null);
    };
  }, [buildSceneGraph]);

  useEffect(() => {
    const registry = panelRegistryRef.current;
    const unsubscribe = registry.subscribe(() => {
      setPanelRevision((previous) => previous + 1);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Listen for custom touch drop events
  useEffect(() => {
    const handleCustomTouchDrop = (event: Event) => {
      void handleTouchDrop(event as CustomEvent<{ actorTypeId: string; clientX: number; clientY: number }>);
    };
    
    document.addEventListener("actorpalette:touchdrop", handleCustomTouchDrop);
    
    return () => {
      document.removeEventListener("actorpalette:touchdrop", handleCustomTouchDrop);
    };
  }, [handleTouchDrop]);

  const handlePlay = () => {
    if (!engine) {
      return;
    }
    editorInputRef.current?.dispose();
    editorInputRef.current = null;
    engine.run(false);
    setIsPlaying(true);
  };

  const handleStop = () => {
    if (!engine) {
      return;
    }
    engine.run(true);
    if (inputManagerRef.current) {
      const responder = new EditorInputResponder(inputManagerRef.current, engine, editorRef.current!);
      responder.activate();
      editorInputRef.current = responder;
    }
    setIsPlaying(false);
  };

  const draw = (gl: WebGL2RenderingContext | null) => {
    if (!engine) return;

    engine.tick();

    if (gl) {
      engine.render(gl);
    }

    engine.finishFrame();
  };

  const compile = (gl: WebGL2RenderingContext) => {
    if (!engine) return;
    engine.compileMaterials(gl);
  };

  const editorInstance = editorRef.current;

  return (
    <ContainerContext.Provider value={container}>
      {container ? (
      <div
        className="w-screen h-screen"
        style={{
          backgroundColor: theme.bg,
          backgroundImage:
            "radial-gradient(1200px 800px at -10% -20%, rgba(8, 247, 254, 0.08), transparent 60%)," +
            "radial-gradient(1000px 700px at 120% 10%, rgba(254, 83, 187, 0.08), transparent 60%)," +
            "radial-gradient(800px 600px at 50% 120%, rgba(157, 78, 221, 0.06), transparent 60%)",
        }}
      >
        {/* Top Menu Bar */}
        <div
          className="h-12 flex items-center px-4 border-b"
          style={{
            backgroundColor: theme.panel,
            borderColor: "rgba(8, 247, 254, 0.2)",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className="h-6 w-6 rounded-lg bg-gradient-to-br from-cyan-400 via-fuchsia-500 to-violet-500"
                style={{
                  boxShadow: "0 0 16px 2px rgba(8, 247, 254, 0.4)",
                }}
              />
              <span className="text-sm font-semibold" style={{ color: theme.text }}>
                <span style={{ color: theme.neon.cyan }}>Nostalgi2D</span>
                <span style={{ color: theme.neon.magenta }}> Editor</span>
              </span>
            </div>

            <div className="flex items-center gap-1 ml-6">
              <MenuButton label="File" />
              <MenuButton label="Edit" />
              <MenuButton label="View" />
              <MenuButton label="Tools" onClick={handleMenuButtonClick("tools")} />
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center gap-3">
            <ToolButton icon={Undo} label="" onClick={() => {}}/>
            <ToolButton icon={Redo} label="" onClick={() => {}}/>
            <ToolButton
              icon={Play}
              label=""
              onClick={handlePlay}
              disabled={!engine || isPlaying}
              active={isPlaying}
            />
            <ToolButton
              icon={Square}
              label=""
              onClick={handleStop}
              disabled={!engine}
              active={!isPlaying}
            />
          </div>

          <div className="flex items-center gap-2">
            <IconButton icon={FolderOpen} tooltip="Open Map" />
            <IconButton icon={Save} tooltip="Save Map" />
          </div>
        </div>

        {/* Main Content Area with bottom console panel */}
        <div className="h-[calc(100vh-3rem)]">
          <PanelGroup direction="vertical">
            <Panel defaultSize={85} minSize={55}>
              <PanelGroup direction="horizontal">
                {/* Left Panel (1/5th) */}
                <Panel defaultSize={20} minSize={10} maxSize={30}>
                  <div
                    className="h-full border-r overflow-hidden flex flex-col relative"
                    style={{
                      backgroundColor: theme.panel,
                      borderColor: "rgba(8, 247, 254, 0.2)",
                    }}
                  >
                    <div
                      className="absolute inset-0 pointer-events-none opacity-20"
                      style={{
                        backgroundImage:
                          "linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px)," +
                          "linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)",
                        backgroundSize: "36px 36px",
                      }}
                    />
                    <div className="relative z-10">
                      {leftPanels.length > 0 ? (
                        <div
                          className="flex border-b text-xs uppercase tracking-wide"
                          style={{ borderColor: "rgba(8, 247, 254, 0.3)" }}
                        >
                          {leftPanels.map((panel) => {
                            const isActive = panel.id === activeLeftPanelId;
                            return (
                              <button
                                key={panel.id}
                                className={`flex-1 py-2 transition-colors ${
                                  isActive ? "bg-black/30 text-cyan-300" : "text-slate-400 hover:text-cyan-200"
                                }`}
                                onClick={() => setActiveLeftPanelId(panel.id)}
                              >
                                {panel.title}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div
                          className="border-b px-3 py-2 text-xs uppercase tracking-wide text-slate-500"
                          style={{ borderColor: "rgba(8, 247, 254, 0.15)" }}
                        >
                          No panels registered
                        </div>
                      )}
                    </div>
                    <div className="relative z-10 flex-1 overflow-y-auto p-4">
                      {editorInstance && activeLeftPanel ? (
                        <div className="h-full">
                          <PanelInstance key={activeLeftPanel.id} panel={activeLeftPanel} editor={editorInstance} />
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500">Nothing to display. Register a panel plugin.</div>
                      )}
                    </div>
                  </div>
                </Panel>

                <PanelResizeHandle className="w-1 hover:w-2 transition-all" style={{ backgroundColor: "rgba(8, 247, 254, 0.3)" }} />

                {/* Center Panel (3/5th) - Engine Canvas */}
                <Panel defaultSize={60} minSize={40}>
                  <div className="h-full flex flex-col relative" style={{ backgroundColor: theme.bg }}>
                    {/* Retro grid overlay */}
                    <div
                      className="absolute inset-0 pointer-events-none opacity-20"
                      style={{
                        backgroundImage:
                          "linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px)," +
                          "linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)",
                        backgroundSize: "36px 36px",
                      }}
                    />
                    <div className="flex-1 relative z-10">
                      <SceneContextMenuSurface
                        editor={editorInstance}
                        registry={sceneContextMenuRegistryRef.current}
                      >
                        <div className="h-full w-full" onDragOver={handleSceneDragOver} onDrop={handleSceneDrop}>
                          {engine && (
                            <EngineContext.Provider value={engine}>
                              <Canvas compile={compile} draw={draw} options={{ context: "webgl2" }} className="w-full h-full" />
                            </EngineContext.Provider>
                          )}
                        </div>
                      </SceneContextMenuSurface>
                    </div>
                  </div>
                </Panel>

                <PanelResizeHandle className="w-1 hover:w-2 transition-all" style={{ backgroundColor: "rgba(254, 83, 187, 0.3)" }} />

                {/* Right Panel (1/5th) */}
                <Panel defaultSize={20} minSize={10} maxSize={30}>
                  <div
                    className="h-full border-l overflow-y-auto relative"
                    style={{
                      backgroundColor: theme.panel,
                      borderColor: "rgba(254, 83, 187, 0.2)",
                    }}
                  >
                    {/* Retro grid overlay */}
                    <div
                      className="absolute inset-0 pointer-events-none opacity-20"
                      style={{
                        backgroundImage:
                          "linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px)," +
                          "linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)",
                        backgroundSize: "36px 36px",
                      }}
                    />
                    <div className="relative z-10">
                      {rightPanels.length > 0 ? (
                        <div
                          className="flex border-b text-xs uppercase tracking-wide"
                          style={{ borderColor: "rgba(254, 83, 187, 0.3)" }}
                        >
                          {rightPanels.map((panel) => {
                            const isActive = panel.id === activeRightPanelId;
                            return (
                              <button
                                key={panel.id}
                                className={`flex-1 py-2 transition-colors ${
                                  isActive ? "bg-black/30 text-pink-300" : "text-slate-400 hover:text-pink-200"
                                }`}
                                onClick={() => setActiveRightPanelId(panel.id)}
                              >
                                {panel.title}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div
                          className="border-b px-3 py-2 text-xs uppercase tracking-wide text-slate-500"
                          style={{ borderColor: "rgba(254, 83, 187, 0.15)" }}
                        >
                          No panels registered
                        </div>
                      )}
                    </div>
                    <div className="p-4 relative z-10 h-full overflow-y-auto">
                      {editorInstance && activeRightPanel ? (
                        <div className="h-full">
                          <PanelInstance key={activeRightPanel.id} panel={activeRightPanel} editor={editorInstance} />
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500">Nothing to display. Register a panel plugin.</div>
                      )}
                    </div>
                  </div>
                </Panel>
              </PanelGroup>
            </Panel>

            <PanelResizeHandle className="h-1 hover:h-2 transition-all" style={{ backgroundColor: "rgba(8, 247, 254, 0.35)" }} />

            <Panel defaultSize={15} minSize={10} maxSize={35}>
              <ConsolePanel
                logs={logs}
                onClear={handleClearLogs}
                autoScrollEnabled={autoScroll}
                onToggleAutoScroll={() => setAutoScroll((previous) => !previous)}
              />
            </Panel>
          </PanelGroup>
        </div>
        <ModalHost manager={modalManagerRef.current} />
      </div>) : (
        <div className="text-xs" style={{ color: theme.text }}>
          Editor not initialized.
        </div>
      )}
    </ContainerContext.Provider>
  );
};



const severityStyles: Record<ConsoleEntryType, { label: string; color: string }> = {
  log: { label: "Log", color: "#8bd3ff" },
  warn: { label: "Warn", color: "#facc15" },
  error: { label: "Error", color: "#f87171" },
};

type ConsolePanelProps = {
  logs: ConsoleEntry[];
  onClear: () => void;
  autoScrollEnabled: boolean;
  onToggleAutoScroll: () => void;
};

const ConsolePanel = ({ logs, onClear, autoScrollEnabled, onToggleAutoScroll }: ConsolePanelProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!autoScrollEnabled) {
      return;
    }
    const container = scrollRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [logs, autoScrollEnabled]);

  return (
    <div
      className="h-full flex flex-col border-t"
      style={{
        backgroundColor: theme.panel,
        borderColor: "rgba(8, 247, 254, 0.25)",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{
          borderColor: "rgba(8, 247, 254, 0.2)",
          color: theme.text,
        }}
      >
        <span className="text-xs font-semibold tracking-wide" style={{ color: theme.neon.cyan }}>
          Console
        </span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[10px] uppercase tracking-wide" style={{ color: theme.text }}>
            <input
              type="checkbox"
              checked={autoScrollEnabled}
              onChange={onToggleAutoScroll}
              className="h-3 w-3 accent-cyan-400"
            />
            Auto-scroll
          </label>
          <button
            onClick={onClear}
            className="px-2 py-1 text-[10px] uppercase tracking-wide rounded border border-white/10 hover:border-cyan-400/50 hover:bg-cyan-400/10 transition-colors"
            style={{ color: theme.text }}
          >
            Clear
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-xs font-mono"
        style={{ color: theme.text }}
      >
        {logs.length === 0 ? (
          <div className="opacity-60">Console output will appear here.</div>
        ) : (
          logs.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-3 text-[10px] uppercase tracking-wide">
                <span style={{ color: severityStyles[entry.type].color }}>
                  {severityStyles[entry.type].label}
                </span>
                <span className="opacity-60">{entry.timestamp}</span>
              </div>
              <pre
                className="whitespace-pre-wrap leading-relaxed text-xs"
                style={{ color: theme.text }}
              >
                {entry.message}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Helper Components
const MenuButton = ({ label, onClick }: { label: string; onClick?: (event: MouseEvent<HTMLButtonElement>) => void }) => (
  <button
    className="px-3 py-1.5 text-xs rounded-lg transition-all border border-transparent hover:border-cyan-400/30 hover:bg-cyan-400/10"
    style={{ color: theme.text }}
    onClick={onClick}
  >
    {label}
  </button>
);

const IconButton = ({ icon: Icon, tooltip }: { icon: React.ComponentType<{ className?: string }>; tooltip: string }) => (
  <button
    className="p-2 rounded-lg transition-all border border-transparent hover:border-cyan-400/50 hover:bg-cyan-400/10"
    style={{ color: theme.text }}
    title={tooltip}
  >
    <Icon className="h-4 w-4" />
  </button>
);

const ToolButton = ({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
      active
        ? "border-cyan-400/60 bg-cyan-400/20 text-white"
        : "border-white/10 text-slate-200 hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-white"
    } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    style={{
      boxShadow: active ? "0 0 12px rgba(8, 247, 254, 0.35)" : undefined,
    }}
    aria-pressed={active ?? false}
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>
);

createRoot(document.getElementById("app")!).render(<App />);
