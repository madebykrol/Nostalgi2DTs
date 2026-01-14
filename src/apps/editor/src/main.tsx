import { DOMParser } from "@xmldom/xmldom";
import http from "http";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { Canvas } from "@repo/basicrenderer";
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
  Container,
  Level,
  AssetService,
    DefaultGameMode,
    GUIProvider,
    GUIRenderer,
} from "@repo/engine";
import { PlanckWorld } from "@repo/planckphysics";
import {
  ExampleTopDownRPGGameMode,
  FlappyRectangleGameMode,
  GrasslandsMap,
  TopDownRPGController,
  flappyUiModule,
} from "@repo/example";
import { DEFAULT_LEVEL_PATH, saveResourceLevel, loadBinaryResource, saveBinaryResource } from "./services/resourceLoader";
import { Parser, tileMapEditorPlugin } from "@repo/tiler";
import { ClientEndpoint, ClientEngine, DefaultInputManager } from "@repo/client";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { FolderOpen, Play, Save, Square, Undo, Redo } from "lucide-react";
import { EditorInputResponder } from "./editorInputResponder";
import { Editor } from "@repo/engine";
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
  ComponentAssetStorage,
  EditorComponentAssembler,
  ComponentAsset,
  MeshComponentAssetPayload,
} from "@repo/engine";
import { transformPropertiesPlugin } from "@repo/editor-plugins";
import sceneGraphPanelPlugin from "./plugins/sceneGraphPanelPlugin";
import actorPalettePlugin from "./plugins/actorPalettePlugin";
import simpleModalPlugin from "./plugins/simpleModalPlugin";
import meshComponentDesignerPlugin, { MeshDesignerModal } from "./plugins/meshComponentDesignerPlugin";
import assetBrowserPanelPlugin from "./plugins/assetBrowserPanelPlugin";
import spriteSheetEditorPlugin, { openSpriteSheetEditor } from "./plugins/spriteEditor/spriteSheetEditorPlugin";
import type { EditorUIPlugin } from "@repo/engine";
import consoleTabPlugin, { type ConsoleEntry, type ConsoleEntryType } from "./plugins/consoleTabPlugin";
import metricsTabPlugin from "./plugins/metricsTabPlugin";
import fileMenuPlugin from "./plugins/fileMenuPlugin";

import { FlappyRectangleController } from "@repo/example";

// Extracted utilities
import { type SceneNode, areSceneGraphsEqual} from "./utils/sceneGraph";
import { formatConsoleArg } from "./utils/consoleFormatter";


// Extracted components
import { MenuButton, IconButton, ToolButton } from "./components/UIButtons";
import { BottomPanel } from "./components/BottomPanel";
import { PanelInstance } from "./components/PanelInstance";

// Extracted services
import { createPrototypeComponentAssetStorage, createPrototypeComponentAssembler } from "./services/assetService";

// Contexts
import { ConsoleContext } from "./contexts/ConsoleContext";
import { EditorEngineContext } from "./contexts/EngineContext";
import { useEngineInitialization } from "./hooks/useEngineInitialization";

type SerializedPropertyRecord = {
  key?: string | null;
  type?: string | null;
  value?: unknown;
  properties?: SerializedPropertyRecord[] | null;
  node?: unknown;
};

type SerializedLevelRecord = {
  type?: string | null;
  properties?: SerializedPropertyRecord[] | null;
  actors?: unknown[] | null;
};

const hasMeaningfulPropertyData = (property: SerializedPropertyRecord | null | undefined) => {
  if (!property) {
    return false;
  }
  if (property.value !== null && property.value !== undefined && property.value !== "") {
    return true;
  }
  if (Array.isArray(property.properties) && property.properties.length > 0) {
    return true;
  }
  if (property.node) {
    return true;
  }
  return false;
};

const PROPERTY_KEYS_PREFER_EXISTING = new Set(["gameMode"]);

const makePropertyKey = (property: SerializedPropertyRecord, index: number) =>
  typeof property?.key === "string" && property.key.length > 0 ? property.key : `__index_${index}`;

const buildPropertyIndex = (properties: SerializedPropertyRecord[] | null | undefined) => {
  const index = new Map<string, { key: string | null; prop: SerializedPropertyRecord }>();
  if (!properties) {
    return index;
  }
  properties.forEach((prop, idx) => {
    const key = typeof prop?.key === "string" ? prop.key : null;
    index.set(makePropertyKey(prop, idx), { key, prop });
  });
  return index;
};

const mergePropertyRecords = (
  existing: SerializedPropertyRecord | undefined,
  current: SerializedPropertyRecord | undefined,
  preferExisting: boolean,
): SerializedPropertyRecord | null => {
  if (!existing && !current) {
    return null;
  }
  if (!existing) {
    return current ?? null;
  }
  if (!current) {
    return existing;
  }

  const existingHas = hasMeaningfulPropertyData(existing);
  const currentHas = hasMeaningfulPropertyData(current);
  if (!currentHas && existingHas) {
    return existing;
  }
  if (!existingHas && currentHas) {
    return current;
  }
  if (preferExisting && existingHas) {
    return existing;
  }

  const mergedNested = mergeSerializedPropertyLists(existing.properties, current.properties);
  return {
    ...current,
    properties: mergedNested,
  };
};

const mergeSerializedPropertyLists = (
  existing: SerializedPropertyRecord[] | null | undefined,
  current: SerializedPropertyRecord[] | null | undefined,
): SerializedPropertyRecord[] => {
  if (!existing || existing.length === 0) {
    return current ? [...current] : [];
  }
  if (!current || current.length === 0) {
    return [...existing];
  }

  const existingIndex = buildPropertyIndex(existing);
  const currentIndex = buildPropertyIndex(current);
  const merged: SerializedPropertyRecord[] = [];
  const processed = new Set<string>();

  const processKey = (keyId: string) => {
    if (processed.has(keyId)) {
      return;
    }
    processed.add(keyId);
    const existingEntry = existingIndex.get(keyId);
    const currentEntry = currentIndex.get(keyId);
    const logicalKey = currentEntry?.key ?? existingEntry?.key ?? null;
    const preferExisting = logicalKey ? PROPERTY_KEYS_PREFER_EXISTING.has(logicalKey) : false;
    const record = mergePropertyRecords(existingEntry?.prop, currentEntry?.prop, preferExisting);
    if (record) {
      merged.push(record);
    }
  };

  for (const keyId of currentIndex.keys()) {
    processKey(keyId);
  }
  for (const keyId of existingIndex.keys()) {
    processKey(keyId);
  }

  return merged;
};

const mergeSerializedLevelJson = (existingContent: string | null | undefined, currentContent: string) => {
  if (!existingContent) {
    return currentContent;
  }
  try {
    const existing = JSON.parse(existingContent) as SerializedLevelRecord;
    const current = JSON.parse(currentContent) as SerializedLevelRecord;
    current.properties = mergeSerializedPropertyLists(existing.properties, current.properties);
    return JSON.stringify(current, null, 2);
  } catch (error) {
    console.warn("Failed to merge existing level properties; saving editor state only.", error);
    return currentContent;
  }
};

const App = () => {
  // const [engine, setEngine] = useState<ClientEngine | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [logs, setLogs] = useState<ConsoleEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [sceneGraph, setSceneGraph] = useState<SceneNode[]>([]);
  const [activeLevelPath, setActiveLevelPath] = useState<string>(DEFAULT_LEVEL_PATH);
  const [playLevelPath, setPlayLevelPath] = useState<string | undefined>(undefined);
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);
  const engineInitialized = useRef(false);
  const engineRef = useRef<ClientEngine | null>(null);
  const sceneGraphRaf = useRef<number | null>(null);
  const inputManagerRef = useRef<InputManager | null>(null);
  const editorInputRef = useRef<EditorInputResponder | null>(null);
  const logIdRef = useRef(0);
  const editorRef = useRef<Editor | null>(null);
  const panelRegistryRef = useRef(new PanelRegistry());
  const modalManagerRef = useRef(new ModalManager());
  const levelSnapshotRef = useRef<string | null>(null);
  const sceneContextMenuRegistryRef = useRef(new SceneContextMenuRegistry());
  const sceneDragDropRegistryRef = useRef(new SceneDragDropRegistry());
  const modalTriggerRegistryRef = useRef(new ModalTriggerRegistry());
  const componentAssetStorageRef = useRef<ComponentAssetStorage | null>(null);
  const componentAssemblerRef = useRef<EditorComponentAssembler | null>(null);
  const pluginCleanupRef = useRef<(() => void) | null>(null);
  const containerRef = useRef<Container | null>(null);
  // const [container, setContainer] = useState<Container | null>(null);
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
  
    setActiveRightPanelId((previous) => {
      if (rightPanels.length === 0) {
        return null;
      }
      if (previous && rightPanels.some((panel) => panel.id === previous)) {
        return previous;
      }
      return rightPanels[0].id;
    });
  }, [rightPanels, leftPanels]);

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

  const init = useEngineInitialization<WebSocket, http.IncomingMessage>((builder) =>
    builder
      .withWorldInstance(new PlanckWorld(undefined, builder.container))
      .withEndpointInstance(new ClientEndpoint("localhost", 3001))
      .withServiceInstance(DOMParser, new DOMParser())
      .withService(Editor)
      .withService(Parser)
      .withService(AssetService)

      .withInputManager(DefaultInputManager)
      .withSoundManager(SoundManager)
      .withGameMode(ExampleTopDownRPGGameMode)
      .withGameMode(DefaultGameMode)
      .withGameMode(FlappyRectangleGameMode)
      .withLevel(GrasslandsMap)
      .withLevel(Level)
      // Provide default UI module selection if desired; levels can override via uiModules property
      .withResourceManager(DefaultResourceManager)
      .withDecoratedActors()
      .withPlayerController(TopDownRPGController)
      .withPlayerController(FlappyRectangleController)
      .withDebugLogging()
      .asSinglePlayer("LocalPlayer", "local_player")
      .build(ClientEngine)
  );

  const engine = init?.engine ?? null;
  const container = init?.container ?? null;

    // Register UI modules globally (they are skipped when editor mode is active)
    if (engine) {
      engine.uiModuleRegistry.registerModule(flappyUiModule);
    }


  const buildSceneGraph = useCallback((rootActors: Actor[]): SceneNode[] => {
    const traverse = (actor: Actor): SceneNode | null => {
      if ((actor as any).persistable === false) {
        return null;
      }
      const children = actor.getChildrenOfType(Actor).map(traverse);
      return {
        id: actor.getId(),
        name: (actor as any).name ?? actor.constructor?.name ?? "Actor",
        actor,
        children: children.filter((child): child is SceneNode => Boolean(child)),
      };
    };
    return rootActors.map(traverse).filter((node): node is SceneNode => Boolean(node));
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

  const rememberLevelPath = useCallback((path: string) => {
    if (!path) {
      return;
    }
    setActiveLevelPath(path);
  }, []);

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
    if (!engine || !container) return;
    if (engineInitialized.current) return;
    engineInitialized.current = true;

    // Begin performance timing
    const startTime = performance.now();
    containerRef.current = container;

    const e = engine;

    const inputManager = container!.get(InputManager);
    if (!inputManager) {
      console.warn("Editor failed to resolve InputManager instance");
    }
    inputManagerRef.current = inputManager;

    editorRef.current = container!.get(Editor);
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

    const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    };

    const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    };

    type LoadedMeshAsset = {
      path: string;
      rootEntryId: string;
      entryName: string;
      manifest: any;
      asset: ComponentAsset;
    };

    const loadMeshDesignerAsset = async (path: string): Promise<LoadedMeshAsset | null> => {
      try {
        const base64 = await loadBinaryResource(path);
        const buffer = base64ToArrayBuffer(base64);
        const service = new AssetService();
        const unpacked = service.unPackAsset(buffer);
        const manifest = unpacked.manifest;
        const entries = unpacked.entries ?? [];
        if (!manifest || entries.length === 0) {
          return null;
        }

        const rootEntry = manifest.entries.find((entry) => entry.id === manifest.rootEntryId) ?? manifest.entries[0];
        const payloadEntry = entries.find((entry) => entry.id === rootEntry.id) ?? entries[0];
        const json = new TextDecoder().decode(payloadEntry.bytes);
        const parsed = JSON.parse(json);

        const payload = parsed.payload ?? parsed;

        const meshAsset: ComponentAsset = {
          id: parsed.id ?? payload.meshId ?? rootEntry.id,
          name: parsed.name ?? rootEntry.name ?? "Mesh",
          type: "mesh",
          description: parsed.description ?? "",
          payload: {
            meshId: payload.meshId ?? parsed.id ?? rootEntry.id,
            materialId: payload.materialId ?? "default",
            metadata: payload.metadata ?? payload,
          },
        };

        return {
          path,
          rootEntryId: rootEntry.id,
          entryName: rootEntry.name ?? meshAsset.name,
          manifest,
          asset: meshAsset,
        };
      } catch (error) {
        console.error("Failed to load mesh asset for designer", error);
        return null;
      }
    };

    const saveMeshDesignerAsset = async (loaded: LoadedMeshAsset, metadata: MeshComponentAssetPayload["metadata"]) => {
      try {
        const service = new AssetService();
        const manifest = { ...loaded.manifest };
        const existingEntry = (manifest.entries ?? []).find((entry: any) => entry.id === loaded.rootEntryId);
        const payload = loaded.asset.payload as MeshComponentAssetPayload;
        const updatedPayload = {
          ...loaded.asset,
          payload: {
            ...payload,
            metadata,
          },
        };

        const payloadBytes = new TextEncoder().encode(JSON.stringify(updatedPayload, null, 2));

        const entryMetadata = {
          ...(existingEntry?.metadata ?? {}),
          kind: "mesh",
          meshId: payload.meshId ?? loaded.rootEntryId,
          updatedAt: new Date().toISOString(),
        };

        const packed = await service.packAsset(
          {
            format: "n2ar",
            version: manifest.version ?? 1,
            createdAt: manifest.createdAt ?? Date.now(),
            updatedAt: Date.now(),
            createdBy: manifest.createdBy ?? "Editor",
            updatedBy: "Editor",
            rootEntryId: loaded.rootEntryId,
            entries: [],
          },
          [
            {
              id: loaded.rootEntryId,
              name: loaded.entryName,
              type: "mesh",
              contentType: "application/json",
              bytes: payloadBytes,
              metadata: entryMetadata,
            },
          ]
        );

        const base64 = arrayBufferToBase64(packed);
        await saveBinaryResource(loaded.path, base64);
      } catch (error) {
        console.error("Failed to save mesh asset", error);
      }
    };

    const handleAssetDoubleClick = async (asset: {
      path: string;
      assetType?: string;
      manifestType?: string;
      contentType?: string;
      containerPath?: string;
      rootEntryId?: string;
      metadata?: Record<string, unknown>;
      isContainer?: boolean;
    }) => {
      const activeEngine = engineRef.current;

      if (!activeEngine) {
        console.warn("Cannot load level without an active engine instance");
        return;
      }

      const modalManager = modalManagerRef.current;

      const type = asset.assetType?.toLowerCase();
      const manifestType = asset.manifestType?.toLowerCase();
      const contentType = asset.contentType?.toLowerCase();
      const metadataKind = (() => {
        if (!asset.metadata) {
          return undefined;
        }
        const kindValue = (asset.metadata as { kind?: unknown }).kind;
        return typeof kindValue === "string" ? kindValue.toLowerCase() : undefined;
      })();

      const targetPath = asset.containerPath ?? asset.path;
      const normalizedTarget = targetPath.toLowerCase();

      const isMeshLike = manifestType === "mesh" || metadataKind === "mesh" || type === "mesh";

      if (isMeshLike && modalManager) {
        const meshAsset = await loadMeshDesignerAsset(targetPath);
        if (meshAsset) {
          modalManager.open((api) => (
            <MeshDesignerModal
              asset={meshAsset.asset}
              onClose={api.close}
              onApply={(nextMetadata) => {
                void saveMeshDesignerAsset(meshAsset, nextMetadata);
                api.close();
              }}
            />
          ));
        }
        return;
      }

      const looksLikeLevelPath = normalizedTarget.startsWith("levels/") || normalizedTarget.includes("/levels/");
      const levelContainerCandidate = asset.isContainer && type === "data" && normalizedTarget.endsWith(".n2asset");

      const isLevelLike =
        manifestType === "level" ||
        metadataKind === "level" ||
        levelContainerCandidate ||
        (type === "data" && looksLikeLevelPath);

      if (isLevelLike) {
        
        try {
          const levelJson = await activeEngine.loadLevel(targetPath);
          const level = levelJson;
          if (!level) {
            throw new Error("Level deserialization failed");
          }
          await activeEngine.loadLevelObject(level);
          rememberLevelPath(targetPath);
        } catch (error) {
          console.error("Failed to load level asset", error);
        }
        return;
      }

      if (!modalManager) {
        return;
      }

      const isSpriteLike =
        type === "sprite" ||
        type === "texture" ||
        manifestType === "sprite" ||
        manifestType === "texture" ||
        contentType?.startsWith("image/");

      if (!isSpriteLike) {
        return;
      }

      const assetPath = targetPath;
      const filePath = asset.path.endsWith(".n2asset") ? undefined : asset.path;

      openSpriteSheetEditor(modalManager, {
        assetPath,
        filePath,
      });
    };

    editorRef.current.subscribe("actor:double-click", handleActorDoubleClick);
    editorRef.current.subscribe("asset:double-click", handleAssetDoubleClick);

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
          fileMenuPlugin,
          sceneGraphPanelPlugin,
          actorPalettePlugin,
          transformPropertiesPlugin,
          simpleModalPlugin,
          meshComponentDesignerPlugin,
          assetBrowserPanelPlugin,
          spriteSheetEditorPlugin,
          tileMapEditorPlugin,
          consoleTabPlugin,
          metricsTabPlugin,
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

  const fallbackLevel: Level = new GrasslandsMap(container);
  setIsPlaying(false);

  const setupLevel = async () => {
    try {
      const levelStartTime = performance.now();
      let levelToLoad: Level | null = fallbackLevel;
      //let possessTarget: Actor = demoActor;

      try {
        const levelData = await e.loadLevel(DEFAULT_LEVEL_PATH);
        const parsedLevel = levelData! ?? null;

        levelToLoad = parsedLevel;
        rememberLevelPath(DEFAULT_LEVEL_PATH);
      } catch (err) {
        console.warn("Failed to load level from resource API, falling back to default", err);
      }

      await e.loadLevelObject(levelToLoad!);

      const worldSize = levelToLoad!.getWorldSize();

      if (worldSize) {
        const camera = new OrthoCamera(new Vector2(worldSize.x / 2, worldSize.y / 2), 1, 40);
        e.setCurrentCamera(camera);
      } else {
        // Fallback to a sensible default if level doesn't report a world size
        e.setCurrentCamera(new OrthoCamera(new Vector2(0, 0), 1));
      }

      const levelEndTime = performance.now();
      console.log(`Level loaded in ${(levelEndTime - levelStartTime).toFixed(2)} ms`);

      e.addPlayer(new PlayerState("local_player", "LocalPlayer"));
      //e.getLocalPlayerState()?.getController()?.possess(possessTarget);
    } catch (error) {
      console.error("Failed to initialize level", error);
    }

    console.log(e.getLocalPlayerState());
  };

  e.setEditorMode(true);

  setupLevel();

  engineRef.current = e;

  const updateSceneGraph = () => {

    if (sceneGraphRaf.current !== null) {
      return;
    }

    sceneGraphRaf.current = requestAnimationFrame(() => {
      sceneGraphRaf.current = null;
      const activeEngine = engineRef.current;
      if (!activeEngine) {
        return;
      }
      const rootActors = activeEngine.getRootActors();
      const nextGraph = buildSceneGraph(rootActors);
      setSceneGraph((previous) => (areSceneGraphsEqual(previous, nextGraph) ? previous : nextGraph));
    });
  };

   e.run(true);
  updateSceneGraph();
  if (inputManagerRef.current) {
    const responder = new EditorInputResponder(inputManagerRef.current, e, editorRef.current!);
    responder.activate();
    editorInputRef.current = responder;
  }
  
  const afterRenderId = e.onAfterRender(updateSceneGraph);
  

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
    editorRef.current?.unsubscribe("asset:double-click", handleAssetDoubleClick);
    editorRef.current = null;
    e.offAfterRender(afterRenderId);
    engineRef.current = null;
    containerRef.current = null;
    levelSnapshotRef.current = null;
      if (sceneGraphRaf.current !== null) {
        cancelAnimationFrame(sceneGraphRaf.current);
        sceneGraphRaf.current = null;
      }
    };
  }, [engine, container, buildSceneGraph, rememberLevelPath]);

  useEffect(() => {
    const registry = panelRegistryRef.current;
    const unsubscribe = registry.subscribe(() => {
      setPanelRevision((previous) => previous + 1);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadLevels = async () => {
      try {
        const res = await fetch("http://localhost:4000/api/resources/assets/search?types=level");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const paths: string[] = Array.isArray(json?.data)
          ? json.data
              .map((n: any) => (typeof n?.path === "string" ? n.path : null))
              .filter((p: string | null) => !!p)
          : [];
        if (!cancelled) {
          setAvailableLevels(paths);
        }
      } catch (error) {
        console.warn("Failed to fetch available levels", error);
        if (!cancelled) {
          setAvailableLevels([]);
        }
      }
    };
    loadLevels();
    return () => {
      cancelled = true;
    };
  }, []);

  const playLevelOptions = useMemo(() => {
    const options = new Set<string>(availableLevels);
    if (activeLevelPath) options.add(activeLevelPath);
    options.add(DEFAULT_LEVEL_PATH);
    return Array.from(options);
  }, [availableLevels, activeLevelPath]);

  const handlePlay = async () => {
    if (!engine) {
      return;
    }
    editorInputRef.current?.dispose();
    editorInputRef.current = null;

    levelSnapshotRef.current = editorRef.current?.serializeLevel(engine.getCurrentLevel()!) ?? null;

    const targetPath = (playLevelPath && playLevelPath.trim()) || activeLevelPath || DEFAULT_LEVEL_PATH;

    if (targetPath && targetPath !== activeLevelPath) {
      try {
        const levelData = await engine.loadLevel(targetPath);
        engine.loadLevelObject(levelData);
      } catch (error) {
        console.error(`Failed to load play level ${targetPath}`, error);
        // Reactivate editor input if play failed
        if (inputManagerRef.current) {
          const responder = new EditorInputResponder(inputManagerRef.current, engine, editorRef.current!);
          responder.activate();
          editorInputRef.current = responder;
        }
        return;
      }
    }

    engine.run(false);
    setIsPlaying(true);
  };

  const handleStop = () => {
    if (!engine) {
      return;
    }
    engine.shutdown();
    engine.run(true);
    
    engine.loadLevelObject(editorRef.current?.deserializeLevel(levelSnapshotRef.current!)! );

    // Load level from current editing state
    if (inputManagerRef.current) {
      const responder = new EditorInputResponder(inputManagerRef.current, engine, editorRef.current!);
      responder.activate();
      editorInputRef.current = responder;
    }
    setIsPlaying(false);

  }

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
      <ConsoleContext.Provider
        value={{
          logs,
          clearLogs: handleClearLogs,
          autoScrollEnabled: autoScroll,
          toggleAutoScroll: () => setAutoScroll((previous) => !previous),
        }}
      >
        <EditorEngineContext.Provider value={{ engine }}>
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
              <MenuButton label="File" onClick={handleMenuButtonClick("file")} />
              <MenuButton label="Edit" />
              <MenuButton label="View" />
              <MenuButton label="Tools" onClick={handleMenuButtonClick("tools")} />
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center gap-3">
            <ToolButton icon={Undo} label="" onClick={() => {
              editorRef.current?.undoEdit("default")
            }}/>
            <ToolButton icon={Redo} label="" onClick={() => {
              editorRef.current?.redoEdit("default")
            }}/>
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
            <select
              className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white focus:border-white/30 focus:outline-none"
              value={(playLevelPath ?? activeLevelPath) ?? DEFAULT_LEVEL_PATH}
              onChange={(e) => setPlayLevelPath(e.target.value)}
              title="Select level to play"
            >
              {playLevelOptions.map((path) => (
                <option key={path} value={path}>{path}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <IconButton icon={FolderOpen} tooltip="Open Map" />
            <IconButton
              icon={Save}
              tooltip={isSaving ? "Saving..." : "Save Map"}
              onClick={async () => {
                const activeEngine = engineRef.current;
                const editorInstance = editorRef.current;
                if (!activeEngine || !editorInstance) {
                  return;
                }

                const level = activeEngine.getCurrentLevel();
                if (!level) {
                  console.warn("No level loaded to save");
                  return;
                }

                const serializedLevel = editorInstance.serializeLevel(level);
                setIsSaving(true);
                try {
                  const targetPath = activeLevelPath ?? DEFAULT_LEVEL_PATH;
                  let contentToSave = serializedLevel;
                  try {
                    const existingContent = await activeEngine.loadLevel(targetPath);
                    contentToSave = mergeSerializedLevelJson(editorInstance.serializeLevel(existingContent), serializedLevel);
                  } catch (contentError) {
                    console.warn("Unable to load existing level before save; saving editor state only.", contentError);
                  }
                  await saveResourceLevel(targetPath, contentToSave);
                  console.log("Level saved", targetPath);
                } catch (err) {
                  console.error("Failed to save level", err);
                } finally {
                  setIsSaving(false);
                }
              }}
              disabled={!engine || isSaving}
            />
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
                              <div className="relative h-full w-full">
                                <Canvas compile={compile} draw={draw} options={{ context: "webgl2" }} className="w-full h-full" />
                                {/* UI modules are skipped in editor mode by the engine */}
                                <GUIProvider guiManager={engine.guiManager} componentRegistry={engine.componentRegistry}>
                                  <div
                                    className="absolute inset-0"
                                    style={{ pointerEvents: isPlaying ? "auto" : "none", overflow: "hidden" }}
                                  >
                                    <GUIRenderer />
                                  </div>
                                </GUIProvider>
                              </div>
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
              <BottomPanel
                panelRegistry={panelRegistryRef.current}
                panelRevision={panelRevision}
                editor={editorRef.current!}
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
        </EditorEngineContext.Provider>
      </ConsoleContext.Provider>
    </ContainerContext.Provider>
  );
};

const mount = document.getElementById("app");
if (!mount) {
  throw new Error("Failed to locate #app container for editor UI");
}

const existingKey = "__editor_root";
const anyMount = mount as typeof mount & { [key: string]: ReturnType<typeof createRoot> | undefined };

if (!anyMount[existingKey]) {
  anyMount[existingKey] = createRoot(mount);
}

anyMount[existingKey]!.render(<App />);
