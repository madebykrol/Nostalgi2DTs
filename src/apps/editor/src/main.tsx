import { DOMParser } from "@xmldom/xmldom";
import http from "http";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { Canvas } from "@nostalgi2d/basicrenderer";
import { ContainerContext } from "./ioc/ioc";
import { EngineContext } from "@nostalgi2d/ui";
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
} from "@nostalgi2d/engine";
import { PlanckWorld } from "@nostalgi2d/planckphysics";
import {
  ExampleTopDownRPGGameMode,
  GrasslandsMap,
  TopDownRPGController,
} from "@nostalgi2d-projects/grasslands-demo";
import {
  FlappyRectangleGameMode,
  FlappyRectangleController,
  flappyUiModule,
} from "@nostalgi2d-projects/flappy-rectangle";
import {
  saveResourceLevel,
  loadBinaryResource,
  saveBinaryResource,
  fetchProjects,
  createProject,
  type ProjectDescriptor,
} from "./services/resourceLoader";
import { Parser, tileMapEditorPlugin } from "@nostalgi2d/tiler";
import { ClientEndpoint, ClientEngine, DefaultInputManager } from "@nostalgi2d/client";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { FolderOpen, Play, Save, Square, Undo, Redo } from "lucide-react";
import { EditorInputResponder } from "./editorInputResponder";
import { Editor } from "@nostalgi2d/engine";
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
} from "@nostalgi2d/engine";
import { transformPropertiesPlugin } from "@nostalgi2d/editor-plugins";
import sceneGraphPanelPlugin from "./plugins/sceneGraphPanelPlugin";
import actorPalettePlugin from "./plugins/actorPalettePlugin";
import simpleModalPlugin from "./plugins/simpleModalPlugin";
import meshComponentDesignerPlugin, { MeshDesignerModal } from "./plugins/meshComponentDesignerPlugin";
import assetBrowserPanelPlugin from "./plugins/assetBrowserPanelPlugin";
import spriteSheetEditorPlugin, { openSpriteSheetEditor } from "./plugins/spriteEditor/spriteSheetEditorPlugin";
import type { EditorUIPlugin } from "@nostalgi2d/engine";
import consoleTabPlugin, { type ConsoleEntry, type ConsoleEntryType } from "./plugins/consoleTabPlugin";
import metricsTabPlugin from "./plugins/metricsTabPlugin";
import fileMenuPlugin from "./plugins/fileMenuPlugin";

// (FlappyRectangleController already imported from @nostalgi2d-projects/flappy-rectangle above)

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
import { ProjectScopeContext } from "./contexts/ProjectScopeContext";
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

const normalizeResourcePath = (value: string | null | undefined) => {
  if (!value) {
    return "";
  }
  return value.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\//, "").trim();
};

const joinResourcePath = (base: string | null | undefined, relative: string | null | undefined) => {
  const normalizedBase = normalizeResourcePath(base);
  const normalizedRelative = normalizeResourcePath(relative);
  if (!normalizedBase) {
    return normalizedRelative;
  }
  if (!normalizedRelative) {
    return normalizedBase;
  }
  return `${normalizedBase}/${normalizedRelative}`;
};

const ensureAssetContainerPath = (path: string) => {
  const normalized = normalizeResourcePath(path);
  if (!normalized) {
    return normalized;
  }
  const leaf = normalized.split("/").pop() ?? normalized;
  if (/\.[^./\\]+$/.test(leaf)) {
    return normalized;
  }
  return `${normalized}.n2asset`;
};

const resolveProjectLevelPath = (project: ProjectDescriptor | null, levelPath: string | null | undefined) => {
  const normalizedLevelPath = normalizeResourcePath(levelPath);
  if (!normalizedLevelPath) {
    return "";
  }

  const normalizedProjectPath = normalizeResourcePath(project?.projectPath);
  const fullPath =
    normalizedLevelPath.startsWith("projects/") ||
    (normalizedProjectPath.length > 0 && normalizedLevelPath.startsWith(`${normalizedProjectPath}/`))
      ? normalizedLevelPath
      : joinResourcePath(normalizedProjectPath, normalizedLevelPath);

  return ensureAssetContainerPath(fullPath);
};

const inferProjectPathFromLevelPath = (levelPath: string | null | undefined) => {
  const normalized = normalizeResourcePath(levelPath);
  const match = normalized.match(/^(projects\/[^/]+)/i);
  return match ? match[1] : "";
};

const resolveProjectAssetPath = (projectPath: string | null | undefined, resourcePath: string | null | undefined) => {
  const normalizedResourcePath = normalizeResourcePath(resourcePath);
  if (!normalizedResourcePath) {
    return "";
  }
  if (/^(?:[a-z]+:)?\/\//i.test(normalizedResourcePath)) {
    return normalizedResourcePath;
  }

  const withoutContentPrefix = normalizedResourcePath.replace(/^content\//i, "");
  if (/^projects\//i.test(withoutContentPrefix)) {
    return withoutContentPrefix;
  }

  const normalizedProjectPath = normalizeResourcePath(projectPath);
  if (!normalizedProjectPath) {
    return withoutContentPrefix;
  }

  if (withoutContentPrefix.startsWith(`${normalizedProjectPath}/`)) {
    return withoutContentPrefix;
  }

  return `${normalizedProjectPath}/${withoutContentPrefix}`;
};

const LAST_PROJECT_STORAGE_KEY = "nostalgi2d:editor:lastProjectId";
const LAST_LEVEL_STORAGE_KEY_PREFIX = "nostalgi2d:editor:lastLevel:";

const safeLocalStorage = () => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

const readLastProjectId = (): string | null => {
  return safeLocalStorage()?.getItem(LAST_PROJECT_STORAGE_KEY) ?? null;
};

const writeLastProjectId = (projectId: string | null) => {
  const storage = safeLocalStorage();
  if (!storage) return;
  if (projectId) {
    storage.setItem(LAST_PROJECT_STORAGE_KEY, projectId);
  } else {
    storage.removeItem(LAST_PROJECT_STORAGE_KEY);
  }
};

const readLastLevelForProject = (projectId: string | null | undefined): string | null => {
  if (!projectId) return null;
  return safeLocalStorage()?.getItem(`${LAST_LEVEL_STORAGE_KEY_PREFIX}${projectId}`) ?? null;
};

const writeLastLevelForProject = (projectId: string | null | undefined, levelPath: string | null) => {
  if (!projectId) return;
  const storage = safeLocalStorage();
  if (!storage) return;
  if (levelPath) {
    storage.setItem(`${LAST_LEVEL_STORAGE_KEY_PREFIX}${projectId}`, levelPath);
  } else {
    storage.removeItem(`${LAST_LEVEL_STORAGE_KEY_PREFIX}${projectId}`);
  }
};

const humanizeLevelPath = (path: string): string => {
  const normalized = normalizeResourcePath(path);
  if (!normalized) return "(no level)";
  const leaf = normalized.split("/").pop() ?? normalized;
  return leaf.replace(/\.n2asset$/i, "");
};

const collectProjectLevelPaths = (project: ProjectDescriptor | null): string[] => {
  if (!project) return [];
  const projectPath = normalizeResourcePath(project.projectPath);
  const files = Array.isArray(project.assetFiles) ? project.assetFiles : [];
  const fromFiles = files
    .map((file) => normalizeResourcePath(file))
    .filter(
      (file) =>
        file.endsWith(".n2asset") &&
        (file.includes("/levels/") || file.startsWith("levels/")) &&
        (!projectPath || file.startsWith(`${projectPath}/`) || file.startsWith("levels/"))
    )
    .map((file) =>
      projectPath && !file.startsWith(`${projectPath}/`) ? `${projectPath}/${file}` : file
    );

  const startup = resolveProjectLevelPath(project, project.startupLevel);
  const all = new Set<string>(fromFiles);
  if (startup) all.add(startup);
  return Array.from(all).sort();
};

const normalizeTileMapActorResourcePaths = (level: Level, projectPath: string | null | undefined) => {
  const normalizedProjectPath = normalizeResourcePath(projectPath);
  if (!normalizedProjectPath) {
    return;
  }

  const queue: Actor[] = level.getChildrenOfType(Actor);
  while (queue.length > 0) {
    const actor = queue.shift();
    if (!actor) {
      continue;
    }

    const anyActor = actor as Actor & { mapUrl?: unknown; getChildrenOfType?: (type: any) => Actor[] };
    if (typeof anyActor.mapUrl === "string") {
      const nextPath = resolveProjectAssetPath(normalizedProjectPath, anyActor.mapUrl);
      if (nextPath && nextPath !== anyActor.mapUrl) {
        anyActor.mapUrl = nextPath;
      }
    }

    const children = actor.getChildrenOfType(Actor);
    if (children.length > 0) {
      queue.push(...children);
    }
  }
};

const App = () => {
  // const [engine, setEngine] = useState<ClientEngine | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [logs, setLogs] = useState<ConsoleEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [sceneGraph, setSceneGraph] = useState<SceneNode[]>([]);
  const [activeLevelPath, setActiveLevelPath] = useState<string>("");
  const [playLevelPath, setPlayLevelPath] = useState<string | undefined>(undefined);
  const [projects, setProjects] = useState<ProjectDescriptor[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [projectDialogMode, setProjectDialogMode] = useState<"open" | "create">("open");
  const [projectDialogSelectionId, setProjectDialogSelectionId] = useState<string>("");
  const [projectDialogLevelPath, setProjectDialogLevelPath] = useState<string>("");
  const [createProjectTitle, setCreateProjectTitle] = useState<string>("");
  const [createProjectId, setCreateProjectId] = useState<string>("");
  const [createProjectLevelName, setCreateProjectLevelName] = useState<string>("main");
  const [createProjectError, setCreateProjectError] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [isLevelLoading, setIsLevelLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);
  const engineInitialized = useRef(false);
  const engineRef = useRef<ClientEngine | null>(null);
  const sceneGraphRaf = useRef<number | null>(null);
  const inputManagerRef = useRef<InputManager | null>(null);
  const editorInputRef = useRef<EditorInputResponder | null>(null);
  const logIdRef = useRef(0);
  const pendingLevelLoadPathRef = useRef<string | null>(null);
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
  const activeProject = useMemo(
    () => (activeProjectId ? projects.find((project) => project.id === activeProjectId) ?? null : null),
    [projects, activeProjectId]
  );
  const projectScopeValue = useMemo(
    () => ({
      projectId: activeProject?.id ?? null,
      projectTitle: activeProject?.title ?? null,
      projectPath: activeProject?.projectPath ?? null,
      assetRoots: activeProject?.assetRoots ?? [],
    }),
    [activeProject]
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

  const activeProjectIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  const projectsRef = useRef<ProjectDescriptor[]>([]);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const loadLevelIntoEditor = useCallback(
    async (targetPath: string) => {
      const normalizedTargetPath = normalizeResourcePath(targetPath);
      if (!normalizedTargetPath) {
        return false;
      }

      const activeEngine = engineRef.current;
      if (!activeEngine) {
        pendingLevelLoadPathRef.current = normalizedTargetPath;
        setPlayLevelPath(normalizedTargetPath);
        rememberLevelPath(normalizedTargetPath);
        return false;
      }
      setIsLevelLoading(true);
      setStatusMessage(`Loading ${humanizeLevelPath(normalizedTargetPath)}…`);
      try {
        const projectPathForLevel =
          normalizeResourcePath(activeProject?.projectPath) || inferProjectPathFromLevelPath(normalizedTargetPath);
        const levelData = await activeEngine.loadLevel(normalizedTargetPath);
        normalizeTileMapActorResourcePaths(levelData, projectPathForLevel);
        await activeEngine.loadLevelObject(levelData);

        const worldSize = levelData.getWorldSize();
        if (worldSize) {
          activeEngine.setCurrentCamera(new OrthoCamera(new Vector2(worldSize.x / 2, worldSize.y / 2), 1, 40));
        }

        rememberLevelPath(normalizedTargetPath);
        setPlayLevelPath(normalizedTargetPath);
        pendingLevelLoadPathRef.current = null;
        writeLastLevelForProject(activeProjectIdRef.current, normalizedTargetPath);
        setStatusMessage(`Loaded ${humanizeLevelPath(normalizedTargetPath)}`);
        return true;
      } catch (error) {
        console.error(`Failed to load level ${normalizedTargetPath}`, error);
        setStatusMessage(`Failed to load ${humanizeLevelPath(normalizedTargetPath)}`);
        return false;
      } finally {
        setIsLevelLoading(false);
      }
    },
    [rememberLevelPath, activeProject]
  );

  const applyProjectSelection = useCallback(
    async (projectId: string | null, levelPath?: string | null, options?: { loadLevel?: boolean }) => {
      const loadLevel = options?.loadLevel ?? true;
      setActiveProjectId(projectId);
      writeLastProjectId(projectId);

      if (!projectId) {
        setPlayLevelPath(undefined);
        return;
      }

      const sourceProjects = projectsRef.current.length > 0 ? projectsRef.current : projects;
      const selectedProject = sourceProjects.find((project) => project.id === projectId) ?? null;
      const startupPath = resolveProjectLevelPath(selectedProject, selectedProject?.startupLevel);
      const targetPath = normalizeResourcePath(levelPath ?? "") || startupPath || "";

      setPlayLevelPath(targetPath || undefined);

      if (loadLevel && targetPath) {
        activeProjectIdRef.current = projectId;
        await loadLevelIntoEditor(targetPath);
      }
    },
    [projects, loadLevelIntoEditor]
  );

  const loadLevelIntoEditorRef = useRef(loadLevelIntoEditor);
  useEffect(() => {
    loadLevelIntoEditorRef.current = loadLevelIntoEditor;
  }, [loadLevelIntoEditor]);


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
        await loadLevelIntoEditor(targetPath);
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

      // Editor starts with no project/level loaded by default. The project picker dialog
      // (or a restored last-selection) will trigger loadLevelIntoEditor when the user is ready.
      // We still need a placeholder level + camera so the engine's render loop has something valid.
      let levelToLoad: Level = fallbackLevel;
      const pendingPath = pendingLevelLoadPathRef.current;
      if (pendingPath) {
        try {
          const inferredProjectPath = inferProjectPathFromLevelPath(pendingPath);
          const parsedLevel = await e.loadLevel(pendingPath);
          if (parsedLevel) {
            normalizeTileMapActorResourcePaths(parsedLevel, inferredProjectPath);
            levelToLoad = parsedLevel;
            rememberLevelPath(pendingPath);
            pendingLevelLoadPathRef.current = null;
          }
        } catch (err) {
          console.warn(`Failed to load pending level ${pendingPath}`, err);
        }
      }

      await e.loadLevelObject(levelToLoad);

      const worldSize = levelToLoad.getWorldSize();

      if (worldSize) {
        const camera = new OrthoCamera(new Vector2(worldSize.x / 2, worldSize.y / 2), 1, 40);
        e.setCurrentCamera(camera);
      } else {
        // Fallback to a sensible default if level doesn't report a world size
        e.setCurrentCamera(new OrthoCamera(new Vector2(0, 0), 1));
      }

      const levelEndTime = performance.now();
      console.log(`Editor initialized in ${(levelEndTime - levelStartTime).toFixed(2)} ms`);

      e.addPlayer(new PlayerState("local_player", "LocalPlayer"));
    } catch (error) {
      console.error("Failed to initialize editor scene", error);
    }
  };

  e.setEditorMode(true);

  setupLevel();

  engineRef.current = e;

  if (pendingLevelLoadPathRef.current) {
    void loadLevelIntoEditorRef.current(pendingLevelLoadPathRef.current);
  }

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
    let cancelled = false;

    const loadProjectCatalog = async () => {
      try {
        const result = await fetchProjects();
        if (cancelled) {
          return;
        }

        setProjects(result);
        projectsRef.current = result;
        setProjectsLoaded(true);

        const lastProjectId = readLastProjectId();
        const lastProject = lastProjectId
          ? result.find((project) => project.id === lastProjectId) ?? null
          : null;

        if (lastProject) {
          const lastLevel = readLastLevelForProject(lastProject.id);
          const startup = resolveProjectLevelPath(lastProject, lastProject.startupLevel);
          const target = normalizeResourcePath(lastLevel ?? "") || startup || "";
          setProjectDialogSelectionId(lastProject.id);
          setProjectDialogLevelPath(target);
          setIsProjectDialogOpen(false);
          void applyProjectSelection(lastProject.id, target, { loadLevel: true });
          return;
        }

        const initialId = result[0]?.id ?? "";
        const initialProject = result[0] ?? null;
        const initialLevel = initialProject
          ? resolveProjectLevelPath(initialProject, initialProject.startupLevel) || (collectProjectLevelPaths(initialProject)[0] ?? "")
          : "";
        setProjectDialogSelectionId(initialId);
        setProjectDialogLevelPath(initialLevel);
        setIsProjectDialogOpen(true);
      } catch (error) {
        console.warn("Failed to load projects", error);
        if (!cancelled) {
          setProjects([]);
          setProjectsLoaded(true);
          setActiveProjectId(null);
          setProjectDialogSelectionId("");
          setProjectDialogLevelPath("");
          setIsProjectDialogOpen(true);
        }
      }
    };

    void loadProjectCatalog();

    return () => {
      cancelled = true;
    };
  }, []);

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
    const levels = collectProjectLevelPaths(activeProject);
    setAvailableLevels(levels);
    setPlayLevelPath((previous) => {
      const previousNormalized = normalizeResourcePath(previous ?? "");
      if (previousNormalized && levels.includes(previousNormalized)) {
        return previousNormalized;
      }
      const startup = resolveProjectLevelPath(activeProject, activeProject?.startupLevel);
      if (startup && levels.includes(startup)) {
        return startup;
      }
      return levels[0];
    });
  }, [activeProject]);

  const playLevelOptions = useMemo(() => {
    const options = new Set<string>(availableLevels);
    const startupPath = resolveProjectLevelPath(activeProject, activeProject?.startupLevel);
    if (startupPath) {
      options.add(startupPath);
    }
    if (activeLevelPath) {
      options.add(normalizeResourcePath(activeLevelPath));
    }
    return Array.from(options).sort();
  }, [availableLevels, activeLevelPath, activeProject]);

  const handleLoadSelectedMap = useCallback(async () => {
    const targetPath =
      normalizeResourcePath(playLevelPath ?? "") ||
      resolveProjectLevelPath(activeProject, activeProject?.startupLevel) ||
      normalizeResourcePath(activeLevelPath) ||
      playLevelOptions[0] ||
      "";
    if (!targetPath) {
      setStatusMessage("Select a level to load.");
      return;
    }
    await loadLevelIntoEditor(targetPath);
  }, [activeProject, playLevelPath, activeLevelPath, playLevelOptions, loadLevelIntoEditor]);

  const handlePlay = async () => {
    if (!engine) {
      return;
    }
    const targetPath = normalizeResourcePath(playLevelPath ?? "") || normalizeResourcePath(activeLevelPath);
    if (!targetPath) {
      setStatusMessage("Open a project and select a level before playing.");
      return;
    }
    editorInputRef.current?.dispose();
    editorInputRef.current = null;

    levelSnapshotRef.current = editorRef.current?.serializeLevel(engine.getCurrentLevel()!) ?? null;

    if (targetPath !== normalizeResourcePath(activeLevelPath)) {
      try {
        const projectPathForPlay =
          normalizeResourcePath(activeProject?.projectPath) || inferProjectPathFromLevelPath(targetPath);
        const levelData = await engine.loadLevel(targetPath);
        normalizeTileMapActorResourcePaths(levelData, projectPathForPlay);
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
  const dialogSelectedProject = projects.find((project) => project.id === projectDialogSelectionId) ?? null;
  const dialogStartupPath = resolveProjectLevelPath(dialogSelectedProject, dialogSelectedProject?.startupLevel);
  const dialogLevelOptions = useMemo(
    () => collectProjectLevelPaths(dialogSelectedProject),
    [dialogSelectedProject]
  );

  // Keep dialog's level selection consistent with the chosen project.
  useEffect(() => {
    if (!isProjectDialogOpen) return;
    if (!dialogSelectedProject) {
      if (projectDialogLevelPath !== "") setProjectDialogLevelPath("");
      return;
    }
    if (projectDialogLevelPath && dialogLevelOptions.includes(projectDialogLevelPath)) {
      return;
    }
    const lastSelected = readLastLevelForProject(dialogSelectedProject.id);
    const candidate =
      (lastSelected && dialogLevelOptions.includes(lastSelected) ? lastSelected : "") ||
      (dialogStartupPath && dialogLevelOptions.includes(dialogStartupPath) ? dialogStartupPath : "") ||
      dialogLevelOptions[0] ||
      "";
    setProjectDialogLevelPath(candidate);
  }, [isProjectDialogOpen, dialogSelectedProject, dialogLevelOptions, dialogStartupPath, projectDialogLevelPath]);

  const canCancelProjectDialog = activeProjectId !== null;
  const projectStatusLabel = activeProject ? activeProject.title : projectsLoaded ? "No project" : "Loading…";
  const levelStatusLabel = activeLevelPath ? humanizeLevelPath(activeLevelPath) : "—";

  const openProjectDialog = useCallback(
    (mode: "open" | "create" = "open") => {
      setProjectDialogMode(mode);
      setProjectDialogSelectionId(activeProjectId ?? projects[0]?.id ?? "");
      if (mode === "create") {
        setCreateProjectTitle("");
        setCreateProjectId("");
        setCreateProjectLevelName("main");
        setCreateProjectError(null);
      }
      setIsProjectDialogOpen(true);
    },
    [activeProjectId, projects]
  );

  const handleCreateProjectSubmit = useCallback(async () => {
    setCreateProjectError(null);
    const titleInput = createProjectTitle.trim();
    const idInput = createProjectId.trim() || titleInput;
    if (!titleInput) {
      setCreateProjectError("Title is required.");
      return;
    }
    if (!idInput) {
      setCreateProjectError("Project ID is required.");
      return;
    }
    setIsCreatingProject(true);
    try {
      const created = await createProject({
        id: idInput,
        title: titleInput,
        startupLevelName: createProjectLevelName.trim() || "main",
      });
      setProjects((previous) => {
        const next = previous.filter((p) => p.id !== created.id);
        next.push(created);
        next.sort((a, b) => a.id.localeCompare(b.id));
        projectsRef.current = next;
        return next;
      });
      const startupPath = resolveProjectLevelPath(created, created.startupLevel);
      setIsProjectDialogOpen(false);
      setStatusMessage(`Created project "${created.title}"`);
      void applyProjectSelection(created.id, startupPath, { loadLevel: true });
    } catch (error) {
      console.error("Failed to create project", error);
      setCreateProjectError(error instanceof Error ? error.message : "Failed to create project");
    } finally {
      setIsCreatingProject(false);
    }
  }, [createProjectTitle, createProjectId, createProjectLevelName, applyProjectSelection]);

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
          <ProjectScopeContext.Provider value={projectScopeValue}>
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
            {isProjectDialogOpen ? (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                <div className="w-[min(640px,92vw)] rounded-xl border border-cyan-300/40 bg-slate-900/95 p-5 shadow-2xl shadow-cyan-500/20">
                  <div className="flex items-center gap-2">
                    <button
                      className={`rounded px-3 py-1 text-xs uppercase tracking-wide transition-colors ${
                        projectDialogMode === "open"
                          ? "bg-cyan-500/20 text-cyan-100"
                          : "text-slate-400 hover:text-cyan-200"
                      }`}
                      onClick={() => setProjectDialogMode("open")}
                    >
                      Open
                    </button>
                    <button
                      className={`rounded px-3 py-1 text-xs uppercase tracking-wide transition-colors ${
                        projectDialogMode === "create"
                          ? "bg-fuchsia-500/20 text-fuchsia-100"
                          : "text-slate-400 hover:text-fuchsia-200"
                      }`}
                      onClick={() => {
                        setProjectDialogMode("create");
                        setCreateProjectError(null);
                      }}
                    >
                      Create New
                    </button>
                  </div>

                  {projectDialogMode === "open" ? (
                    <>
                      <h2 className="mt-3 text-lg font-semibold text-cyan-200">Open Project</h2>
                      <p className="mt-1 text-xs text-slate-300">
                        Choose a project and the level to open. Levels are scoped to the selected project.
                      </p>
                      <div className="mt-4 grid gap-4">
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-300">Project</label>
                          <select
                            className="w-full rounded border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
                            value={projectDialogSelectionId}
                            onChange={(e) => {
                              setProjectDialogSelectionId(e.target.value);
                              setProjectDialogLevelPath("");
                            }}
                          >
                            {projects.length === 0 ? <option value="">No projects found</option> : null}
                            {projects.map((project) => (
                              <option key={project.id} value={project.id}>{project.title}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-300">
                            Level{dialogStartupPath ? ` (startup: ${humanizeLevelPath(dialogStartupPath)})` : ""}
                          </label>
                          <select
                            className="w-full rounded border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-white/30 focus:outline-none disabled:opacity-50"
                            value={projectDialogLevelPath}
                            onChange={(e) => setProjectDialogLevelPath(e.target.value)}
                            disabled={dialogLevelOptions.length === 0}
                          >
                            {dialogLevelOptions.length === 0 ? (
                              <option value="">No levels found in project</option>
                            ) : null}
                            {dialogLevelOptions.map((path) => (
                              <option key={path} value={path}>
                                {humanizeLevelPath(path)}
                              </option>
                            ))}
                          </select>
                          {dialogLevelOptions.length > 0 ? (
                            <p className="mt-1 text-[10px] text-slate-400 truncate" title={projectDialogLevelPath}>
                              {projectDialogLevelPath}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-5 flex items-center justify-between gap-2">
                        <button
                          className="rounded border border-fuchsia-300/40 bg-fuchsia-500/10 px-3 py-1.5 text-xs text-fuchsia-100 hover:bg-fuchsia-500/20"
                          onClick={() => {
                            setProjectDialogMode("create");
                            setCreateProjectError(null);
                          }}
                        >
                          + Create New Project
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            className="rounded border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={() => setIsProjectDialogOpen(false)}
                            disabled={!canCancelProjectDialog}
                            title={canCancelProjectDialog ? "Cancel" : "Select a project to continue"}
                          >
                            Cancel
                          </button>
                          <button
                            className="rounded border border-cyan-300/40 bg-cyan-500/20 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!projectDialogSelectionId || !projectDialogLevelPath}
                            onClick={() => {
                              const projectId = projectDialogSelectionId || null;
                              const levelPath = projectDialogLevelPath || null;
                              setIsProjectDialogOpen(false);
                              void applyProjectSelection(projectId, levelPath, { loadLevel: true });
                            }}
                          >
                            Open
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <h2 className="mt-3 text-lg font-semibold text-fuchsia-200">Create New Project</h2>
                      <p className="mt-1 text-xs text-slate-300">
                        A new project folder will be created with an empty startup level.
                      </p>
                      <div className="mt-4 grid gap-4">
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-300">Title</label>
                          <input
                            className="w-full rounded border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
                            value={createProjectTitle}
                            onChange={(e) => setCreateProjectTitle(e.target.value)}
                            placeholder="My New Game"
                            autoFocus
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-300">
                            Project ID <span className="text-slate-500">(folder name; auto-derived from title if empty)</span>
                          </label>
                          <input
                            className="w-full rounded border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
                            value={createProjectId}
                            onChange={(e) => setCreateProjectId(e.target.value)}
                            placeholder="my-new-game"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-300">
                            Startup Level Name
                          </label>
                          <input
                            className="w-full rounded border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
                            value={createProjectLevelName}
                            onChange={(e) => setCreateProjectLevelName(e.target.value)}
                            placeholder="main"
                          />
                          <p className="mt-1 text-[10px] text-slate-400">
                            Will be created at <span className="text-slate-200">levels/{createProjectLevelName.trim() || "main"}.n2asset</span>
                          </p>
                        </div>
                        {createProjectError ? (
                          <div className="rounded border border-red-400/40 bg-red-500/10 px-2 py-2 text-xs text-red-200">
                            {createProjectError}
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-5 flex items-center justify-between gap-2">
                        <button
                          className="rounded border border-cyan-300/40 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-500/20"
                          onClick={() => setProjectDialogMode("open")}
                          disabled={isCreatingProject}
                        >
                          ← Back to Open
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            className="rounded border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={() => setIsProjectDialogOpen(false)}
                            disabled={!canCancelProjectDialog || isCreatingProject}
                          >
                            Cancel
                          </button>
                          <button
                            className="rounded border border-fuchsia-300/40 bg-fuchsia-500/20 px-3 py-1.5 text-xs text-fuchsia-100 hover:bg-fuchsia-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isCreatingProject || !createProjectTitle.trim()}
                            onClick={() => { void handleCreateProjectSubmit(); }}
                          >
                            {isCreatingProject ? "Creating…" : "Create Project"}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : null}
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
            <div className="flex items-center gap-2 ml-2 px-2 py-1 rounded border border-white/10 bg-white/5">
              <span className="text-[10px] uppercase tracking-wide text-slate-400">Project</span>
              <button
                className="text-xs text-cyan-200 hover:text-cyan-100 disabled:text-slate-500"
                onClick={() => openProjectDialog("open")}
                title="Open project picker"
              >
                {projectStatusLabel}
              </button>
              <button
                className="rounded border border-fuchsia-300/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-fuchsia-200 hover:bg-fuchsia-500/20"
                onClick={() => openProjectDialog("create")}
                title="Create new project"
              >
                + New
              </button>
              <span className="mx-1 h-4 w-px bg-white/10" />
              <span className="text-[10px] uppercase tracking-wide text-slate-400">Level</span>
              <select
                className="bg-transparent text-xs text-white focus:outline-none disabled:text-slate-500"
                value={normalizeResourcePath(playLevelPath ?? activeLevelPath ?? "")}
                onChange={(e) => {
                  const next = e.target.value;
                  setPlayLevelPath(next || undefined);
                  if (next) {
                    void loadLevelIntoEditor(next);
                  }
                }}
                disabled={!activeProject || playLevelOptions.length === 0 || isLevelLoading}
                title="Switch level"
              >
                {playLevelOptions.length === 0 ? (
                  <option value="">{activeProject ? "No levels in project" : "No project open"}</option>
                ) : null}
                {playLevelOptions.map((path) => (
                  <option key={path} value={path}>
                    {humanizeLevelPath(path)}
                  </option>
                ))}
              </select>
              {isLevelLoading ? <span className="text-[10px] text-amber-300">loading…</span> : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <IconButton icon={FolderOpen} tooltip="Load Map" onClick={() => { void handleLoadSelectedMap(); }} />
            <IconButton
              icon={Save}
              tooltip={isSaving ? "Saving..." : activeLevelPath ? "Save Map" : "No level loaded"}
              onClick={async () => {
                const activeEngine = engineRef.current;
                const editorInstance = editorRef.current;
                if (!activeEngine || !editorInstance) {
                  return;
                }

                const targetPath = normalizeResourcePath(activeLevelPath);
                if (!targetPath) {
                  setStatusMessage("Open a level before saving.");
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
                  let contentToSave = serializedLevel;
                  try {
                    const existingContent = await activeEngine.loadLevel(targetPath);
                    contentToSave = mergeSerializedLevelJson(editorInstance.serializeLevel(existingContent), serializedLevel);
                  } catch (contentError) {
                    console.warn("Unable to load existing level before save; saving editor state only.", contentError);
                  }
                  await saveResourceLevel(targetPath, contentToSave);
                  setStatusMessage(`Saved ${humanizeLevelPath(targetPath)}`);
                  console.log("Level saved", targetPath);
                } catch (err) {
                  console.error("Failed to save level", err);
                  setStatusMessage(`Failed to save ${humanizeLevelPath(targetPath)}`);
                } finally {
                  setIsSaving(false);
                }
              }}
              disabled={!engine || isSaving || !activeLevelPath}
            />
          </div>
        </div>

        {/* Status bar */}
        <div
          className="flex h-6 items-center gap-3 border-b px-4 text-[11px] text-slate-300"
          style={{
            backgroundColor: theme.panel,
            borderColor: "rgba(8, 247, 254, 0.15)",
          }}
        >
          <span className="text-slate-400">Project:</span>
          <span className="text-cyan-200">{projectStatusLabel}</span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">Level:</span>
          <span className="text-pink-200">{levelStatusLabel}</span>
          {statusMessage ? (
            <>
              <span className="text-slate-600">|</span>
              <span className="text-slate-300 truncate">{statusMessage}</span>
            </>
          ) : null}
          {isLevelLoading ? <span className="ml-auto text-amber-300">Loading level…</span> : null}
        </div>

        {/* Main Content Area with bottom console panel */}
        <div className="h-[calc(100vh-4.5rem)]">
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
          </ProjectScopeContext.Provider>
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
