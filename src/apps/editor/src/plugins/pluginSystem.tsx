import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Actor, Editor } from "@repo/engine";
import { theme } from "../theme";
import { withInjection, type InjectedProps } from "../ioc/ioc";

type RegistryListener = () => void;

export type PropertyInspectorRenderProps = {
  selection: Actor[];
};

export type PropertyInspectorDescriptor = {
  id: string;
  order?: number;
  appliesTo?: (selection: Actor[]) => boolean;
  render: (props: PropertyInspectorRenderProps) => ReactNode;
};

type RegisteredInspector = PropertyInspectorDescriptor & { order: number };

export class PropertyInspectorRegistry {
  private inspectors: RegisteredInspector[] = [];
  private listeners = new Set<RegistryListener>();

  register(descriptor: PropertyInspectorDescriptor): () => void {
    const entry: RegisteredInspector = { ...descriptor, order: descriptor.order ?? 0 };
    this.inspectors.push(entry);
    this.inspectors.sort((a, b) => a.order - b.order);
    this.emit();

    return () => {
      const index = this.inspectors.indexOf(entry);
      if (index !== -1) {
        this.inspectors.splice(index, 1);
        this.emit();
      }
    };
  }

  resolve(selection: Actor[]): RegisteredInspector | undefined {
    for (const inspector of this.inspectors) {
      if (!inspector.appliesTo || inspector.appliesTo(selection)) {
        return inspector;
      }
    }
    return undefined;
  }

  clear(): void {
    if (this.inspectors.length === 0) {
      return;
    }
    this.inspectors = [];
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

export type ModalRenderer = (api: { close: () => void }) => ReactNode;
export type ModalHandle = { close: () => void };

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

export type SceneContextMenuContext = {
  editor: Editor;
  selection: Actor[];
  clientX: number;
  clientY: number;
};

export type SceneContextMenuItemDescriptor = {
  id: string;
  label: string;
  order?: number;
  isVisible?: (context: SceneContextMenuContext) => boolean;
  isEnabled?: (context: SceneContextMenuContext) => boolean;
  onSelect: (context: SceneContextMenuContext) => void;
};

type RegisteredSceneContextMenuItem = SceneContextMenuItemDescriptor & { order: number };

export class SceneContextMenuRegistry {
  private items: RegisteredSceneContextMenuItem[] = [];
  private listeners = new Set<RegistryListener>();

  register(descriptor: SceneContextMenuItemDescriptor): () => void {
    const entry: RegisteredSceneContextMenuItem = { ...descriptor, order: descriptor.order ?? 0 };
    this.items.push(entry);
    this.items.sort((a, b) => a.order - b.order);
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
    return this.items.filter((item) => !item.isVisible || item.isVisible(context));
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

export type EditorUIPluginContext = {
  editor: Editor;
  propertyInspectors: {
    register: (descriptor: PropertyInspectorDescriptor) => () => void;
  };
  modals: {
    open: (render: ModalRenderer) => ModalHandle;
  };
  sceneContextMenu: {
    registerItem: (descriptor: SceneContextMenuItemDescriptor) => () => void;
  };
};

export type EditorUIPlugin = {
  id: string;
  activate: (context: EditorUIPluginContext) => void | (() => void);
};

export const activateEditorPlugins = (
  editor: Editor,
  registries: {
    propertyInspectors: PropertyInspectorRegistry;
    modals: ModalManager;
    sceneContextMenu: SceneContextMenuRegistry;
  },
  plugins: EditorUIPlugin[]
): (() => void) => {
  const context: EditorUIPluginContext = {
    editor,
    propertyInspectors: {
      register: (descriptor) => registries.propertyInspectors.register(descriptor),
    },
    modals: {
      open: (render) => registries.modals.open(render),
    },
    sceneContextMenu: {
      registerItem: (descriptor) => registries.sceneContextMenu.register(descriptor),
    },
  };

  const disposers = plugins.map((plugin) => {
    const dispose = plugin.activate(context);
    return typeof dispose === "function" ? dispose : () => {};
  });

  return () => {
    for (const dispose of disposers) {
      dispose();
    }
    registries.propertyInspectors.clear();
    registries.sceneContextMenu.clear();
    registries.modals.clear();
  };
};

type PropertyInspectorPanelDependencies = { editor: typeof Editor };
type PropertyInspectorPanelProps = {
  registry: PropertyInspectorRegistry;
} & InjectedProps<PropertyInspectorPanelDependencies>;

const PropertyInspectorPanelBase = ({ editor, registry }: PropertyInspectorPanelProps) => {
  const [selection, setSelection] = useState<Actor[]>([]);
  const [, setRevision] = useState(0);

  useEffect(() => {
    return registry.subscribe(() => {
      setRevision((previous) => previous + 1);
    });
  }, [registry]);

  useEffect(() => {
    if (!editor) {
      setSelection([]);
      return;
    }

    const handleSelectionChange = () => {
      setSelection(editor.getSelectedActors());
    };

    editor.subscribe("actor:selected", handleSelectionChange);
    handleSelectionChange();

    return () => {
      editor.unsubscribe("actor:selected", handleSelectionChange);
    };
  }, [editor]);

  let content: ReactNode;

  if (!editor) {
    content = (
      <div className="text-xs" style={{ color: theme.text }}>
        Editor not initialized.
      </div>
    );
  } else if (selection.length === 0) {
    content = (
      <div className="text-xs" style={{ color: theme.text }}>
        Select an actor to view its properties.
      </div>
    );
  } else {
    const inspector = registry.resolve(selection);

    if (!inspector) {
      content = (
        <div className="text-xs" style={{ color: theme.text }}>
          No property inspector available for this selection.
        </div>
      );
    } else {
      const selectionKey = selection.map((actor) => actor.getId()).join("|") || inspector.id;
      content = <div key={`${inspector.id}:${selectionKey}`}>{inspector.render({ selection })}</div>;
    }
  }

  return <div className="space-y-3">{content}</div>;

};

export const PropertyInspectorPanel = withInjection<PropertyInspectorPanelDependencies>({
  editor: Editor,
})(PropertyInspectorPanelBase);

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
        <div
          className="pointer-events-none absolute inset-0 z-[1500]"
          onContextMenu={(event) => event.preventDefault()}
        >
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
