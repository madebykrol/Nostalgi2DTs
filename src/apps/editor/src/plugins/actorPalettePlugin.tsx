import { useEffect, useMemo, useState, useRef } from "react";
import { Actor, Editor, Engine, Vector2 } from "@repo/engine";
import { EditorUIPlugin } from "@repo/engine";
import { withInjection } from "../ioc/ioc";

type ActorRegistryEntry = {
  id: string;
  name: string;
};

const ACTOR_MIME_TYPE = "application/x-editor-actor";

// Global state for touch drag (to communicate between palette and scene)
let activeTouchDragData: { type: string } | null = null;

const isActorConstructor = (ctor: unknown): ctor is new () => Actor => {
  if (typeof ctor !== "function") {
    return false;
  }
  return Boolean(ctor.prototype && ctor.prototype instanceof Actor && ctor !== Actor);
};

const discoverActorTypes = (engine: Engine<unknown, unknown>): ActorRegistryEntry[] => {
  const container = (engine as any)?.container as { identifierBindingMap?: Map<string, unknown> } | undefined;
  const bindings = container?.identifierBindingMap;
  if (!bindings || typeof bindings.entries !== "function") {
    return [];
  }

  const entries: ActorRegistryEntry[] = [];
  for (const [identifier, ctor] of bindings.entries()) {
    if (!isActorConstructor(ctor)) {
      continue;
    }
    entries.push({
      id: identifier,
      name: (ctor.name || identifier).replace(/Actor$/, ""),
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
};

const resolveActorConstructor = (
  engine: Engine<unknown, unknown>,
  identifier: string
): (new () => Actor | null) | null => {
  const container = (engine as any)?.container as {
    getTypeForIdentifier?: (id: string) => new () => Actor | null;
  } | null;

  return container?.getTypeForIdentifier?.(identifier) ?? null;
};

type ActorPalettePanelBaseProps = {
  editor: Editor;
  engine: Engine<unknown, unknown>;
};

const ActorPalettePanelBase = ({ editor: _editor, engine }: ActorPalettePanelBaseProps) => {
  const [actorEntries, setActorEntries] = useState<ActorRegistryEntry[]>(() => discoverActorTypes(engine));
  const [isDragging, setIsDragging] = useState(false);
  const dragPreviewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActorEntries(discoverActorTypes(engine));
  }, [engine]);

  const entries = useMemo(() => actorEntries, [actorEntries]);

  const handlePointerDown = (entry: ActorRegistryEntry) => (event: React.PointerEvent<HTMLButtonElement>) => {
    // For mouse, let the native drag-and-drop handle it
    if (event.pointerType === "mouse") {
      return;
    }

    // For touch devices, set up our custom drag handling
    event.preventDefault();
    event.stopPropagation();
    
    const button = event.currentTarget;
    button.setPointerCapture(event.pointerId);
    
    // Store the drag data globally
    activeTouchDragData = { type: entry.id };
    setIsDragging(true);

    // Create a drag preview element
    const preview = document.createElement("div");
    preview.className = "fixed pointer-events-none z-[9999] px-3 py-2 bg-cyan-400/20 border border-cyan-400/50 rounded text-xs text-white shadow-lg";
    preview.style.left = `${event.clientX}px`;
    preview.style.top = `${event.clientY}px`;
    preview.style.transform = "translate(-50%, -50%)";
    preview.textContent = entry.name;
    document.body.appendChild(preview);
    dragPreviewRef.current = preview;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (dragPreviewRef.current) {
        dragPreviewRef.current.style.left = `${moveEvent.clientX}px`;
        dragPreviewRef.current.style.top = `${moveEvent.clientY}px`;
      }
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      button.releasePointerCapture(upEvent.pointerId);
      
      // Dispatch a custom event at the drop location
      const dropTarget = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
      if (dropTarget) {
        const customEvent = new CustomEvent("actorpalette:touchdrop", {
          bubbles: true,
          detail: {
            actorTypeId: entry.id,
            clientX: upEvent.clientX,
            clientY: upEvent.clientY,
          },
        });
        dropTarget.dispatchEvent(customEvent);
      }

      // Clean up
      if (dragPreviewRef.current) {
        dragPreviewRef.current.remove();
        dragPreviewRef.current = null;
      }
      activeTouchDragData = null;
      setIsDragging(false);
      
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);
  };

  if (entries.length === 0) {
    return <div className="text-xs text-white/60">No spawnable actors registered.</div>;
  }

  return (
    <div className="space-y-2 text-xs text-white/90">
      <header className="text-[11px] uppercase tracking-wide text-white/60">Actor Palette</header>
      <p className="text-[11px] text-white/50">Drag an actor into the scene view to spawn it.</p>
      <ul className="space-y-1">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded border border-white/10 bg-white/5 px-3 py-2 text-left text-xs text-white transition hover:bg-white/10 touch-none"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "copy";
                event.dataTransfer.setData(
                  ACTOR_MIME_TYPE,
                  JSON.stringify({ type: entry.id })
                );
              }}
              onPointerDown={handlePointerDown(entry)}
            >
              <span>{entry.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

const ActorPalettePanel = withInjection({ engine: Engine })(ActorPalettePanelBase);

const actorPalettePlugin: EditorUIPlugin = {
  id: "builtin.actor-palette",
  activate: ({ panels, sceneDragDrop }) => {
    
    const unregisterPanel = panels.register({
      id: "builtin.actor-palette.panel",
      title: "Actors",
      location: "left",
      order: 40,
      render: ({ editor }) => <ActorPalettePanel editor={editor} />,
    });

    const unregisterDragDrop = sceneDragDrop.register({
      id: "builtin.actor-palette.spawn-handler",
      order: 40,
      onDragOver: (event) => {
        const types = Array.from(event.dataTransfer?.types ?? []);
        if (!types.includes(ACTOR_MIME_TYPE)) {
          return false;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        return true;
      },
      onDrop: async (event, { editor, engine, canvas }) => {
        if (!engine) {
          return false;
        }

        const payload = event.dataTransfer.getData(ACTOR_MIME_TYPE);
        if (!payload) {
          return false;
        }

        event.preventDefault();
        event.stopPropagation();

        let actorTypeId: string | undefined;
        try {
          const data = JSON.parse(payload) as { type?: string };
          actorTypeId = data?.type;
        } catch (error) {
          console.warn("Invalid actor drag payload", error);
          return false;
        }

        if (!actorTypeId) {
          return false;
        }

        const ctor = resolveActorConstructor(engine, actorTypeId);
        if (!ctor) {
          console.warn(`Actor type "${actorTypeId}" is not registered.`);
          return false;
        }

        const targetCanvas = canvas ?? (document.getElementById("gamescreen") as HTMLCanvasElement | null);
        const camera = engine.getCurrentCamera();
        if (!targetCanvas || !camera) {
          console.warn("Cannot spawn actor: canvas or camera unavailable.");
          return false;
        }

        const rect = targetCanvas.getBoundingClientRect();
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;
        if (canvasX < 0 || canvasY < 0 || canvasX > rect.width || canvasY > rect.height) {
          return false;
        }

        const devicePixelRatio = window.devicePixelRatio ?? 1;
        const screenPos = new Vector2(canvasX * devicePixelRatio, canvasY * devicePixelRatio);
        const worldPos = camera.screenToWorld(screenPos, targetCanvas.width, targetCanvas.height);

        try {
          const spawnedActor = await engine.spawnActor(ctor as any, undefined, worldPos);
          editor.selectActors([spawnedActor], spawnedActor);
          return true;
        } catch (error) {
          console.error(`Failed to spawn actor ${actorTypeId}`, error);
          return false;
        }
      },
    });

    return () => {
      unregisterDragDrop();
      unregisterPanel();
    };
  },
};

export default actorPalettePlugin;