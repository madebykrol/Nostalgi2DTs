import { useEffect, useRef, useState } from "react";
import { DOMParser } from "@xmldom/xmldom";
import http from "http";
import {
  EngineBuilder,
  SoundManager,
  DefaultResourceManager,
  type Container,
} from "@repo/engine";
import { PlanckWorld } from "@repo/planckphysics";
import {
  BombActor,
  DemoActor,
  ExampleTopDownRPGGameMode,
  GameTileMapActor,
  PlayerController,
  WallActor,
} from "@repo/example";
import { Parser } from "@repo/tiler";
import { ClientEndpoint, ClientEngine, DefaultInputManager } from "@repo/client";

export const useEngineInitialization = () => {
  const [engine, setEngine] = useState<ClientEngine | null>(null);
  const [container, setContainer] = useState<Container | null>(null);
  const engineInitialized = useRef(false);

  useEffect(() => {
    if (engineInitialized.current) {
      return;
    }
    engineInitialized.current = true;

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
      .withPlayerController(PlayerController<WebSocket, http.IncomingMessage>)
      .withDebugLogging()
      .asSinglePlayer("EditorPlayer", "editor_player");

    const engineInstance = builder.build(ClientEngine);
    engineInstance.run(false);

    setEngine(engineInstance);
    setContainer(builder.container);
  }, []);

  return { engine, container };
};
