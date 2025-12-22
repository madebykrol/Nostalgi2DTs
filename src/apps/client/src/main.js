import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { DOMParser } from "@xmldom/xmldom";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { Canvas } from "@repo/basicrenderer";
import { Header, Counter, EngineContext } from "@repo/ui";
import { Vector2, EngineBuilder, SoundManager, OrthoCamera, PlayerState, DefaultResourceManager, } from "@repo/engine";
import { PlanckWorld } from "@repo/planckphysics";
import { BombActor, DemoActor, ExampleTopDownRPGGameMode, GameTileMapActor, GrasslandsMap, PlayerController, WallActor } from "@repo/example";
import { Parser } from "@repo/tiler";
import { ClientEndpoint, ClientEngine, DefaultInputManager } from "@repo/client";
const App = () => {
    const ws = useRef(null);
    useEffect(() => {
        ws.current = new WebSocket("ws://localhost:3001/?userId=world");
        ws.current.addEventListener("open", () => {
            if (ws.current) {
                console.log("Sending data. We're open!");
                ws.current.send(JSON.stringify({ userid: "world" }));
            }
        });
        ws.current.addEventListener("message", (d) => console.log("msg:", JSON.stringify(d.data)));
    }, []);
    // Begin performance timing
    var startTime = performance.now();
    var builder = new EngineBuilder();
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
        .withPlayerController((PlayerController))
        .withDebugLogging()
        .asSinglePlayer("LocalPlayer", "local_player");
    const e = builder.build(ClientEngine);
    e.run(false);
    // Log time to startup
    const endTime = performance.now();
    console.log(`Engine built in ${(endTime - startTime).toFixed(4)} ms`);
    const [engine] = useState(e);
    const [level] = useState(new GrasslandsMap(builder.container));
    useEffect(() => {
        const demoActor = new DemoActor();
        demoActor.layer = 5;
        level.addActor(demoActor);
        const setupLevel = async () => {
            try {
                startTime = performance.now();
                // Begin performance timing
                await engine.loadLevelObject(level);
                const worldSize = level.getWorldSize();
                if (worldSize) {
                    const camera = new OrthoCamera(new Vector2(worldSize.x / 2, worldSize.y / 2), 1, 40);
                    engine.setCurrentCamera(camera);
                }
                else {
                    engine.setCurrentCamera(new OrthoCamera(new Vector2(0, 0), 1));
                }
                // Log time to load level 
                const endTime = performance.now();
                console.log(`Level loaded in ${(endTime - startTime).toFixed(2)} ms`);
            }
            catch (error) {
                console.error("Failed to initialize level", error);
            }
            engine.addPlayer(new PlayerState("local_player", "LocalPlayer"));
            console.log(engine.getLocalPlayerState());
            engine.getLocalPlayerState()?.getController()?.possess(demoActor);
        };
        setupLevel();
        return () => {
        };
    }, [engine, level]);
    const compile = (gl) => {
        if (gl) {
            engine.compileMaterials(gl);
        }
    };
    const draw = (gl) => {
        engine.tick();
        if (gl) {
            engine.render(gl);
        }
        engine.finishFrame();
    };
    return (_jsxs("div", { children: [_jsx(Header, { title: "Rendered Engine" }), _jsx("div", { className: "card w-full h-full relative flex-1 bg-gray-800", style: { width: "1500px", height: "100%" }, children: _jsx(Canvas, { compile: compile, draw: draw, options: { context: 'webgl2' }, className: "w-full h-full", style: { width: "1500px", height: "100%" } }) }), _jsx(EngineContext.Provider, { value: engine, children: _jsx(Counter, {}) })] }));
};
createRoot(document.getElementById("app")).render(_jsx(App, {}));
