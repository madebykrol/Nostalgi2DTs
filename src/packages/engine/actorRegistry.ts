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
    ACTOR_REGISTRY.push({ ctor, id: id ?? ctor.name });
  };
}

/** Register all @actor-decorated classes into the container. */
export function registerDecoratedActors(container: Container) {
  for (const { ctor, id } of ACTOR_REGISTRY) {
    container.registerSelf(ctor, id);
  }
}
