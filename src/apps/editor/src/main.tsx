import { DOMParser } from "@xmldom/xmldom";
import http from "http";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { BaseActorRenderer, Canvas } from "@repo/basicrenderer";
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
import { Parser } from "@repo/tiler";
import { ClientEndpoint, ClientEngine, DefaultInputManager } from "@repo/client";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { FolderOpen, Play, Save, Square, Undo, Redo } from "lucide-react";
import { EditorInputResponder } from "./editorInputResponder";
import { Editor } from "../../../packages/engine/editor/editor";

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

// Neon color theme matching project site
const theme = {
  bg: "#070b14",
  panel: "rgba(14, 20, 35, 0.9)",
  text: "#e6f0ff",
  neon: {
    cyan: "#08f7fe",
    magenta: "#fe53bb",
    purple: "#9d4edd",
  },
};

type SceneNode = {
  id: string;
  name: string;
  children: SceneNode[];
};

type PropertyDragOptions = {
  shiftKey: boolean;
  altKey: boolean;
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

const App = () => {
  const [engine, setEngine] = useState<ClientEngine | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [logs, setLogs] = useState<ConsoleEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [leftTab, setLeftTab] = useState<"layers" | "scene">("layers");
  const [hoveredTab, setHoveredTab] = useState<"layers" | "scene" | null>(null);
  const [sceneGraph, setSceneGraph] = useState<SceneNode[]>([]);
  const engineInitialized = useRef(false);
  const engineRef = useRef<ClientEngine | null>(null);
  const inputManagerRef = useRef<InputManager | null>(null);
  const editorInputRef = useRef<EditorInputResponder | null>(null);
  const logIdRef = useRef(0);
  const editorRef = useRef<Editor | null>(null);

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
        children,
      };
    };
    return rootActors.map(traverse);
  }, []);

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

    const inputManager = builder.container.get(InputManager);
    if (!inputManager) {
      console.warn("Editor failed to resolve InputManager instance");
    }
    inputManagerRef.current = inputManager;

    editorRef.current = new Editor(e);
    editorRef.current.initialize();
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
      editorInputRef.current?.dispose();
      editorInputRef.current = null;
      e.offAfterRender(afterRenderId);
      engineRef.current = null;
    };
  }, [buildSceneGraph]);

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

  const getTabHighlightStyle = (tab: "layers" | "scene") =>
    hoveredTab === tab
      ? {
          backgroundImage:
            "linear-gradient(to right, rgba(254,83,187,0.28) 1px, transparent 1px)," +
            "linear-gradient(to bottom, rgba(254,83,187,0.28) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
          boxShadow: "0 0 10px rgba(254, 83, 187, 0.22)",
          color: "#f6ddff",
        }
      : undefined;

  return (
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
            <MenuButton label="Tools" />
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
                    <div className="flex border-b text-xs uppercase tracking-wide" style={{ borderColor: "rgba(8, 247, 254, 0.3)" }}>
                      <button
                        className={`flex-1 py-2 transition-colors ${leftTab === "layers" ? "bg-black/30 text-cyan-300" : "text-slate-400"}`}
                        onClick={() => setLeftTab("layers")}
                        onMouseEnter={() => setHoveredTab("layers")}
                        onMouseLeave={() => setHoveredTab(null)}
                        style={getTabHighlightStyle("layers")}
                      >
                        Layers
                      </button>
                      <button
                        className={`flex-1 py-2 transition-colors ${leftTab === "scene" ? "bg-black/30 text-pink-300" : "text-slate-400"}`}
                        onClick={() => setLeftTab("scene")}
                        onMouseEnter={() => setHoveredTab("scene")}
                        onMouseLeave={() => setHoveredTab(null)}
                        style={getTabHighlightStyle("scene")}
                      >
                        Scene
                      </button>
                    </div>
                  </div>
                  <div className="relative z-10 flex-1 overflow-y-auto p-4">
                    {leftTab === "layers" ? (
                      <div className="space-y-2">
                        <LayerItem name="Background" active={false} />
                        <LayerItem name="Terrain" active={false} />
                        <LayerItem name="Objects" active={true} />
                        <LayerItem name="Entities" active={false} />
                        <LayerItem name="UI" active={false} />
                      </div>
                    ) : (
                      <SceneGraphTree nodes={sceneGraph} editor={editorRef.current} />
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
                    {engine && (
                      <EngineContext.Provider value={engine}>
                        <Canvas compile={compile} draw={draw} options={{ context: "webgl2" }} className="w-full h-full" />
                      </EngineContext.Provider>
                    )}
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
                  <div className="p-4 relative z-10">
                    <h3
                      className="text-sm font-semibold mb-3"
                      style={{ color: theme.neon.magenta }}
                    >
                      Properties
                    </h3>
                    <ActorProperties editor={editorRef.current} />
                    <div className="space-y-3">
                    </div>
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
    </div>
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
const MenuButton = ({ label }: { label: string }) => (
  <button
    className="px-3 py-1.5 text-xs rounded-lg transition-all border border-transparent hover:border-cyan-400/30 hover:bg-cyan-400/10"
    style={{ color: theme.text }}
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

const ActorProperties = ({ editor }: { editor: Editor | null }) => {
  const [selectedActor, setSelectedActor] = useState<Actor | null>(null);
  const [snapshot, setSnapshot] = useState<
    | {
        id: string;
        type: string;
        posX: string;
        posY: string;
        rotation: string;
        scale: string;
      }
    | null
  >(null);

  const adjustForParent = useCallback((actor: Actor, nextWorld: Vector2): Vector2 => {
    const parent = actor.getParent();
    if (parent instanceof Actor) {
      const parentWorld = parent.getPosition();
      return new Vector2(nextWorld.x - parentWorld.x, nextWorld.y - parentWorld.y);
    }
    return nextWorld;
  }, []);

  const getPositionStep = useCallback((options: PropertyDragOptions) => {
    if (options.shiftKey) {
      return 1;
    }
    if (options.altKey) {
      return 0.01;
    }
    return 0.1;
  }, []);

  const getRotationStep = useCallback((options: PropertyDragOptions) => {
    if (options.shiftKey) {
      return 5;
    }
    if (options.altKey) {
      return 0.1;
    }
    return 1;
  }, []);

  const handlePositionXDrag = useCallback(
    (deltaPixels: number, options: PropertyDragOptions) => {
      const actor = selectedActor;
      if (!actor || deltaPixels === 0) {
        return;
      }

      const worldPosition = actor.getPosition();
      const nextWorld = new Vector2(worldPosition.x + deltaPixels * getPositionStep(options), worldPosition.y);
      actor.setPosition(adjustForParent(actor, nextWorld));
    },
    [adjustForParent, getPositionStep, selectedActor]
  );

  const handlePositionYDrag = useCallback(
    (deltaPixels: number, options: PropertyDragOptions) => {
      const actor = selectedActor;
      if (!actor || deltaPixels === 0) {
        return;
      }

      const worldPosition = actor.getPosition();
      const nextWorld = new Vector2(worldPosition.x, worldPosition.y + deltaPixels * getPositionStep(options));
      actor.setPosition(adjustForParent(actor, nextWorld));
    },
    [adjustForParent, getPositionStep, selectedActor]
  );

  const handleRotationDrag = useCallback(
    (deltaPixels: number, options: PropertyDragOptions) => {
      const actor = selectedActor;
      if (!actor || deltaPixels === 0) {
        return;
      }

      const radiansPerPixel = (getRotationStep(options) * Math.PI) / 180;
      actor.setRotation(actor.getRotation() + deltaPixels * radiansPerPixel);
    },
    [getRotationStep, selectedActor]
  );

  const handlePositionXCommit = useCallback(
    (nextValue: string) => {
      const actor = selectedActor;
      if (!actor) {
        return false;
      }

      const parsed = Number.parseFloat(nextValue);
      if (Number.isNaN(parsed)) {
        return false;
      }

      const worldPosition = actor.getPosition();
      const nextWorld = new Vector2(parsed, worldPosition.y);
      actor.setPosition(adjustForParent(actor, nextWorld));
      return true;
    },
    [adjustForParent, selectedActor]
  );

  const handlePositionYCommit = useCallback(
    (nextValue: string) => {
      const actor = selectedActor;
      if (!actor) {
        return false;
      }

      const parsed = Number.parseFloat(nextValue);
      if (Number.isNaN(parsed)) {
        return false;
      }

      const worldPosition = actor.getPosition();
      const nextWorld = new Vector2(worldPosition.x, parsed);
      actor.setPosition(adjustForParent(actor, nextWorld));
      return true;
    },
    [adjustForParent, selectedActor]
  );

  const handleRotationCommit = useCallback(
    (nextValue: string) => {
      const actor = selectedActor;
      if (!actor) {
        return false;
      }

      const parsed = Number.parseFloat(nextValue);
      if (Number.isNaN(parsed)) {
        return false;
      }

      actor.setRotation((parsed * Math.PI) / 180);
      return true;
    },
    [selectedActor]
  );

  useEffect(() => {
    if (!editor) {
      return;
    }

    const handleSelection = (actor: Actor | null) => {
      setSelectedActor(actor ?? null);
    };
    editor.subscribe("actor:selected", handleSelection);

    return () => {
      editor.unsubscribe("actor:selected", handleSelection);
    };
  }, [editor]);

  useEffect(() => {
    if (!selectedActor) {
      setSnapshot(null);
      return;
    }

    let animationFrame = 0;

    const updateSnapshot = () => {
      const position = selectedActor.getPosition();
      const rotationRadians = selectedActor.getRotation();
      const rotationDegrees = (rotationRadians * 180) / Math.PI;

      const nextSnapshot = {
        id: selectedActor.getId(),
        type: selectedActor.constructor?.name ?? "",
        posX: position.x.toFixed(2),
        posY: position.y.toFixed(2),
        rotation: rotationDegrees.toFixed(2),
        scale: "1.00, 1.00",
      };

      setSnapshot((previous) => {
        if (
          previous &&
          previous.id === nextSnapshot.id &&
          previous.posX === nextSnapshot.posX &&
          previous.posY === nextSnapshot.posY &&
          previous.rotation === nextSnapshot.rotation &&
          previous.scale === nextSnapshot.scale &&
          previous.type === nextSnapshot.type
        ) {
          return previous;
        }
        return nextSnapshot;
      });

      animationFrame = requestAnimationFrame(updateSnapshot);
    };

    updateSnapshot();

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [selectedActor]);

  return (
    <div className="space-y-3">
      <PropertyRow label="Actor ID" value={snapshot?.id ?? ""} />
      <PropertyRow label="Actor Type" value={snapshot?.type ?? ""} />
      <PropertyRow
        label="Position X"
        value={snapshot?.posX ?? ""}
        onDrag={handlePositionXDrag}
        onCommit={handlePositionXCommit}
      />
      <PropertyRow
        label="Position Y"
        value={snapshot?.posY ?? ""}
        onDrag={handlePositionYDrag}
        onCommit={handlePositionYCommit}
      />
      <PropertyRow
        label="Rotation (deg)"
        value={snapshot?.rotation ?? ""}
        onDrag={handleRotationDrag}
        onCommit={handleRotationCommit}
      />
      <PropertyRow label="Scale" value={snapshot?.scale ?? ""} />
    </div>
  );
};

const SceneGraphTree = ({ nodes, depth = 0, editor }: { nodes: SceneNode[]; depth?: number, editor: Editor | null }) => {
  
  const [selectedActor, setSelectedActor] = useState<Actor | null>(null);

  if (!nodes.length) {
    return depth === 0 ? (
      <div className="text-xs text-slate-400">No actors loaded.</div>
    ) : null;
  }

  useEffect(() => {
    if (!editor) {
      return;
    }

    const handleSelection = (actor: Actor | null) => {
      setSelectedActor(actor ?? null);
    };
    editor.subscribe("actor:selected", handleSelection);

    return () => {
      editor.unsubscribe("actor:selected", handleSelection);
    };
  }, [editor]);

  return (
    <div className="space-y-1">
      {nodes.map((node) => (
        <div key={node.id}>
          <div
            className="flex items-center justify-between rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs"
            style={{
              paddingLeft: depth * 12 + 8,
              color: theme.text,
            }}
          >
            <span>{node.name} {selectedActor?.getId() === node.id && "(Selected)"}</span>
            {node.children.length > 0 && (
              <span className="text-[10px] text-slate-400">{node.children.length}</span>
            )}
          </div>
          {node.children.length > 0 && <SceneGraphTree nodes={node.children} depth={depth + 1} editor={ editor } />}
        </div>
      ))}
    </div>
  );
};

const LayerItem = ({ name, active }: { name: string; active: boolean }) => (
  <div
    className={`px-3 py-2 rounded-lg text-xs cursor-pointer transition-all ${
      active ? "border-cyan-400/50 bg-cyan-400/10" : "border-white/10 hover:bg-white/5"
    }`}
    style={{
      color: active ? theme.neon.cyan : theme.text,
      borderWidth: "1px",
      borderStyle: "solid",
    }}
  >
    {name}
  </div>
);

const PropertyRow = ({
  label,
  value,
  onDrag,
  onCommit,
}: {
  label: string;
  value: string;
  onDrag?: (deltaPixels: number, options: PropertyDragOptions) => void;
  onCommit?: (nextValue: string) => boolean;
}) => {
  const [draft, setDraft] = useState(value);
  const [isEditing, setIsEditing] = useState(false);
  const dragActiveRef = useRef(false);

  useEffect(() => {
    if (!isEditing) {
      setDraft(value);
    }
  }, [value, isEditing]);

  const commitDraft = () => {
    if (!onCommit) {
      return;
    }
    const success = onCommit(draft);
    if (!success) {
      setDraft(value);
    }
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLInputElement>) => {
    if (!onDrag || event.button !== 0) {
      return;
    }

    const input = event.currentTarget;
    const originalCursor = document.body.style.cursor;
    const originalUserSelect = document.body.style.userSelect;
    const startX = event.clientX;
    let lastX = event.clientX;
    let isDragging = false;

    const beginDrag = (moveEvent: MouseEvent) => {
      if (isDragging) {
        return;
      }
      isDragging = true;
      dragActiveRef.current = true;
      setIsEditing(false);
      input.blur();
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
      input.style.cursor = "ew-resize";
      lastX = moveEvent.clientX;
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging) {
        const deltaFromStart = moveEvent.clientX - startX;
        if (Math.abs(deltaFromStart) < 2) {
          return;
        }
        beginDrag(moveEvent);
      }

      if (!isDragging) {
        return;
      }

      const delta = moveEvent.clientX - lastX;
      if (delta !== 0) {
        onDrag(delta, { shiftKey: moveEvent.shiftKey, altKey: moveEvent.altKey });
        lastX = moveEvent.clientX;
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);

      if (isDragging) {
        document.body.style.cursor = originalCursor;
        document.body.style.userSelect = originalUserSelect;
        input.style.cursor = "";
      }

      dragActiveRef.current = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleChange = (event: ReactChangeEvent<HTMLInputElement>) => {
    if (!onCommit) {
      return;
    }
    setDraft(event.target.value);
  };

  const handleFocus = () => {
    if (!onCommit) {
      return;
    }
    setIsEditing(true);
  };

  const handleBlur = () => {
    if (!onCommit) {
      return;
    }
    if (dragActiveRef.current) {
      dragActiveRef.current = false;
      setIsEditing(false);
      return;
    }
    if (isEditing) {
      commitDraft();
    }
    setIsEditing(false);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!onCommit) {
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      commitDraft();
      setIsEditing(false);
      (event.currentTarget as HTMLInputElement).blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDraft(value);
      setIsEditing(false);
      (event.currentTarget as HTMLInputElement).blur();
    }
  };

  const title = onCommit
    ? onDrag
      ? "Drag horizontally or enter a value"
      : "Enter a value"
    : onDrag
      ? "Drag horizontally to adjust"
      : undefined;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs" style={{ color: theme.text }}>
        {label}
      </label>
      <input
        type="text"
        value={onCommit ? draft : value}
        className="px-2 py-1 text-xs rounded border bg-black/30 outline-none focus:border-magenta-400/50"
        style={{
          color: theme.text,
          borderColor: "rgba(254, 83, 187, 0.2)",
        }}
        readOnly={!onCommit}
        onMouseDown={onDrag ? handleMouseDown : undefined}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        inputMode="decimal"
        title={title}
      />
    </div>
  );
};

createRoot(document.getElementById("app")!).render(<App />);
