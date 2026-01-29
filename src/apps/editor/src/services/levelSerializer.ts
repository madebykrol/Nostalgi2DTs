import { Actor, Level } from "@nostalgi2d/engine";
import { getRegisteredPropertiesForInstance } from "@nostalgi2d/engine";
import type { LevelData, LevelActorDefinition } from "./levelParser";

const stripSuffix = (value: string) => value.replace(/\d+$/, "");

const serializeActor = (actor: Actor): LevelActorDefinition => {
  const props: Record<string, unknown> = {};
  for (const entry of getRegisteredPropertiesForInstance(actor)) {
    const key = typeof entry.key === "string" ? entry.key : String(entry.key);
    try {
      props[key] = (actor as any)[entry.key];
    } catch (err) {
      // Skip unreadable properties
    }
  }

  const children = actor
    .getChildrenOfType(Actor)
    .map(serializeActor)
    .filter(Boolean);

  const def: LevelActorDefinition = {
    id: actor.getId(),
    type: stripSuffix(actor.constructor?.name ?? "Actor"),
    position: { x: actor.position.x, y: actor.position.y },
    rotation: actor.rotation,
    properties: Object.keys(props).length ? props : undefined,
    children: children.length ? children : undefined,
  };

  return def;
};

export const serializeLevelToJson = (level: Level): string => {
  const gravity = level.gravity;
  const gameModeCtor = (level as any).gameMode;

  const data: LevelData = {
    name: (level as any).name,
    gravity: gravity ? { x: (gravity as any).x, y: (gravity as any).y } : undefined,
    gameMode: gameModeCtor?.name,
    actors: level.getActors().map(serializeActor),
  };

  return JSON.stringify(data, null, 2);
};

