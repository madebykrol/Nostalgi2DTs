import { AbstractConstructor, Constructor, Container } from "./container";

import { Container as InvContainer } from "inversify"; 

export class InversifyContainer implements Container {
    private container: InvContainer;

    constructor() {
        this.container = new InvContainer({
            autobind: true,
        });
    }

    verify(): string {
        return "Container verified";
    }

    getByIdentifier<T>(identifier: string): T {
      try {
        return this.container.get<T>(identifier);
      } catch (e) {
        return null as T;
      }
    }


    registerSelf<T>(ctor: Constructor<T>, identifier: string|undefined = undefined): void {
        this.container.bind(ctor).toSelf();
        this.container.bind(identifier || ctor.name).to(ctor);
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

    get<T>(ctor?: Constructor<T> | AbstractConstructor<T>): T {
        try {
        if (!ctor) {
        return this.container.get<T>(Text.prototype.constructor);
        }
        return this.container.get(ctor);
      } catch (e) {
        return null as T;
      }
    }

}