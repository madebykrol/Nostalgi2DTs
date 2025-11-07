import { Actor } from ".";
import { ActorRenderer } from "./rendering/renderer";

type AnyCtor = new (...a: any[]) => any;
const globalActorRegistry = new Map<string, AnyCtor>();
const globalActorRendererRegistry = new Map<any, ActorRenderer<any>>();

export function actor() {
  return function <T extends AnyCtor>(ctor: T, _context?: ClassDecoratorContext) {
    globalActorRegistry.set(ctor.name, ctor);
    return ctor;
  };
}

export function isRegistered(type: string) {
  return globalActorRegistry.has(type);
}

export function listTypes() {
  return [...globalActorRegistry.keys()];
}

export function render<T extends Actor>(actorCtor: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T), isDefault: boolean = false) {
    return function <T2 extends AnyCtor>(ctor: T2, _context?: ClassDecoratorContext) {
        globalActorRendererRegistry.set(actorCtor, new ctor() as ActorRenderer<T>);
        return ctor;
    }
}

export function listRendererForActor<T extends Actor>(ctor: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)): any[] {

    

    return [...globalActorRendererRegistry.entries()]
        .filter(([actorType, _]) => {
            return ctor === actorType || ctor.prototype instanceof actorType;
        })
        .map(([_, renderer]) => renderer as ActorRenderer<T>);
}

export function listRenderers() {
    return globalActorRendererRegistry.keys()
}