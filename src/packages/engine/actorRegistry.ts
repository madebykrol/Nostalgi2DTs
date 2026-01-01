import type { Constructor, Container } from "./utils";
import type { Actor } from "./world";

export type ActorRegistration = {
  ctor: Constructor<Actor>;
  id: string;
};

type ActorRegistryHost = typeof globalThis & {
  __nostalgi_actor_registry__?: ActorRegistration[];
};

function getActorRegistry(): ActorRegistration[] {
  const host = globalThis as ActorRegistryHost;
  if (!host.__nostalgi_actor_registry__) {
    host.__nostalgi_actor_registry__ = [];
  }
  return host.__nostalgi_actor_registry__;
}

/** Decorator to mark an Actor for auto-registration. */
export function actor(id?: string) {
  return function <T extends Constructor<Actor>>(ctor: T) {
    const registry = getActorRegistry();
    // If the class name was suffixed during bundling (e.g., Foo2), strip trailing digits for the default id.
    const defaultId = ctor.name.replace(/\d+$/, "");
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
