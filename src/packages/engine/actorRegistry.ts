import { normalizeClassName, type Constructor, type Container } from "./utils";
import type { Actor } from "./world";

export type ActorRegistration = {
  ctor: Constructor<Actor>;
  id: string;
};

type ActorRegistryHost = typeof globalThis & {
  __nostalgi_actor_registry__?: ActorRegistration[];
};

export type ObjectRegistration = {
  ctor: Constructor<Object>;
  id: string;
};

type ObjectRegistryHost = typeof globalThis & {
  __nostalgi_object_registry__?: ObjectRegistration[];
};

function getActorRegistry(): ActorRegistration[] {
  const host = globalThis as ActorRegistryHost;
  if (!host.__nostalgi_actor_registry__) {
    host.__nostalgi_actor_registry__ = [];
  }
  return host.__nostalgi_actor_registry__;
}

function getObjectRegistry(): ObjectRegistration[] {
  const host = globalThis as ObjectRegistryHost;
  if (!host.__nostalgi_object_registry__) {
    host.__nostalgi_object_registry__ = [];
  }
  return host.__nostalgi_object_registry__;
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
