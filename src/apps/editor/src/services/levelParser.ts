import { Actor, Container, Level, Vector2 } from "@repo/engine";
import type { Constructor, GameMode } from "@repo/engine";
import { TileMapActor } from "@repo/tiler";

export type LevelActorDefinition = {
  id?: string;
  type: string;
  name?: string;
  position?: { x: number; y: number };
  rotation?: number;
  properties?: Record<string, unknown>;
  children?: LevelActorDefinition[];
};

export type LevelData = {
  name?: string;
  gravity?: { x: number; y: number };
  actors?: LevelActorDefinition[];
  gameMode?: string;
};

/**
 * Simple Level subclass that exposes gravity setter for parsed data.
 */
class ParsedLevel extends Level {

  private gameModeType: Constructor<GameMode> | undefined;
  applyGravity(vec: Vector2): void {
    // setGravity is protected on Level
    (this as any).setGravity(vec);
  }
  setGameMode(gameMode: Constructor<GameMode> | undefined): void {
    this.gameModeType = gameMode;
  }
  getGameMode(): Constructor<GameMode> | undefined {
    return this.gameModeType;
  }
}

const ACTOR_TYPE_ALIASES: Record<string, string> = {
  TileMapActor: "GameTileMapActor",
};

function resolveActorConstructor(type: string, container: Container): Constructor<Actor> {
  const alias = ACTOR_TYPE_ALIASES[type] ?? type;
  const ctor = container.getTypeForIdentifier(alias) as Constructor<Actor> | null;
  if (!ctor) {
    throw new Error(`Unknown actor type: ${type}`);
  }
  return ctor;
}

function instantiateActor(def: LevelActorDefinition, container: Container): Actor {
  const actor = container.getByIdentifier(def.type) as Actor;

  if (def.properties) {
    actor.applyProperties(def.properties);
  }

  if (def.position) {
    actor.position = new Vector2(def.position.x, def.position.y);
  }

  if (actor instanceof TileMapActor && def.properties?.mapUrl) {
    actor.mapUrl = def.properties.mapUrl as string;
  }

  (actor as any).persistable = true;
  return actor;
}

export function parseLevelFromJson(json: string, container: Container): Level {
  const data = JSON.parse(json) as LevelData;

  const level = new ParsedLevel();
  level.setGameMode(container.getTypeForIdentifier(data.gameMode as string) as Constructor<GameMode> | undefined);
  level.name = data.name ?? level.name;

  if (data.gravity) {
    level.applyGravity(new Vector2(data.gravity.x, data.gravity.y));
  }

  const actors = data.actors ?? [];
  for (const actorDef of actors) {
    if (!actorDef.type) {
      console.warn("Skipping actor with missing type", actorDef);
      continue;
    }
    try {
      const actor = instantiateActor(actorDef, container);
      level.addActor(actor);
    } catch (err) {
      console.error(`Failed to instantiate actor '${actorDef.type}':`, err);
    }
  }

  return level;
}

