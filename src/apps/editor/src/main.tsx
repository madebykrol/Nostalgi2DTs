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
} from "@repo/engine";
import { PlanckWorld } from "@repo/planckphysics";
import {
  ExampleTopDownRPGGameMode,
  GrasslandsMap,
  PlayerController,
} from "@repo/example";
import { loadResourceLevel, DEFAULT_LEVEL_PATH, saveResourceLevel } from "./services/resourceLoader";
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
  Engine,
} from "@repo/engine";
import { transformPropertiesPlugin } from "@repo/editor-plugins";
import sceneGraphPanelPlugin from "./plugins/sceneGraphPanelPlugin";
import actorPalettePlugin from "./plugins/actorPalettePlugin";
import simpleModalPlugin from "./plugins/simpleModalPlugin";
import meshComponentDesignerPlugin from "./plugins/meshComponentDesignerPlugin";
import assetBrowserPanelPlugin from "./plugins/assetBrowserPanelPlugin";
import spriteSheetEditorPlugin, { openSpriteSheetEditor } from "./plugins/spriteEditor/spriteSheetEditorPlugin";
import type { EditorUIPlugin } from "@repo/engine";
import consoleTabPlugin, { type ConsoleEntry, type ConsoleEntryType } from "./plugins/consoleTabPlugin";
import metricsTabPlugin from "./plugins/metricsTabPlugin";

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
import clone from "clone";
import { useEngineInitialization } from "./hooks/useEngineInitialization";

const App = () => {
  // const [engine, setEngine] = useState<ClientEngine | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [logs, setLogs] = useState<ConsoleEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [sceneGraph, setSceneGraph] = useState<SceneNode[]>([]);
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
      .withLevel(GrasslandsMap)
      .withResourceManager(DefaultResourceManager)
      .withDecoratedActors()
      .withPlayerController(PlayerController<WebSocket, http.IncomingMessage>)
      .withDebugLogging()
      .asSinglePlayer("LocalPlayer", "local_player")
      .build(ClientEngine)
  );

  const engine = init?.engine ?? null;
  const container = init?.container ?? null;


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

    const handleAssetDoubleClick = (asset: {
      path: string;
      assetType?: string;
      manifestType?: string;
      contentType?: string;
      containerPath?: string;
    }) => {
      const modalManager = modalManagerRef.current;
      if (!modalManager) {
        return;
      }

      const type = asset.assetType?.toLowerCase();
      const manifestType = asset.manifestType?.toLowerCase();
      const contentType = asset.contentType?.toLowerCase();

      const isSpriteLike =
        type === "sprite" ||
        type === "texture" ||
        manifestType === "sprite" ||
        manifestType === "texture" ||
        (contentType?.startsWith("image/"));

      if (!isSpriteLike) {
        return;
      }

      const assetPath = asset.containerPath ?? asset.path;
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
          const levelData = await loadResourceLevel(DEFAULT_LEVEL_PATH);
          console.log("Loaded level JSON", { bytes: levelData.length });
          const parsedLevel = editorRef.current?.deserializeLevel(levelData) ?? null;

          levelToLoad = parsedLevel;
          console.log("Loaded and parsed level data from resource API", levelData.length, "bytes");
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

  e.run(true);
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
  }, [engine, container, buildSceneGraph]);

  useEffect(() => {
    const registry = panelRegistryRef.current;
    const unsubscribe = registry.subscribe(() => {
      setPanelRevision((previous) => previous + 1);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const handlePlay = () => {
    if (!engine) {
      return;
    }
    editorInputRef.current?.dispose();
    editorInputRef.current = null;

    levelSnapshotRef.current = editorRef.current?.serializeLevel(engine.getCurrentLevel()!) ?? null;

    engine.run(false);
    
    setIsPlaying(true);
  };

  const handleStop = () => {
    if (!engine) {
      return;
    }
    engine.shutdown();
    engine.run(true);
    engine.loadLevelObject(editorRef.current?.deserializeLevel(levelSnapshotRef.current!)! ).then(() => {
  
    // Load level from current editing state
    if (inputManagerRef.current) {
      const responder = new EditorInputResponder(inputManagerRef.current, engine, editorRef.current!);
      responder.activate();
      editorInputRef.current = responder;
    }
    setIsPlaying(false);
    });

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
            <IconButton
              icon={Save}
              tooltip={isSaving ? "Saving..." : "Save Map"}
              onClick={async () => {
                if (!engineRef.current) return;
                const level = engineRef.current.getCurrentLevel();

                var serializedLevel = editorRef.current?.serializeLevel(level!);

                var level2 = editorRef.current?.deserializeLevel(serializedLevel!);
                if (!level) {
                  console.warn("No level loaded to save");
                  return;
                }
                setIsSaving(true);
                try {
                  await saveResourceLevel(DEFAULT_LEVEL_PATH, serializedLevel!);
                  console.log("Level saved", DEFAULT_LEVEL_PATH);
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
