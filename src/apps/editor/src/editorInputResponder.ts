import {
  Actor,
  Editor,
  Engine,
  InputManager,
  PostProcessingVolumeActor,
  RotationGizmoHandle,
  SphereWarpPostProcessMaterial,
  TranslationGizmoHandle,
  Vector2,
} from "@repo/engine";
import type { GizmoType } from "@repo/engine";

type TranslateDragState = {
  mode: "translate";
  axis: TranslationGizmoHandle;
  targets: Actor[];
  startActorWorld: Map<Actor, Vector2>;
  startMouseWorld: Vector2;
};

type RotateDragState = {
  mode: "rotate";
  handle: RotationGizmoHandle;
  targets: Actor[];
  startRotations: Map<Actor, number>;
  pivot: Vector2;
  lastAngle: number;
  totalDelta: number;
};

type DragState = TranslateDragState | RotateDragState;

type GizmoHandlePick =
  | { kind: "translate"; handle: TranslationGizmoHandle }
  | { kind: "rotate"; handle: RotationGizmoHandle };

// Central input bridge between the editor viewport and the runtime selection/gizmo system.
// It watches raw mouse/keyboard events, maintains the active selection set, and forwards
// that state to the editor so the correct gizmo (translation, scale, rotation) can be shown.
export class EditorInputResponder {
  private isActive = false;
  private lastMousePosition: Vector2 = new Vector2(0, 0);
  private hoveredActor: Actor | null = null;
  private dragState: DragState | null = null;
  private highlightMaterial: SphereWarpPostProcessMaterial | null = null;
  private readonly mouseDownEvents: readonly string[] = [
    "mouse:down",
    "mouse:down:ctrl",
    "mouse:down:ctrl:shift",
    "mouse:down:ctrl:alt",
    "mouse:down:ctrl:shift:alt",
  ];

  private readonly handleArrowUp = () => this.panCamera(0, 1);
  private readonly handleArrowDown = () => this.panCamera(0, -1);
  private readonly handleArrowLeft = () => this.panCamera(-1, 0);
  private readonly handleArrowRight = () => this.panCamera(1, 0);
  private readonly handleToggleTranslation = () => this.switchGizmoMode("translation");
  private readonly handleToggleRotation = () => this.switchGizmoMode("rotation");

  private selectedActors: Set<Actor> = new Set();
  private readonly handleMouseMove = (data: { worldX: number; worldY: number }) => {
    const cursor = new Vector2(data.worldX, data.worldY);
    this.lastMousePosition = cursor;

    if (this.dragState) {
      this.updateDragPosition(cursor);
      return;
    }

    const handleTarget = this.updateHoveredHandle(cursor);
    this.updateCursor(handleTarget);
  };

  private readonly handleMouseUp = (data: { worldX: number; worldY: number }) => {
    const cursor = new Vector2(data.worldX, data.worldY);
    this.lastMousePosition = cursor;

    if (!this.dragState) {
      return;
    }

    this.updateDragPosition(cursor);
    this.endDrag();
    const handleAfterDrag = this.updateHoveredHandle(cursor);
    this.updateCursor(handleAfterDrag);
  };

  private readonly handleWheelWithShift = (data: { deltaY: number }) => {
    this.adjustZoom(data.deltaY);
  };

  constructor(private readonly inputManager: InputManager, private readonly engine: Engine<unknown, unknown>, private readonly editor: Editor) {
    this.highlightMaterial = this.findHighlightMaterial();
    this.syncSelectionHighlight();
  }

  activate(): void {
    if (this.isActive) {
      return;
    }

    this.inputManager.on("arrowup:down", this.handleArrowUp);
    this.inputManager.on("arrowdown:down", this.handleArrowDown);
    this.inputManager.on("arrowleft:down", this.handleArrowLeft);
    this.inputManager.on("arrowright:down", this.handleArrowRight);
    this.inputManager.on("mouse:move", this.handleMouseMove);
    this.inputManager.on("mouse:up", this.handleMouseUp);
    this.inputManager.on("wheel:tap:shift", this.handleWheelWithShift);
    for (const event of this.mouseDownEvents) {
      this.inputManager.on(event, this.handleMouseDown);
    }
    this.inputManager.on("w:down:alt", this.handleToggleTranslation);
    this.inputManager.on("e:down:alt", this.handleToggleRotation);

    this.isActive = true;
    this.syncSelectionHighlight();
  }

  dispose(): void {
    if (!this.isActive) {
      return;
    }

    this.inputManager.off("arrowup:down", this.handleArrowUp);
    this.inputManager.off("arrowdown:down", this.handleArrowDown);
    this.inputManager.off("arrowleft:down", this.handleArrowLeft);
    this.inputManager.off("arrowright:down", this.handleArrowRight);
    this.inputManager.off("mouse:move", this.handleMouseMove);
    this.inputManager.off("mouse:up", this.handleMouseUp);
    this.inputManager.off("wheel:tap:shift", this.handleWheelWithShift);
    for (const event of this.mouseDownEvents) {
      this.inputManager.off(event, this.handleMouseDown);
    }
    this.inputManager.off("w:down:alt", this.handleToggleTranslation);
    this.inputManager.off("e:down:alt", this.handleToggleRotation);

    this.hoveredActor = null;
    this.dragState = null;
    document.body.style.cursor = "default";

    this.isActive = false;
  }

  getLastMousePosition(): Vector2 {
    return this.lastMousePosition;
  }

  private switchGizmoMode(mode: GizmoType): void {
    void this.editor
      .displayGizmo(this.getSelectedActors(), mode);
  }

  // Entry point for selection and gizmo interaction. We first give the active gizmo a
  // chance to consume the click (dragging an existing handle). If no gizmo handle is hit
  // we fall back to world picking to identify actors and update the selection set.
  private handleMouseDown = (
    data: { screenX: number; screenY: number; worldX: number; worldY: number },
    modifiers?: { ctrlDown?: boolean; shiftDown?: boolean; altDown?: boolean }
  ) => {
    const cursor = new Vector2(data.worldX, data.worldY);
    this.lastMousePosition = cursor;

    const withCtrl = modifiers?.ctrlDown ?? false;

    // Get gizmoHandle
    const gizmoHandle = this.findGizmoHandle(cursor);
    if (gizmoHandle) {
      const activeGizmo = this.editor.getActiveGizmo();
      if (!activeGizmo) {
        return;
      }
      activeGizmo.handleGizmoManipulation(cursor);
      this.updateCursor(gizmoHandle);
      return;
    }

    // No gizmo handle under the cursor, so we ray-cast actors in the scene and pick the
    // top-most by render layer so UI and higher layers win over background props.
    const hitActors = this.engine.aabbCast(cursor, true, true, Actor);
    const filteredHits = this.filterGizmoActors(hitActors);
    if (filteredHits.length === 0) {
      this.updateCursor(null);
      this.handleEmptyClick(withCtrl);
      return;
    }

    const topMost = filteredHits.reduce<Actor | null>((current, candidate) => {
      if (!current) {
        return candidate;
      }
      return candidate.layer >= current.layer ? candidate : current;
    }, null);

    const selectedActor = topMost ?? null;

    this.updateCursor(null);

    if (!selectedActor) {
      this.handleEmptyClick(withCtrl);
      return;
    }

    this.handleActorClick(selectedActor, withCtrl);
  };

  // When a gizmo handle wins the mouse-down we capture the drag relationship so every
  // subsequent mouse move can translate/rotate/scale the actor in world space.
  private beginTranslateDrag(axis: TranslationGizmoHandle, cursor: Vector2): void {
    const targets = this.getSelectedActors();
    if (targets.length === 0) {
      return;
    }

    const startActorWorld = new Map<Actor, Vector2>();
    for (const actor of targets) {
      startActorWorld.set(actor, actor.getPosition());
    }

    this.dragState = {
      mode: "translate",
      axis,
      targets,
      startActorWorld,
      startMouseWorld: cursor.clone(),
    };
  }

  private beginRotateDrag(handle: RotationGizmoHandle, cursor: Vector2): void {
    if (!handle) {
      return;
    }

    const targets = this.getSelectedActors();
    if (targets.length === 0) {
      return;
    }

    const rotationGizmo = this.editor.getRotationGizmoActor();
    if (!rotationGizmo) {
      return;
    }

    const pivot = rotationGizmo.getPosition();
    const startVector = cursor.subtract(pivot);
    const startAngle = Math.atan2(startVector.y, startVector.x);

    const startRotations = new Map<Actor, number>();
    for (const actor of targets) {
      startRotations.set(actor, actor.getRotation());
    }

    this.dragState = {
      mode: "rotate",
      handle,
      targets,
      startRotations,
      pivot,
      lastAngle: startAngle,
      totalDelta: 0,
    };
  }

  private endDrag(): void {
    this.dragState = null;
  }

  // Applies the gizmo delta (computed in camera space) back to the actor. Translation is
  // currently supported; rotation/scale reuse the same plumbing once their gizmo handles
  // are routed through this branch.
  private updateDragPosition(cursor: Vector2): void {
    if (!this.dragState) {
      return;
    }

    if (this.dragState.mode === "translate") {
      const { axis, targets, startActorWorld, startMouseWorld } = this.dragState;
      const deltaX = cursor.x - startMouseWorld.x;
      const deltaY = cursor.y - startMouseWorld.y;

      let offsetX = 0;
      let offsetY = 0;

      if (axis === "x") {
        offsetX = deltaX;
      } else if (axis === "y") {
        offsetY = deltaY;
      } else {
        offsetX = deltaX;
        offsetY = deltaY;
      }

      for (const actor of targets) {
        const startWorld = startActorWorld.get(actor);
        if (!startWorld) {
          continue;
        }

        const newWorld = new Vector2(startWorld.x + offsetX, startWorld.y + offsetY);
        const parent = actor.getParent();

        let newLocalPosition = newWorld;
        if (parent instanceof Actor) {
          const parentWorld = parent.getPosition();
          newLocalPosition = new Vector2(newWorld.x - parentWorld.x, newWorld.y - parentWorld.y);
        }

        actor.setPosition(newLocalPosition);
      }

      this.syncActiveGizmo();
      return;
    }

    const rotateState = this.dragState;
    const { handle, pivot, targets, startRotations } = rotateState;
    const direction = handle === "cw" ? -1 : 1;
    const currentVector = cursor.subtract(pivot);
    const magnitudeSq = currentVector.x * currentVector.x + currentVector.y * currentVector.y;
    if (magnitudeSq < 1e-6) {
      return;
    }
    const currentAngle = Math.atan2(currentVector.y, currentVector.x);
    const step = this.normalizeAngle(currentAngle - rotateState.lastAngle) * direction;
    rotateState.lastAngle = currentAngle;
    rotateState.totalDelta += step;

    for (const actor of targets) {
      const startRotation = startRotations.get(actor);
      if (startRotation === undefined) {
        continue;
      }
      actor.setRotation(startRotation + rotateState.totalDelta);
    }

    this.syncActiveGizmo();
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

  private updateHoveredHandle(worldPosition: Vector2): GizmoHandlePick | null {
    const gizmoHandle = this.findGizmoHandle(worldPosition);
    if (gizmoHandle) {
      this.hoveredActor = null;
      return gizmoHandle;
    }

    const hitActors = this.engine.aabbCast(worldPosition, true, true, Actor);
    const relevantHits = this.filterGizmoActors(hitActors);

    if (relevantHits.length === 0) {
      if (this.hoveredActor) {
        this.hoveredActor = null;
      }
      return null;
    }

    const topMost = relevantHits.reduce<Actor | null>((current, candidate) => {
      if (!current) {
        return candidate;
      }
      return candidate.layer >= current.layer ? candidate : current;
    }, null);

    if (topMost !== this.hoveredActor) {
      this.hoveredActor = topMost;
    }
    return null;
  }

  // Selection helpers keep a single source of truth for which actors are active. The set
  // is shared with the gizmo manager so toggling selection immediately refreshes gizmo data.
  private applySelection(next: Set<Actor>, preferredFocus: Actor | null = null): void {
    const changed = !this.haveSameMembers(this.selectedActors, next);
    if (changed) {
      this.selectedActors = new Set(next);
      this.syncActiveGizmo();
    }

    const focus = this.resolveSelectionFocus(preferredFocus);
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
        this.applySelection(next, actor);
      } else {
        next.add(actor);
        this.applySelection(next, actor);
      }
      return;
    }

    const replacement = new Set<Actor>();
    replacement.add(actor);
    this.applySelection(replacement, actor);
  }

  getSelectedActors(): Actor[] {
    return Array.from(this.selectedActors);
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

  private normalizeAngle(angle: number): number {
    const twoPi = Math.PI * 2;
    let value = angle % twoPi;
    if (value > Math.PI) {
      value -= twoPi;
    } else if (value <= -Math.PI) {
      value += twoPi;
    }
    return value;
  }

  private filterGizmoActors(candidates: Actor[]): Actor[] {
    const gizmoActors: Actor[] = [];
    const translation = this.editor.getTranslationGizmoActor();
    if (translation) {
      gizmoActors.push(translation);
    }
    const rotation = this.editor.getRotationGizmoActor();
    if (rotation) {
      gizmoActors.push(rotation);
    }
    const scaling = this.editor.getScalingGizmoActor();
    if (scaling) {
      gizmoActors.push(scaling);
    }
    if (gizmoActors.length === 0) {
      return candidates;
    }
    const exclusions = new Set(gizmoActors);
    return candidates.filter((candidate) => !exclusions.has(candidate));
  }

  // Relay the current selection + active gizmo mode to the editor. The Editor object owns
  // spawning the specific gizmo actors (translation, rotation, scale) so this input layer
  // only needs to surface who is selected and which mode should display.
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

  private syncActiveGizmo(): void {
    const activeGizmo = this.editor.getActiveGizmo() ?? "translation";
    void this.editor
      .displayGizmo(this.getSelectedActors(), activeGizmo)
      .catch((error) => {
        console.error("Failed to display gizmo", error);
      });

      // If nothing is selected we hide all gizmos.
    if (this.selectedActors.size === 0) {
      // Despawn all gizmos when selection is cleared.
    
      this.editor.hideAllGizmos();
    }

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
  

  private updateCursor(handle: GizmoHandlePick | null): void {
    if (this.dragState) {
      document.body.style.cursor = "grabbing";
      return;
    }

    let cursor = "default";

    if (handle) {
      if (handle.kind === "translate") {
        cursor = handle.handle === "pivot"
          ? "move"
          : handle.handle === "x"
            ? "ew-resize"
            : handle.handle === "y"
              ? "ns-resize"
              : "default";
      } else {
        cursor = "grab";
      }
    }

    document.body.style.cursor = cursor;
  }

  private findGizmoHandle(worldPosition: Vector2): GizmoHandlePick | null {
    const camera = this.engine.getCurrentCamera();
    if (!camera) {
      return null;
    }

    const activeGizmo = this.editor.getActiveGizmo() ?? "translation";
    if (activeGizmo === "translation") {
      const translationGizmo = this.editor.getTranslationGizmoActor();
      if (!translationGizmo || !translationGizmo.getWorld()) {
        return null;
      }

      const handle = translationGizmo.hitTest(worldPosition, camera.getZoom());
      return handle ? { kind: "translate", handle } : null;
    }

    if (activeGizmo === "rotation") {
      const rotationGizmo = this.editor.getRotationGizmoActor();
      if (!rotationGizmo || !rotationGizmo.getWorld()) {
        return null;
      }

      const handle = rotationGizmo.hitTest(worldPosition, camera.getZoom());
      return handle ? { kind: "rotate", handle } : null;
    }

    return null;
  }
}
