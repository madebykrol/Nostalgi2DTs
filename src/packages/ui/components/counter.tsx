import React, { useEffect, useState } from "react";

// import { actor, Actor, create, Engine, listTypes } from "@nostalgi2d/engine";
// import { Level } from "@nostalgi2d/engine";
// import { Vector2 } from "@nostalgi2d/engine";
// import { PlanckWorld } from "@nostalgi2d/planckphysics";
// import { BombActor, DemoActor } from "@nostalgi2d-projects/grasslands-demo";
// import { listRendererForActor } from "../../engine/actorRegistroy";
import { EngineContext } from "../contexts";
import { Vector2 } from "../../engine/math";

export const Counter = () => {

  const engine = React.useContext(EngineContext);
  const [fps, setFps] = useState(0);
  const [lastMousePosition, setLastMousePosition] = useState<Vector2>(new Vector2(0,0));

  useEffect(() => {
    if (!engine) {
      return;
    }

    const afterRenderHandle = engine.onAfterRender(() => {
      setFps(engine.getFPS());
      const localPlayerState = engine.getLocalPlayerState();
      if(localPlayerState) {
        const controller = localPlayerState.getController() as any;
        if(controller && controller.lastMousePosition) {
          setLastMousePosition(controller.lastMousePosition);
        }
      }

    });

    return () => {
      if (engine) {
        engine.offAfterRender(afterRenderHandle);
      }
    };
  }, [engine]);

  return (
    <>
      <p>FPS: {fps.toFixed(0)}, Actors: {engine?.getActorsCount()} Level: {engine?.getCurrentLevel()?.name} MousePos: {lastMousePosition.x.toFixed(2)}, {lastMousePosition.y.toFixed(2)}</p>
    </>
  );
};