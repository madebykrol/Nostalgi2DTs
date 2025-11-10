import http from "http";

import { Endpoint, Engine, Container, InputManager, World, Vector2 } from "@repo/engine";
import { inject } from "inversify"; 


export class DefaultInputManager extends InputManager {
  // Implement default input manager logic here
  /**
   *
   */
  constructor(@inject(Engine<WebSocket, http.IncomingMessage>) protected engine: Engine<WebSocket, http.IncomingMessage>) {
    super();
    // Handle keyboard input
    window.addEventListener("keydown", (event) => {
      this.emit(this.generateEvent(event.key, "down", { ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey }), event.key, { ctrlDown: event.ctrlKey, shiftDown: event.shiftKey, altDown: event.altKey});
    });
    window.addEventListener("keyup", (event) => {
      this.emit(this.generateEvent(event.key, "up", { ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey }), event.key, { ctrlDown: event.ctrlKey, shiftDown: event.shiftKey, altDown: event.altKey});
    });
    window.addEventListener("mousemove", (event: MouseEvent) => {

      if(!this.checkGameScreen(event))
        return;

      const { x, y } = this.calculateMousePosition(event);
      this.emit(this.generateEvent("mouse", "move", { ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey }), {screenX : x, screenY: y, worldX: x, worldY: y}, { ctrlDown: event.ctrlKey, shiftDown: event.shiftKey, altDown: event.altKey});
    });

    window.addEventListener("mousedown", (event) => {
      if(!this.checkGameScreen(event))
        return;
      
      const { x, y, width, height } = this.calculateMousePosition(event);

      const worldPosition = this.getWorldPosition(x, y, width, height);

      this.emit(this.generateEvent("mouse", "down", { ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey }), {screenX : x, screenY: y, worldX: worldPosition?.x ?? x, worldY: worldPosition?.y ?? y}, { ctrlDown: event.ctrlKey, shiftDown: event.shiftKey, altDown: event.altKey});
    });

    window.addEventListener("mouseup", (event) => {
      
      if(!this.checkGameScreen(event))
        return;

      const { x, y, width, height } = this.calculateMousePosition(event);
      const worldPosition = this.getWorldPosition(x, y, width, height);

      this.emit(this.generateEvent("mouse", "up", { ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey }), {screenX : x, screenY: y, worldX: worldPosition?.x ?? x, worldY: worldPosition?.y ?? y}, { ctrlDown: event.ctrlKey, shiftDown: event.shiftKey, altDown: event.altKey});
    });
    window.addEventListener("wheel", (event) => {

       if(!this.checkGameScreen(event))
        return;

       console.log("Wheel event detected:", event);

      const { x, y } = this.calculateMousePosition(event);
      this.emit(this.generateEvent("wheel", "tap", { ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey }), { deltaX: event.deltaX, deltaY: event.deltaY, screenX : x, screenY: y, worldX: x, worldY: y}, { ctrlDown: event.ctrlKey, shiftDown: event.shiftKey, altDown: event.altKey});
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

