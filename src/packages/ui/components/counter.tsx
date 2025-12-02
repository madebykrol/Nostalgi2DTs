import React, { useEffect, useState } from "react";

// import { actor, Actor, create, Engine, listTypes } from "@repo/engine";
// import { Level } from "@repo/engine";
// import { Vector2 } from "@repo/engine";
// import { PlanckWorld } from "@repo/planckphysics";
// import { BombActor, DemoActor } from "@repo/example";
// import { listRendererForActor } from "../../engine/actorRegistroy";
import { EngineContext } from "../contexts";
import { Vector2 } from "../../engine/math";

export const Counter = () => {

  const engine = React.useContext(EngineContext);
  const [fps, setFps] = useState(0);
  const [lastMousePosition, setLastMousePosition] = useState<Vector2>(new Vector2(0,0));

  useEffect(() => {
    const afterRenderHandle = engine!.onAfterRender(() => {
      setFps(engine!.getFPS());
      const localPlayerState = engine!.getLocalPlayerState();
      if(localPlayerState) {
        const controller = localPlayerState.getController() as any;
        if(controller && controller.lastMousePosition) {
          setLastMousePosition(controller.lastMousePosition);
        }
      }
    });

    return () => engine!.offAfterRender(afterRenderHandle);
  }, [engine]);

  return (
    <>
      <p>FPS: {fps.toFixed(0)}, Actors: {engine?.getActorsCount()} Level: {engine?.getCurrentLevel()?.name} MousePos: {lastMousePosition.x.toFixed(2)}, {lastMousePosition.y.toFixed(2)}</p>
    </>
  );
};