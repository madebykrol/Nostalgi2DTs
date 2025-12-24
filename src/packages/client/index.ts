import http from "http";

import { Endpoint, Engine, Container, InputManager, World, Vector2 } from "@repo/engine";
import { inject, injectable } from "inversify";

export class DefaultInputManager extends InputManager {
  private isAttached = false;
  private touchStartDistance: number | null = null;
  private lastTouchDistance: number | null = null;

  private readonly onKeyDown = (event: KeyboardEvent) => {
    this.emit(
      this.generateEvent(event.key, "down", {
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        alt: event.altKey,
      }),
      event.key,
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
      event.key,
      { ctrlDown: event.ctrlKey, shiftDown: event.shiftKey, altDown: event.altKey }
    );
  };

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

  private readonly onTouchStart = (event: TouchEvent) => {
    if (!this.checkGameScreenTouch(event)) {
      return;
    }

    if (event.touches.length === 2) {
      // Two fingers detected - start pinch gesture
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      this.touchStartDistance = this.calculateTouchDistance(touch1, touch2);
      this.lastTouchDistance = this.touchStartDistance;
      event.preventDefault();
    }
  };

  private readonly onTouchMove = (event: TouchEvent) => {
    if (!this.checkGameScreenTouch(event)) {
      return;
    }

    if (event.touches.length === 2 && this.lastTouchDistance !== null) {
      // Two fingers moving - handle pinch zoom
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const currentDistance = this.calculateTouchDistance(touch1, touch2);
      
      const delta = currentDistance - this.lastTouchDistance;
      this.lastTouchDistance = currentDistance;

      const { x, y } = this.calculateTouchCenter(touch1, touch2);

      this.emit(
        this.generateEvent("pinch", "move", {
          ctrl: false,
          shift: false,
          alt: false,
        }),
        {
          delta,
          distance: currentDistance,
          centerX: x,
          centerY: y,
        },
        {}
      );
      event.preventDefault();
    }
  };

  private readonly onTouchEnd = (event: TouchEvent) => {
    if (event.touches.length === 0) {
      // Reset pinch state when all fingers are lifted
      this.touchStartDistance = null;
      this.lastTouchDistance = null;
    }
  };

  private calculateTouchDistance(touch1: Touch, touch2: Touch): number {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private calculateTouchCenter(touch1: Touch, touch2: Touch): { x: number; y: number } {
    const target = touch1.target as HTMLCanvasElement | null;
    if (!target) {
      return { x: 0, y: 0 };
    }

    const rect = target.getBoundingClientRect();
    const scaleX = rect.width !== 0 ? target.width / rect.width : 1;
    const scaleY = rect.height !== 0 ? target.height / rect.height : 1;

    const centerClientX = (touch1.clientX + touch2.clientX) / 2;
    const centerClientY = (touch1.clientY + touch2.clientY) / 2;

    const x = (centerClientX - rect.left) * scaleX;
    const y = (centerClientY - rect.top) * scaleY;

    return { x, y };
  }

  private checkGameScreenTouch(event: TouchEvent): boolean {
    // Check if all touches are on the game screen
    for (let i = 0; i < event.touches.length; i++) {
      const target = event.touches[i].target as HTMLElement | null;
      if (target?.id !== "gamescreen") {
        return false;
      }
    }
    return event.touches.length > 0;
  }

  constructor(
    @inject(Engine<WebSocket, http.IncomingMessage>) protected engine: Engine<WebSocket, http.IncomingMessage>
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
    window.addEventListener("touchstart", this.onTouchStart, { passive: false });
    window.addEventListener("touchmove", this.onTouchMove, { passive: false });
    window.addEventListener("touchend", this.onTouchEnd);

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
    window.removeEventListener("touchmove", this.onTouchMove);
    window.removeEventListener("touchend", this.onTouchEnd);

    this.isAttached = false;
    super.dispose();
  }

  private checkGameScreen(event: MouseEvent): boolean {
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
}

export class ClientEndpoint extends Endpoint<WebSocket, http.IncomingMessage> {
  send(_command: string, _data: any): void {
    throw new Error("Method not implemented.");
  }
  connect(_onConnection: (socket: WebSocket, req: http.IncomingMessage) => void): Promise<void> {
    throw new Error("Method not implemented.");
  }
  disconnect(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  cleanup(): void {
    throw new Error("Method not implemented.");
  }
}

@injectable()
export class ClientEngine extends Engine<WebSocket, http.IncomingMessage> {
  // Implement client-specific engine logic here
  /**
   *
   */
  constructor(@inject(World) world: World, @inject(Endpoint) endPoint: Endpoint<WebSocket, http.IncomingMessage> | undefined, @inject(Container) container: Container) {
    super(world, endPoint, "singleplayer", container);
  }
}

