import { normalizeClassName, type Constructor, type Container } from "./utils";
import type { Actor } from "./world";

export type ActorRegistration = {
  ctor: Constructor<Actor>;
  id: string;
};

type ActorRegistryHost = typeof globalThis & {
  nostalgiActorRegistry?: ActorRegistration[];
};

export type ObjectRegistration = {
  ctor: Constructor<Object>;
  id: string;
};

type ObjectRegistryHost = typeof globalThis & {
  nostalgiObjectRegistry?: ObjectRegistration[];
};

function getActorRegistry(): ActorRegistration[] {
  const host = globalThis as ActorRegistryHost;
  if (!host.nostalgiActorRegistry) {
    host.nostalgiActorRegistry = [];
  }
  return host.nostalgiActorRegistry;
}

function getObjectRegistry(): ObjectRegistration[] {
  const host = globalThis as ObjectRegistryHost;
  if (!host.nostalgiObjectRegistry) {
    host.nostalgiObjectRegistry = [];
  }
  return host.nostalgiObjectRegistry;
}

/** Decorator to mark an Actor for auto-registration. */
export function actor(id?: string) {
  return function <T extends Constructor<Actor>>(ctor: T) {
    const registry = getActorRegistry();
    // If the class name was suffixed during bundling (e.g., Foo2), strip trailing digits for the default id.
    const defaultId = normalizeClassName(ctor.name);
    const resolvedId = id ?? defaultId;
    const alreadyRegistered = registry.some((entry) => entry.id === resolvedId);
    if (!alreadyRegistered) {
      registry.push({ ctor, id: resolvedId });
    }
  };
}

/** Register all @actor-decorated classes into the container. */
export function registerDecoratedActors(container: Container) {
  for (const { ctor, id } of getActorRegistry()) {
    container.registerSelf(ctor, id);
  }
}


/** Decorator to mark an Object for auto-registration. */
export function registerNObjects(container: Container) {
  for (const { ctor, id } of getObjectRegistry()) {
    container.registerSelf(ctor, id);
  }
}

export function nobject(id?: string) {
  return function <T extends Constructor<Object>>(ctor: T) {
    const registry = getObjectRegistry();
    const defaultId = normalizeClassName(ctor.name);
    const resolvedId = id ?? defaultId;
    const alreadyRegistered = registry.some((entry) => entry.id === resolvedId);
    if (!alreadyRegistered) {
      registry.push({ ctor, id: resolvedId });
    }
  }
}
