import {
  Actor,
  Editor,
  Engine,
  GizmoActor,
  GizmoHandle,
  InputManager,
  MathUtils,
  PostProcessingVolumeActor,
  SphereWarpPostProcessMaterial,
  Vector2,
} from "@repo/engine";

type DragInteraction = {
  handle: GizmoHandle;
  lastCursor: Vector2;
};

// Bridges editor input to selection management and gizmo interaction.
export class EditorInputResponder {
  private static readonly PINCH_ZOOM_SENSITIVITY = 0.005;
  private static readonly CAMERA_ZOOM_MIN = 0.5;
  private static readonly CAMERA_ZOOM_MAX = 10;
  
  private isActive = false;
  private lastMousePosition = new Vector2(0, 0);
  private readonly mouseDownEvents: readonly string[] = [
    "mouse:down",
    "mouse:down:ctrl",
    "mouse:down:ctrl:shift",
    "mouse:down:ctrl:alt",
    "mouse:down:ctrl:shift:alt",
  ];
  private readonly selectedActors = new Set<Actor>();
  private activeDrag: DragInteraction | null = null;
  private highlightMaterial: SphereWarpPostProcessMaterial | null = null;

  private readonly handleArrowUp = () => this.panCamera(0, 1);
  private readonly handleArrowDown = () => this.panCamera(0, -1);
  private readonly handleArrowLeft = () => this.panCamera(-1, 0);
  private readonly handleArrowRight = () => this.panCamera(1, 0);

  private readonly handleMouseMove = (data: { worldX: number; worldY: number }) => {
    const cursor = new Vector2(data.worldX, data.worldY);
    this.lastMousePosition = cursor;

    if (this.activeDrag) {
      this.updateActiveDrag(cursor);
      return;
    }

    const handle = this.findGizmoHandle(cursor);
    this.updateCursor(handle?.cursor ?? "default");
  };

  private readonly handleMouseUp = (data: { worldX: number; worldY: number }) => {
    const cursor = new Vector2(data.worldX, data.worldY);
    this.lastMousePosition = cursor;

    if (!this.activeDrag) {
      return;
    }

    const drag = this.activeDrag;
    this.updateActiveDrag(cursor);
    drag.handle.endDrag(cursor);
    this.activeDrag = null;

    const hoveredHandle = this.findGizmoHandle(cursor);
    this.updateCursor(hoveredHandle?.cursor ?? "default");
  };

  private readonly handleWheelWithShift = (data: { deltaY: number }) => {
    this.adjustZoom(data.deltaY);
  };

  private readonly handlePinchMove = (data: { delta: number; centerX: number; centerY: number; worldX: number; worldY: number }) => {
    this.adjustZoomFromPinch(data.delta, new Vector2(data.worldX, data.worldY));
  };

  constructor(private readonly inputManager: InputManager, private readonly engine: Engine<unknown, unknown>, private readonly editor: Editor) {
    this.highlightMaterial = this.findHighlightMaterial();
    this.syncSelectionHighlight();
  }

  activate(): void {
    if (this.isActive) {
      return;
    }

    this.editor.registerSelectionController(this);

    this.inputManager.on("arrowup:down", this.handleArrowUp);
    this.inputManager.on("arrowdown:down", this.handleArrowDown);
    this.inputManager.on("arrowleft:down", this.handleArrowLeft);
    this.inputManager.on("arrowright:down", this.handleArrowRight);
    this.inputManager.on("mouse:move", this.handleMouseMove);
    this.inputManager.on("mouse:up", this.handleMouseUp);
    this.inputManager.on("wheel:tap:shift", this.handleWheelWithShift);
    this.inputManager.on("pinch:move", this.handlePinchMove);

    for (const event of this.mouseDownEvents) {
      this.inputManager.on(event, this.handleMouseDown);
    }

    this.isActive = true;
    this.syncSelectionHighlight();
  }

  dispose(): void {
    if (!this.isActive) {
      return;
    }

    this.editor.unregisterSelectionController(this);

    this.inputManager.off("arrowup:down", this.handleArrowUp);
    this.inputManager.off("arrowdown:down", this.handleArrowDown);
    this.inputManager.off("arrowleft:down", this.handleArrowLeft);
    this.inputManager.off("arrowright:down", this.handleArrowRight);
    this.inputManager.off("mouse:move", this.handleMouseMove);
    this.inputManager.off("mouse:up", this.handleMouseUp);
    this.inputManager.off("wheel:tap:shift", this.handleWheelWithShift);
    this.inputManager.off("pinch:move", this.handlePinchMove);

    for (const event of this.mouseDownEvents) {
      this.inputManager.off(event, this.handleMouseDown);
    }

    this.activeDrag = null;
    this.updateCursor("default");
    this.isActive = false;
  }

  getLastMousePosition(): Vector2 {
    return this.lastMousePosition;
  }

  private readonly handleMouseDown = (
    data: { screenX: number; screenY: number; worldX: number; worldY: number },
    modifiers?: { ctrlDown?: boolean; controlDown?: boolean; shiftDown?: boolean; altDown?: boolean }
  ) => {
    const cursor = new Vector2(data.worldX, data.worldY);
    this.lastMousePosition = cursor;

    const gizmoHandle = this.findGizmoHandle(cursor);
    if (gizmoHandle) {
      this.beginGizmoDrag(gizmoHandle, cursor);
      return;
    }

    const withCtrl = Boolean(modifiers?.ctrlDown ?? modifiers?.controlDown ?? false);

    const hitActors = this.engine.aabbCast(cursor, true, true, Actor);
    const filteredHits = this.filterOutGizmos(hitActors);
    if (filteredHits.length === 0) {
      this.updateCursor("default");
      this.handleEmptyClick(withCtrl);
      return;
    }

    const topMost = filteredHits.reduce<Actor | null>((current, candidate) => {
      if (!current) {
        return candidate;
      }
      return candidate.layer >= current.layer ? candidate : current;
    }, null);

    if (!topMost) {
      this.handleEmptyClick(withCtrl);
      return;
    }

    this.handleActorClick(topMost, withCtrl);
  };

  private beginGizmoDrag(handle: GizmoHandle, cursor: Vector2): void {
    handle.beginDrag(cursor);
    this.activeDrag = {
      handle,
      lastCursor: cursor.clone(),
    };
    this.updateCursor(handle.cursor);
  }

  private updateActiveDrag(cursor: Vector2): void {
    if (!this.activeDrag) {
      return;
    }

    const delta = new Vector2(cursor.x - this.activeDrag.lastCursor.x, cursor.y - this.activeDrag.lastCursor.y);
    if (delta.x === 0 && delta.y === 0) {
      return;
    }

    this.activeDrag.handle.handleDrag(cursor, delta);
    this.activeDrag.lastCursor = cursor.clone();
  }

  private panCamera(deltaX: number, deltaY: number): void {
    const camera = this.engine.getCurrentCamera();
    if (!camera) {
      return;
    }

    const currentPosition = camera.getPosition();
    const panSpeed = 5;
    camera.setPosition(new Vector2(currentPosition.x + deltaX * panSpeed, currentPosition.y + deltaY * panSpeed));
  }

  private adjustZoom(deltaY: number): void {
    const camera = this.engine.getCurrentCamera();
    if (!camera) {
      return;
    }

    const currentZoom = camera.getZoom();
    camera.setZoom(currentZoom - deltaY * 0.001);
  }

  private adjustZoomFromPinch(delta: number, worldPoint: Vector2): void {
    const camera = this.engine.getCurrentCamera();
    if (!camera) {
      return;
    }

    const currentZoom = camera.getZoom();
    const currentPosition = camera.getPosition();
    
    // Calculate new zoom (pinch delta is in pixels - normalize it to a reasonable zoom speed)
    // Positive delta means pinching out (zoom in), negative means pinching in (zoom out)
    // Clamp the zoom value to match camera constraints
    const newZoom = MathUtils.clamp(
      currentZoom + delta * EditorInputResponder.PINCH_ZOOM_SENSITIVITY,
      EditorInputResponder.CAMERA_ZOOM_MIN,
      EditorInputResponder.CAMERA_ZOOM_MAX
    );
    
    // Calculate the camera position adjustment to zoom toward the pinch center point
    // The idea is to keep the world point under the pinch center stationary in screen space
    const zoomRatio = newZoom / currentZoom;
    const offsetX = worldPoint.x - currentPosition.x;
    const offsetY = worldPoint.y - currentPosition.y;
    
    // Adjust camera position to maintain the pinch center in place
    const newPosition = new Vector2(
      worldPoint.x - offsetX * zoomRatio,
      worldPoint.y - offsetY * zoomRatio
    );
    
    camera.setZoom(newZoom);
    camera.setPosition(newPosition);
  }

  private applySelection(next: Set<Actor>, preferredFocus: Actor | null = null): void {
    const changed = !this.haveSameMembers(this.selectedActors, next);
    if (changed) {
      this.selectedActors.clear();
      next.forEach((actor) => this.selectedActors.add(actor));
      this.refreshGizmoTargets();
    }

    const focus = this.resolveSelectionFocus(preferredFocus);
    this.editor.updateSelectionSnapshot(this.getSelectedActors());
    this.editor.emit("actor:selected", focus);
    this.syncSelectionHighlight();
  }

  private handleEmptyClick(withCtrl: boolean): void {
    if (withCtrl) {
      return;
    }

    if (this.selectedActors.size === 0) {
      this.editor.emit("actor:selected", null);
      return;
    }

    this.applySelection(new Set(), null);
  }

  private handleActorClick(actor: Actor, withCtrl: boolean): void {
    if (withCtrl) {
      const next = new Set(this.selectedActors);
      if (next.has(actor)) {
        next.delete(actor);
      } else {
        next.add(actor);
      }
      this.applySelection(next, actor);
      return;
    }

    const replacement = new Set<Actor>();
    replacement.add(actor);
    this.applySelection(replacement, actor);
  }

  private refreshGizmoTargets(): void {
    const selection = this.getSelectedActors();
    if (selection.length === 0) {
      this.activeDrag = null;
      this.editor.hideGizmo();
      this.updateCursor("default");
      return;
    }

    const activeGizmo = this.editor.getActiveGizmo();
    if (!activeGizmo) {
      void this.editor
        .displayTranslationGizmo(selection)
        .catch((error) => {
          console.error("Failed to display translation gizmo", error);
        });
      return;
    }

    activeGizmo.setTargetActors(selection);
  }

  getSelectedActors(): Actor[] {
    return Array.from(this.selectedActors);
  }

  public selectActors(actors: Actor[], focus: Actor | null = null): void {
    this.activeDrag = null;

    if (actors.length === 0) {
      this.applySelection(new Set(), null);
      this.updateCursor("default");
      return;
    }

    const selection = new Set<Actor>(actors);
    const preferredFocus = focus ?? actors[0] ?? null;
    this.applySelection(selection, preferredFocus);
  }

  private findHighlightMaterial(): SphereWarpPostProcessMaterial | null {
    const pending: Actor[] = [...this.engine.getRootActors()];
    while (pending.length > 0) {
      const actor = pending.pop();
      if (!actor) {
        continue;
      }

      if (actor instanceof PostProcessingVolumeActor) {
        const material = actor.getMaterial();
        if (material instanceof SphereWarpPostProcessMaterial) {
          return material;
        }
      }

      const children = actor.getChildrenOfType(Actor);
      if (children.length > 0) {
        pending.push(...children);
      }
    }

    return null;
  }

  private syncSelectionHighlight(): void {
    if (!this.highlightMaterial) {
      this.highlightMaterial = this.findHighlightMaterial();
    }

    this.highlightMaterial?.setHighlightedActors(this.getSelectedActors());
  }

  private haveSameMembers(a: Set<Actor>, b: Set<Actor>): boolean {
    if (a.size !== b.size) {
      return false;
    }
    for (const actor of a) {
      if (!b.has(actor)) {
        return false;
      }
    }
    return true;
  }

  private resolveSelectionFocus(preferredFocus: Actor | null): Actor | null {
    if (preferredFocus && this.selectedActors.has(preferredFocus)) {
      return preferredFocus;
    }
    return this.getPrimarySelection();
  }

  private getPrimarySelection(): Actor | null {
    const iterator = this.selectedActors.values().next();
    return iterator.done ? null : iterator.value;
  }

  private updateCursor(cursor: string): void {
    this.editor.setCursor(cursor);
  }

  private filterOutGizmos(candidates: Actor[]): Actor[] {
    return candidates.filter((candidate) => !(candidate instanceof GizmoActor));
  }

  private findGizmoHandle(worldPosition: Vector2): GizmoHandle | null {
    const camera = this.engine.getCurrentCamera();
    if (!camera) {
      return null;
    }

    const activeGizmo = this.editor.getActiveGizmo();
    if (!activeGizmo || !activeGizmo.getWorld()) {
      return null;
    }

    return activeGizmo.getHandle(worldPosition, camera.getZoom());
  }
}
