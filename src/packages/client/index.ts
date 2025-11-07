import http from "http";

import { AbstractConstructor, Constructor, Endpoint, Engine, Container, InputManager, World } from "@repo/engine";
import { Container as InvContainer, inject } from "inversify"; 

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
        this.container.bind(ctor).to(ctor2);
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


export class DefaultInputManager extends InputManager {
  // Implement default input manager logic here
}

export class ClientEndpoint extends Endpoint<WebSocket, http.IncomingMessage> {
  send(command: string, data: any): void {
    throw new Error("Method not implemented.");
  }
  connect(onConnection: (socket: WebSocket, req: http.IncomingMessage) => void): Promise<void> {
    throw new Error("Method not implemented.");
  }
  disconnect(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  cleanup(): void {
    throw new Error("Method not implemented.");
  }
}


export class ClientEngine extends Engine<WebSocket, http.IncomingMessage> {
  // Implement client-specific engine logic here
  /**
   *
   */
  constructor(@inject(World) world: World, @inject(Endpoint) endPoint: Endpoint<WebSocket, http.IncomingMessage> | undefined, @inject(Container) container: Container) {
    super(world, endPoint, "singleplayer", container);
  }
}

