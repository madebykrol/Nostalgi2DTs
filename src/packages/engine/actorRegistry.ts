import type { Constructor, Container } from "./utils";
import type { Actor } from "./world";

export type ActorRegistration = {
  ctor: Constructor<Actor>;
  id: string;
};

const ACTOR_REGISTRY: ActorRegistration[] = [];

/** Decorator to mark an Actor for auto-registration. */
export function actor(id?: string) {
  return function <T extends Constructor<Actor>>(ctor: T) {
    // If the class name was suffixed during bundling (e.g., Foo2), strip trailing digits for the default id.
    const defaultId = ctor.name.replace(/\d+$/, "");
    const resolvedId = id ?? defaultId;
    const alreadyRegistered = ACTOR_REGISTRY.some((entry) => entry.id === resolvedId);
    if (!alreadyRegistered) {
      ACTOR_REGISTRY.push({ ctor, id: resolvedId });
    }
  };
}

/** Register all @actor-decorated classes into the container. */
export function registerDecoratedActors(container: Container) {
  for (const { ctor, id } of ACTOR_REGISTRY) {
    container.registerSelf(ctor, id);
  }
}
