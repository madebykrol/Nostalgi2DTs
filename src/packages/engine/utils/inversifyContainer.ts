import { AbstractConstructor, Constructor, Container } from "./container";

import { Container as InvContainer } from "inversify"; 
import { normalizeClassName } from "./type";

// Normalize identifiers so suffixed names like Foo2 still resolve to Foo


export class InversifyContainer implements Container {
    private container: InvContainer;
    private readonly identifierBindingMap: Map<string, Constructor<unknown> | AbstractConstructor<unknown>> = new Map();

    constructor() {
        this.container = new InvContainer({
            autobind: true,
            
        });
    }

    getTypeForIdentifier(identifier: string): Constructor<unknown> | AbstractConstructor<unknown> | null {
      const normalized = normalizeClassName(identifier);
      return this.identifierBindingMap.get(identifier) || this.identifierBindingMap.get(normalized!) || null;
    }

    verify(): string {
        return "Container verified";
    }

    getByIdentifier<T>(identifier: string): T {
      try {
        return this.container.get<T>(identifier);
      } catch (e) {
        const normalized = normalizeClassName(identifier);
        if (normalized && normalized !== identifier) {
          try {
            return this.container.get<T>(normalized);
          } catch (inner) {
            // fall through
          }
        }
        return null as T;
      }
    }


    registerSelf<T>(ctor: Constructor<T>, identifier: string|undefined = undefined): void {
        const id = identifier || ctor.name;
        const normalized = normalizeClassName(id);

        this.container.bind(ctor).toSelf();
        this.container.bind(id).to(ctor);
        if (normalized && normalized !== id) {
          this.container.bind(normalized).to(ctor);
        }

        this.identifierBindingMap.set(id, ctor);
        if (normalized) {
          this.identifierBindingMap.set(normalized, ctor);
        }
    }

    registerSingletonInstance<T>(ctor: Constructor<T> | AbstractConstructor<T>, instance: T): void {
        this.container.bind(ctor).toConstantValue(instance);
    }

    registerSingleton<T, U extends T>(ctor: Constructor<T> | AbstractConstructor<T>, ctor2: Constructor<U>): void {
        this.container.bind(ctor).to(ctor2).inSingletonScope();
    }

    register<T1, T2 extends T1>(ctor: Constructor<T1> | AbstractConstructor<T1>, ctor2: Constructor<T2>): void {
        this.container.bind(ctor).to(ctor2);
    }

    registerInstance<T>(ctor: Constructor<T> | AbstractConstructor<T>, instance: T): void {
        this.container.bind(ctor).toConstantValue(instance);
    }

    get<T>(ctor: Constructor<T> | AbstractConstructor<T>, args?: any[]): T {
      try {
        return this.container.get(ctor);
      } catch (e) {
        console.log(e);
        return null as T;
      }
    }

}