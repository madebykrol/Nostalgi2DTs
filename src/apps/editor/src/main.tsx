import { DOMParser } from "@xmldom/xmldom";
import http from "http";
import { useEffect, useRef, useState } from "react";
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
  WallActorRenderer,
} from "@repo/example";
import { Parser, TileMapActorRenderer } from "@repo/tiler";
import { ClientEndpoint, ClientEngine, DefaultInputManager } from "@repo/client";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Menu, Layers, Settings, FileEdit, Save, FolderOpen } from "lucide-react";

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

const App = () => {
  const [engine, setEngine] = useState<ClientEngine | null>(null);
  const engineInitialized = useRef(false);

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
      .withDefaultRenderer(BaseActorRenderer)
      .withInputManager(DefaultInputManager)
      .withSoundManager(SoundManager)
      .withGameMode(ExampleTopDownRPGGameMode)
      .withResourceManager(DefaultResourceManager)
      .withActor(DemoActor)
      .withActor(GameTileMapActor, TileMapActorRenderer)
      .withActor(BombActor)
      .withActor(WallActor, WallActorRenderer)
      .withPlayerController(PlayerController<WebSocket, http.IncomingMessage>)
      .withDebugLogging()
      .asSinglePlayer("LocalPlayer", "local_player");

    const e = builder.build(ClientEngine);
    e.startup();

    // Log time to startup
    const endTime = performance.now();
    console.log(`Engine built in ${(endTime - startTime).toFixed(4)} ms`);

    const newLevel = new GrasslandsMap(builder.container);
    setEngine(e);

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
  }, []);

  const draw = (gl: WebGL2RenderingContext | null) => {
    if (!engine) return;

    engine.tick();

    if (gl) {
      engine.render(gl);
    }

    engine.finishFrame();
  };

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
        <div className="flex items-center gap-3 flex-1">
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
            <MenuButton icon={FileEdit} label="File" />
            <MenuButton icon={Menu} label="Edit" />
            <MenuButton icon={Layers} label="View" />
            <MenuButton icon={Settings} label="Tools" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <IconButton icon={FolderOpen} tooltip="Open Map" />
          <IconButton icon={Save} tooltip="Save Map" />
        </div>
      </div>

      {/* Main Content Area with 3 Panels */}
      <div className="h-[calc(100vh-3rem)]">
        <PanelGroup direction="horizontal">
          {/* Left Panel (1/5th) */}
          <Panel defaultSize={20} minSize={10} maxSize={30}>
            <div
              className="h-full border-r overflow-y-auto"
              style={{
                backgroundColor: theme.panel,
                borderColor: "rgba(8, 247, 254, 0.2)",
              }}
            >
              <div className="p-4">
                <h3
                  className="text-sm font-semibold mb-3"
                  style={{ color: theme.neon.cyan }}
                >
                  Layers
                </h3>
                <div className="space-y-2">
                  <LayerItem name="Background" active={false} />
                  <LayerItem name="Terrain" active={false} />
                  <LayerItem name="Objects" active={true} />
                  <LayerItem name="Entities" active={false} />
                  <LayerItem name="UI" active={false} />
                </div>
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="w-1 hover:w-2 transition-all" style={{ backgroundColor: "rgba(8, 247, 254, 0.3)" }} />

          {/* Center Panel (3/5th) - Engine Canvas */}
          <Panel defaultSize={60} minSize={40}>
            <div className="h-full flex flex-col" style={{ backgroundColor: theme.bg }}>
              <div className="flex-1 flex items-center justify-center">
                {engine && (
                  <EngineContext.Provider value={engine}>
                    <Canvas draw={draw} options={{ context: "webgl2" }} />
                  </EngineContext.Provider>
                )}
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="w-1 hover:w-2 transition-all" style={{ backgroundColor: "rgba(254, 83, 187, 0.3)" }} />

          {/* Right Panel (1/5th) */}
          <Panel defaultSize={20} minSize={10} maxSize={30}>
            <div
              className="h-full border-l overflow-y-auto"
              style={{
                backgroundColor: theme.panel,
                borderColor: "rgba(254, 83, 187, 0.2)",
              }}
            >
              <div className="p-4">
                <h3
                  className="text-sm font-semibold mb-3"
                  style={{ color: theme.neon.magenta }}
                >
                  Properties
                </h3>
                <div className="space-y-3">
                  <PropertyRow label="Position X" value="0" />
                  <PropertyRow label="Position Y" value="0" />
                  <PropertyRow label="Rotation" value="0°" />
                  <PropertyRow label="Scale" value="1.0" />
                </div>
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
};

// Helper Components
const MenuButton = ({ label }: { icon: React.ComponentType<{ className?: string }>; label: string }) => (
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

const PropertyRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs" style={{ color: theme.text }}>
      {label}
    </label>
    <input
      type="text"
      value={value}
      className="px-2 py-1 text-xs rounded border bg-black/30 outline-none focus:border-magenta-400/50"
      style={{
        color: theme.text,
        borderColor: "rgba(254, 83, 187, 0.2)",
      }}
      readOnly
    />
  </div>
);

createRoot(document.getElementById("app")!).render(<App />);
