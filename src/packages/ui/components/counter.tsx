import React, { useEffect, useState } from "react";

// import { actor, Actor, create, Engine, listTypes } from "@repo/engine";
// import { Level } from "@repo/engine";
// import { Vector2 } from "@repo/engine";
// import { PlanckWorld } from "@repo/planckphysics";
// import { BombActor, DemoActor } from "@repo/example";
// import { listRendererForActor } from "../../engine/actorRegistroy";
import { EngineContext } from "../contexts";

export const Counter = () => {

  const engine = React.useContext(EngineContext);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    const afterRenderHandle = engine!.onAfterRender(() => {
      setFps(engine!.getFPS());
    });

    return () => engine!.offAfterRender(afterRenderHandle);
  }, [engine]);

  return (
    <>
      <p>FPS: {fps.toFixed(0)}, Actors: {engine?.getActorsCount()} Level: {engine?.getCurrentLevel()?.name}</p>
    </>
  );
};