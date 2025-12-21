import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Editor } from "@repo/engine";
import {
  EditorUIPlugin,
  EditorUIPluginContext,
  ModalHandle,
  ModalRenderer,
  PanelDescriptor,
  PanelLocation,
  SceneContextMenuContext,
  SceneContextMenuItemDescriptor,
  SceneDragHandlerDescriptor,
  ModalTriggerDescriptor,
  ModalTriggerEventType,
  ModalTriggerContextMap,
  ComponentAssetStorage,
  EditorComponentAssembler,
} from "@repo/engine";
import { theme } from "../theme";

type RegistryListener = () => void;

type RegisteredPanel = PanelDescriptor & { order: number };

export class PanelRegistry {
  private panels: RegisteredPanel[] = [];
  private listeners = new Set<RegistryListener>();

  register(descriptor: PanelDescriptor): () => void {
    const entry: RegisteredPanel = { ...descriptor, order: descriptor.order ?? 0 };
    this.panels.push(entry);
    this.panels.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    this.emit();

    return () => {
      const index = this.panels.indexOf(entry);
      if (index !== -1) {
        this.panels.splice(index, 1);
        this.emit();
      }
    };
  }

  resolve(location: PanelLocation): RegisteredPanel[] {
    return this.panels.filter((panel) => panel.location === location);
  }

  clear(): void {
    if (this.panels.length === 0) {
      return;
    }
    this.panels = [];
    this.emit();
  }

  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

type RegisteredSceneContextMenuItem = SceneContextMenuItemDescriptor & { order: number };

export class SceneContextMenuRegistry {
  private items: RegisteredSceneContextMenuItem[] = [];
  private listeners = new Set<RegistryListener>();

  register(descriptor: SceneContextMenuItemDescriptor): () => void {
    const entry: RegisteredSceneContextMenuItem = { ...descriptor, order: descriptor.order ?? 0 };
    this.items.push(entry);
    this.items.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
    this.emit();

    return () => {
      const index = this.items.indexOf(entry);
      if (index !== -1) {
        this.items.splice(index, 1);
        this.emit();
      }
    };
  }

  resolve(context: SceneContextMenuContext): RegisteredSceneContextMenuItem[] {
    return this.items.filter((item) => (item.isVisible ? item.isVisible(context) : true));
  }

  clear(): void {
    if (this.items.length === 0) {
      return;
    }
    this.items = [];
    this.emit();
  }

  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

type RegisteredSceneDragHandler = SceneDragHandlerDescriptor & { order: number };

export class SceneDragDropRegistry {
  private handlers: RegisteredSceneDragHandler[] = [];
  private listeners = new Set<RegistryListener>();

  register(descriptor: SceneDragHandlerDescriptor): () => void {
    const entry: RegisteredSceneDragHandler = { ...descriptor, order: descriptor.order ?? 0 };
    this.handlers.push(entry);
    this.handlers.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    this.emit();

    return () => {
      const index = this.handlers.indexOf(entry);
      if (index !== -1) {
        this.handlers.splice(index, 1);
        this.emit();
      }
    };
  }

  resolve(): RegisteredSceneDragHandler[] {
    return [...this.handlers];
  }

  clear(): void {
    if (this.handlers.length === 0) {
      return;
    }
    this.handlers = [];
    this.emit();
  }

  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

type RegisteredModalTrigger = ModalTriggerDescriptor & { order: number };

export class ModalTriggerRegistry {
  private triggers = new Map<ModalTriggerEventType, RegisteredModalTrigger[]>();

  register(descriptor: ModalTriggerDescriptor): () => void {
    const entry: RegisteredModalTrigger = { ...descriptor, order: descriptor.order ?? 0 };
    const existing = this.triggers.get(descriptor.event) ?? [];
    existing.push(entry);
    existing.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    this.triggers.set(descriptor.event, existing);

    return () => {
      const collection = this.triggers.get(descriptor.event);
      if (!collection) {
        return;
      }
      const index = collection.indexOf(entry);
      if (index !== -1) {
        collection.splice(index, 1);
      }
      if (collection.length === 0) {
        this.triggers.delete(descriptor.event);
      }
    };
  }

  clear(): void {
    this.triggers.clear();
  }

  async dispatch<T extends ModalTriggerEventType>(
    event: T,
    context: ModalTriggerContextMap[T],
    modalManager: ModalManager
  ): Promise<boolean> {
    const collection = this.triggers.get(event);
    if (!collection || collection.length === 0) {
      return false;
    }

    for (const trigger of collection) {
      if (event === "toolbar.menu" && trigger.menuId) {
        const allowedIds = Array.isArray(trigger.menuId) ? trigger.menuId : [trigger.menuId];
        if (!allowedIds.includes((context as ModalTriggerContextMap["toolbar.menu"]).menuId)) {
          continue;
        }
      }

      if (trigger.isEnabled) {
        const enabled = trigger.isEnabled(context as any);
        if (enabled instanceof Promise ? !(await enabled) : !enabled) {
          continue;
        }
      }

      modalManager.open((api) => trigger.render(context as any, api));
      return true;
    }

    return false;
  }
}

type ModalEntry = { id: number; render: ModalRenderer };

export class ModalManager {
  private entries: ModalEntry[] = [];
  private listeners = new Set<RegistryListener>();
  private nextId = 0;

  open(render: ModalRenderer): ModalHandle {
    const entry: ModalEntry = { id: ++this.nextId, render };
    this.entries.push(entry);
    this.emit();
    return {
      close: () => this.close(entry.id),
    };
  }

  close(id: number): void {
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index === -1) {
      return;
    }
    this.entries.splice(index, 1);
    this.emit();
  }

  clear(): void {
    if (this.entries.length === 0) {
      return;
    }
    this.entries = [];
    this.emit();
  }

  snapshot(): ModalEntry[] {
    return [...this.entries];
  }

  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const activateEditorPlugins = (
  editor: Editor,
  registries: {
    panels: PanelRegistry;
    sceneContextMenu: SceneContextMenuRegistry;
    sceneDragDrop: SceneDragDropRegistry;
    modalTriggers: ModalTriggerRegistry;
    modals: ModalManager;
  },
  plugins: EditorUIPlugin[],
  services?: {
    componentAssetStorage?: ComponentAssetStorage;
    componentAssembler?: EditorComponentAssembler;
  }
): (() => void) => {
  const context: EditorUIPluginContext = {
    editor,
    panels: {
      register: (descriptor) => registries.panels.register(descriptor),
    },
    sceneContextMenu: {
      registerItem: (descriptor) => registries.sceneContextMenu.register(descriptor),
    },
    sceneDragDrop: {
      register: (descriptor) => registries.sceneDragDrop.register(descriptor),
    },
    modalTriggers: {
      register: (descriptor) => registries.modalTriggers.register(descriptor),
    },
    modals: {
      open: (render) => registries.modals.open(render),
    },
    componentAssets: services?.componentAssetStorage,
    componentAssembler: services?.componentAssembler,
  };

  const disposers = plugins.map((plugin) => {
    try {
      const dispose = plugin.activate(context);
      return typeof dispose === "function" ? dispose : () => {};
    } catch (error) {
      console.error(`Failed to activate plugin ${plugin.id}`, error);
      return () => {};
    }
  });

  return () => {
    for (const dispose of disposers) {
      try {
        dispose();
      } catch (error) {
        console.error("Error during plugin disposal", error);
      }
    }
    registries.panels.clear();
    registries.sceneContextMenu.clear();
    registries.sceneDragDrop.clear();
    registries.modalTriggers.clear();
    registries.modals.clear();
  };
};

export const ModalHost = ({ manager }: { manager: ModalManager }) => {
  const [entries, setEntries] = useState(manager.snapshot());

  useEffect(() => {
    return manager.subscribe(() => {
      setEntries(manager.snapshot());
    });
  }, [manager]);

  if (entries.length === 0) {
    return null;
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[2000]">
      {entries.map((entry) => (
        <div key={entry.id} className="pointer-events-auto h-full w-full">
          {entry.render({ close: () => manager.close(entry.id) })}
        </div>
      ))}
    </div>,
    document.body
  );
};

export const SceneContextMenuSurface = ({
  editor,
  registry,
  children,
}: {
  editor: Editor | null;
  registry: SceneContextMenuRegistry;
  children: ReactNode;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [, setRevision] = useState(0);
  const [menuState, setMenuState] = useState<
    | {
        x: number;
        y: number;
        items: RegisteredSceneContextMenuItem[];
        context: SceneContextMenuContext;
      }
    | null
  >(null);

  useEffect(() => {
    return registry.subscribe(() => {
      setRevision((value) => value + 1);
    });
  }, [registry]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const handleContextMenu = (event: MouseEvent) => {
      if (!editor) {
        return;
      }
      event.preventDefault();

      const selection = editor.getSelectedActors();
      const context: SceneContextMenuContext = {
        editor,
        selection,
        clientX: event.clientX,
        clientY: event.clientY,
      };

      const items = registry.resolve(context);
      if (items.length === 0) {
        setMenuState(null);
        return;
      }

      const menuWidth = 220;
      const menuHeight = items.length * 32 + 16;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const clampedX = Math.min(event.clientX, Math.max(8, viewportWidth - menuWidth - 8));
      const clampedY = Math.min(event.clientY, Math.max(8, viewportHeight - menuHeight - 8));

      setMenuState({
        x: clampedX,
        y: clampedY,
        items,
        context,
      });
    };

    element.addEventListener("contextmenu", handleContextMenu);

    return () => {
      element.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [editor, registry]);

  useEffect(() => {
    if (!menuState) {
      return;
    }

    const closeMenu = () => setMenuState(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuState(null);
      }
    };

    window.addEventListener("mousedown", closeMenu, true);
    window.addEventListener("wheel", closeMenu, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", closeMenu, true);
      window.removeEventListener("wheel", closeMenu, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuState]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {children}
      {menuState && (
        <div className="pointer-events-none absolute inset-0 z-[1500]" onContextMenu={(event) => event.preventDefault()}>
          <div
            className="pointer-events-auto min-w-[200px] rounded-md border shadow-lg"
            style={{
              position: "absolute",
              top: menuState.y,
              left: menuState.x,
              backgroundColor: "rgba(14, 20, 35, 0.97)",
              borderColor: "rgba(254, 83, 187, 0.25)",
              color: theme.text,
            }}
          >
            {menuState.items.map((item) => {
              const disabled = item.isEnabled ? !item.isEnabled(menuState.context) : false;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`block w-full px-3 py-2 text-left text-xs transition-colors ${
                    disabled ? "cursor-not-allowed opacity-40" : "hover:bg-white/10"
                  }`}
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) {
                      return;
                    }
                    setMenuState(null);
                    item.onSelect(menuState.context);
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
