import http from "http";

import { AbstractConstructor, Constructor, Endpoint, Engine, Container, InputManager, World, Vector2 } from "@repo/engine";
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


export class DefaultInputManager extends InputManager {
  // Implement default input manager logic here
  /**
   *
   */
  constructor(@inject(Engine<WebSocket, http.IncomingMessage>) protected engine: Engine<WebSocket, http.IncomingMessage>) {
    super();  

    console.log(engine);
    // Handle keyboard input
    window.addEventListener("keydown", (event) => {
      
      this.emit("keyDown", event.key, { ctrlDown: event.ctrlKey, shiftDown: event.shiftKey, altDown: event.altKey});
    });
    window.addEventListener("keyup", (event) => {
      this.emit("keyUp", event, { ctrlDown: event.ctrlKey, shiftDown: event.shiftKey, altDown: event.altKey});
    });
    window.addEventListener("mousemove", (event: MouseEvent) => {

      if(!this.checkGameScreen(event))
        return;

      const { x, y } = this.calculateMousePosition(event);

      this.emit("mouseMove", {screenX : x, screenY: y, worldX: x, worldY: y}, { ctrlDown: event.ctrlKey, shiftDown: event.shiftKey, altDown: event.altKey });
    });

    window.addEventListener("mousedown", (event) => {
      if(!this.checkGameScreen(event))
        return;
      
      const { x, y, width, height } = this.calculateMousePosition(event);

      const worldPosition = this.getWorldPosition(x, y, width, height);


      this.emit("mouseDown", {screenX : x, screenY: y, worldX: worldPosition?.x ?? x, worldY: worldPosition?.y ?? y}, { ctrlDown: event.ctrlKey, shiftDown: event.shiftKey, altDown: event.altKey});
    });

    window.addEventListener("mouseup", (event) => {
      
      if(!this.checkGameScreen(event))
        return;

      const { x, y } = this.calculateMousePosition(event);
      this.emit("mouseUp", {screenX : x, screenY: y, worldX: x, worldY: y}, { ctrlDown: event.ctrlKey, shiftDown: event.shiftKey, altDown: event.altKey});
    });
    window.addEventListener("wheel", (event) => {

       if(!this.checkGameScreen(event))
        return;

      const { x, y } = this.calculateMousePosition(event);
      this.emit("mouseWheel", {screenX : x, screenY: y, worldX: x, worldY: y}, { ctrlDown: event.ctrlKey, shiftDown: event.shiftKey, altDown: event.altKey});
    });
    window.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.emit("contextMenu", event, { ctrlDown: event.ctrlKey, shiftDown: event.shiftKey, altDown: event.altKey});
    });

  }

  private checkGameScreen(event: MouseEvent): boolean {
    var target = event?.target as HTMLElement;
    return target.id === "gamescreen";
  }

  private getWorldPosition(canvasX: number, canvasY: number, canvasWidth: number, canvasHeight: number): Vector2 | undefined {
    const camera = this.engine.getCurrentCamera();

    console.log(this.engine.getCurrentCamera())

    if (!camera) {
      return ;
    }

    return camera.screenToWorld(new Vector2(canvasX, canvasY), canvasWidth, canvasHeight);
  }


  private calculateMousePosition(event: MouseEvent): { x: number; y: number, width: number; height: number } {
      const canvas = (event.target as HTMLCanvasElement)
      const rect = (event.target as HTMLElement).getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const canvasX = (event.clientX - rect.left) * scaleX;
      const canvasY = (event.clientY - rect.top) * scaleY;
      return { x: canvasX, y: canvasY, width: canvas.width, height: canvas.height};
  }
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

