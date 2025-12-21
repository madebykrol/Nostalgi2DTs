import type { DragEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { Editor } from ".";
import { Actor, Engine } from "..";

export type PanelLocation = "left" | "right";

export type PanelRenderProps = {
  editor: Editor;
};

export type PanelDescriptor = {
  id: string;
  title: string;
  location: PanelLocation;
  order?: number;
  render: (props: PanelRenderProps) => ReactNode;
};

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

export type SceneDragContext = {
  editor: Editor;
  engine: Engine<unknown, unknown> | null;
  canvas: HTMLCanvasElement | null;
};

export type SceneDragHandlerDescriptor = {
  id: string;
  order?: number;
  onDragOver?: (event: DragEvent, context: SceneDragContext) => boolean | void;
  onDrop?: (event: DragEvent, context: SceneDragContext) => boolean | void | Promise<boolean | void>;
};

export type ModalTriggerEventType = "actor.doubleClick" | "toolbar.menu";

export type ModalTriggerContextMap = {
  "actor.doubleClick": {
    editor: Editor;
    actor: Actor;
  };
  "toolbar.menu": {
    editor: Editor;
    menuId: string;
    event?: ReactMouseEvent;
  };
};

export type ModalTriggerDescriptor<T extends ModalTriggerEventType = ModalTriggerEventType> = {
  id: string;
  event: T;
  order?: number;
  menuId?: string | string[];
  isEnabled?: (context: ModalTriggerContextMap[T]) => boolean | Promise<boolean>;
  render: (context: ModalTriggerContextMap[T], api: { close: () => void }) => ReactNode;
};

export type ModalRenderer = (api: { close: () => void }) => ReactNode;
export type ModalHandle = { close: () => void };

export type EditorUIPluginContext = {
  editor: Editor;
  panels: {
    register: (descriptor: PanelDescriptor) => () => void;
  };
  sceneContextMenu: {
    registerItem: (descriptor: SceneContextMenuItemDescriptor) => () => void;
  };
  sceneDragDrop: {
    register: (descriptor: SceneDragHandlerDescriptor) => () => void;
  };
  modalTriggers: {
    register: (descriptor: ModalTriggerDescriptor) => () => void;
  };
  modals: {
    open: (render: ModalRenderer) => ModalHandle;
  };
  componentAssets?: ComponentAssetStorage;
  componentAssembler?: EditorComponentAssembler;
};

export type ComponentAsset = {
  id: string;
  name: string;
  type: string;
  description?: string;
  payload: unknown;
};

export type MeshComponentAssetPayload = {
  meshId: string;
  materialId: string;
  metadata?: Record<string, unknown>;
};

export type ComponentAssetStorage = {
  getAssets: () => ComponentAsset[];
  saveAsset: (asset: ComponentAsset) => Promise<void>;
  deleteAsset: (assetId: string) => Promise<void>;
};

export type EditorComponentAssembler = {
  attachComponentToActor: (actor: Actor, asset: ComponentAsset) => Promise<void>;
};

export type EditorUIPlugin = {
  id: string;
  activate: (context: EditorUIPluginContext) => void | (() => void);
};
