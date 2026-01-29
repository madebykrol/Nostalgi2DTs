import { Endpoint, Engine, Container, InputManager, World, Vector2, TimerManager } from "@nostalgi2d/engine";
import { inject, injectable } from "inversify";
import { IncomingMessage, Socket } from "../engine/network/endpoint";

export class DefaultInputManager extends InputManager {
  private isAttached = false;

  private readonly onKeyDown = (event: KeyboardEvent) => {
    this.emit(
      this.generateEvent(event.key, "down", {
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        alt: event.altKey,
      }),
      event,
      { ctrlDown: event.ctrlKey, shiftDown: event.shiftKey, altDown: event.altKey }
    );
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.emit(
      this.generateEvent(event.key, "up", {
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        alt: event.altKey,
      }),
      event,
      { ctrlDown: event.ctrlKey, shiftDown: event.shiftKey, altDown: event.altKey }
    );
  };

  private readonly onTouchStart = (event: TouchEvent) =>  {
    if (!this.checkGameScreen(event)) {
      return;
    }


    const { x, y, width, height } = this.calculateTouchPosition(event);
    const worldPosition = this.getWorldPosition(x, y, width, height);
    
    this.emit(
      this.generateEvent("touch", "down", {ctrl: false, shift: false, alt: false}),
      {
        touches: event.touches,
      },
      {
        screenX: x,
        screenY: y,
        worldX: worldPosition?.x ?? x,
        worldY: worldPosition?.y ?? y,
      }
    );
  }

  private readonly onTouchEnd = (event: TouchEvent) =>  {
    if (!this.checkGameScreen(event)) {
      return;
    }


    const { x, y, width, height } = this.calculateTouchPosition(event);
    const worldPosition = this.getWorldPosition(x, y, width, height);
    
    this.emit(
      this.generateEvent("touch", "up", {ctrl: false, shift: false, alt: false}),
      {
        touches: event.touches,
      },
      {
        screenX: x,
        screenY: y,
        worldX: worldPosition?.x ?? x,
        worldY: worldPosition?.y ?? y,
      }
    );
  }  

  private readonly onMouseMove = (event: MouseEvent) => {
    if (!this.checkGameScreen(event)) {
      return;
    }

    const { x, y, width, height } = this.calculateMousePosition(event);
    const worldPosition = this.getWorldPosition(x, y, width, height);

    this.emit(
      this.generateEvent("mouse", "move", {
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        alt: event.altKey,
      }),
      {
        screenX: x,
        screenY: y,
        worldX: worldPosition?.x ?? x,
        worldY: worldPosition?.y ?? y,
      },
      { ctrlDown: event.ctrlKey, shiftDown: event.shiftKey, altDown: event.altKey }
    );
  };

  private readonly onMouseDown = (event: MouseEvent) => {
    if (!this.checkGameScreen(event)) {
      return;
    }

    const { x, y, width, height } = this.calculateMousePosition(event);
    const worldPosition = this.getWorldPosition(x, y, width, height);

    this.emit(
      this.generateEvent("mouse", "down", {
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        alt: event.altKey,
      }),
      {
        screenX: x,
        screenY: y,
        worldX: worldPosition?.x ?? x,
        worldY: worldPosition?.y ?? y,
      },
      { ctrlDown: event.ctrlKey, shiftDown: event.shiftKey, altDown: event.altKey }
    );
  };

  private readonly onMouseUp = (event: MouseEvent) => {
    if (!this.checkGameScreen(event)) {
      return;
    }

    const { x, y, width, height } = this.calculateMousePosition(event);
    const worldPosition = this.getWorldPosition(x, y, width, height);

    this.emit(
      this.generateEvent("mouse", "up", {
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        alt: event.altKey,
      }),
      {
        screenX: x,
        screenY: y,
        worldX: worldPosition?.x ?? x,
        worldY: worldPosition?.y ?? y,
      },
      { ctrlDown: event.ctrlKey, shiftDown: event.shiftKey, altDown: event.altKey }
    );
  };

  private readonly onWheel = (event: WheelEvent) => {
    if (!this.checkGameScreen(event)) {
      return;
    }

    const { x, y } = this.calculateMousePosition(event);

    this.emit(
      this.generateEvent("wheel", "tap", {
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        alt: event.altKey,
      }),
      {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        screenX: x,
        screenY: y,
        worldX: x,
        worldY: y,
      },
      { ctrlDown: event.ctrlKey, shiftDown: event.shiftKey, altDown: event.altKey }
    );
  };

  private readonly onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    this.emit("contextMenu", event, {
      ctrlDown: (event as MouseEvent).ctrlKey,
      shiftDown: (event as MouseEvent).shiftKey,
      altDown: (event as MouseEvent).altKey,
    });
  };

  constructor(
    @inject(Engine) protected engine: Engine
  ) {
    super();
  }

  initialize(): void {
    if (this.isAttached || typeof window === "undefined") {
      return;
    }

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("wheel", this.onWheel, { passive: true });
    window.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("touchstart", this.onTouchStart);
    window.addEventListener("touchend", this.onTouchEnd);
    // window.addEventListener("touchmove", this.onTouchMove);

    this.isAttached = true;
  }

  dispose(): void {
    if (!this.isAttached || typeof window === "undefined") {
      super.dispose();
      return;
    }

    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("touchstart", this.onTouchStart);
    window.removeEventListener("touchend", this.onTouchEnd);

    this.isAttached = false;
    super.dispose();
  }

  private checkGameScreen(event: Event): boolean {
    const target = event.target as HTMLElement | null;
    return target?.id === "gamescreen";
  }

  private getWorldPosition(
    canvasX: number,
    canvasY: number,
    canvasWidth: number,
    canvasHeight: number
  ): Vector2 | undefined {
    const camera = this.engine.getCurrentCamera();

    if (!camera) {
      return undefined;
    }

    return camera.screenToWorld(new Vector2(canvasX, canvasY), canvasWidth, canvasHeight);
  }

  private calculateMousePosition(event: MouseEvent): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const target = event.target as HTMLCanvasElement | null;
    if (!target) {
      return { x: event.clientX, y: event.clientY, width: 1, height: 1 };
    }

    const rect = target.getBoundingClientRect();
    const scaleX = rect.width !== 0 ? target.width / rect.width : 1;
    const scaleY = rect.height !== 0 ? target.height / rect.height : 1;

    const canvasX = (event.clientX - rect.left) * scaleX;
    const canvasY = (event.clientY - rect.top) * scaleY;

    return { x: canvasX, y: canvasY, width: target.width, height: target.height };
  }

  private calculateTouchPosition(event: TouchEvent): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const target = event.target as HTMLCanvasElement | null;
    if (!target) {
      return { x: event.touches[0]?.clientX ?? 0, y: event.touches[0]?.clientY ?? 0, width: 1, height: 1 };
    }
    const rect = target.getBoundingClientRect();
    const scaleX = rect.width !== 0 ? target.width / rect.width : 1;
    const scaleY = rect.height !== 0 ? target.height / rect.height : 1;
    const canvasX = (event.touches[0]?.clientX ?? 0 - rect.left) * scaleX;
    const canvasY = (event.touches[0]?.clientY ?? 0 - rect.top) * scaleY;
    return { x: canvasX, y: canvasY, width: target.width, height: target.height };
  }
}


export class ClientEndpoint extends Endpoint {
  send(_command: string, _data: any): void {
    throw new Error("Method not implemented.");
  }
  connect(_onConnection: (socket: Socket, req: IncomingMessage) => void): Promise<void> {
    throw new Error("Method not implemented.");
  }
  disconnect(): Promise<void> {
    return Promise.resolve();
  }
  cleanup(): void {
    throw new Error("Method not implemented.");
  }

  dispose(): void {
  }

}

@injectable()
export class ClientEngine extends Engine {
  // Implement client-specific engine logic here
  /**
   *
   */
  constructor(@inject(World) world: World, @inject(Endpoint) endPoint: Endpoint | undefined, @inject(Container) container: Container, @inject(TimerManager) timerManager: TimerManager) {
    super(world, endPoint, "singleplayer", container, timerManager);
  }
}

