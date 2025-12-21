# Editor UI Plugin Guide

This walkthrough shows how to add a custom panel to the in-editor UI and hook into the shared registries for context menus and modals. The examples assume access to the IoC helpers (`withInjection`, `useInjectedDependencies`) and the plugin runtime in `src/apps/editor/src/plugins/pluginSystem.tsx`.

## 1. Create a plugin module

Add a new file under `src/apps/editor/src/plugins`. For example:

```
src/apps/editor/src/plugins/selectionInfoPlugin.tsx
```

Paste the following starter code:

```tsx
import { useMemo } from "react";
import { Editor } from "@repo/engine";
import { EditorUIPlugin } from "@repo/engine/editor/editorUIPlugin";
import { withInjection } from "../ioc/ioc";

const SelectionPanelBase = ({ editor }: { editor: Editor }) => {
  const selection = editor.getSelectedActors();
  const names = useMemo(
    () => selection.map((actor) => actor.constructor?.name ?? actor.getId()),
    [selection]
  );

  if (selection.length === 0) {
    return <div className="text-xs">Select an actor to see details.</div>;
  }

  return (
    <div className="space-y-2 text-xs">
      <div className="font-semibold">Selection</div>
      <div>Actors: {selection.length}</div>
      <ul className="list-disc list-inside space-y-1">
        {names.map((name, index) => (
          <li key={index}>{name}</li>
        ))}
      </ul>
    </div>
  );
};

const SelectionPanel = withInjection({ editor: Editor })(SelectionPanelBase);

const selectionInfoPlugin: EditorUIPlugin = {
  id: "example.selection-info",
  activate: ({ panels }) => {
    const unregisterPanel = panels.register({
      id: "example.selection-info.panel",
      title: "Selection",
      location: "left",
      order: 200,
      render: ({ editor }) => <SelectionPanel editor={editor} />,
    });

    return () => {
      unregisterPanel();
    };
  },
};

export default selectionInfoPlugin;
```

Key points:

- `EditorUIPlugin` now lives in `@repo/engine/editor/editorUIPlugin`, shared between the runtime and plugin authors.
- `panels.register` takes an ID, title, `location` (`"left"` or `"right"`), optional sort `order`, and a `render` function that receives `{ editor }`.
- The dispose function returned from `activate` must clean up every registry contribution.

## 2. Register the plugin entry

Before plugins load, push an entry into the editor manifest using `editor.registerPlugin`. A convenient place is right after the editor resolves from the IoC container.

```ts
// src/apps/editor/src/registerBuiltInEditorPlugins.ts
import { Editor } from "@repo/engine";

export const registerBuiltInEditorPlugins = (editor: Editor) => {
  editor.registerPlugin({
    id: "example.selection-info",
    title: "Selection Info",
    description: "Shows basic data about the current selection.",
    entrypoint: "./plugins/selectionInfoPlugin",
    enabled: true,
  });
};
```

Then call this helper once in the editor bootstrap (for example in `main.tsx`) before invoking `editor.loadEnabledEditorPlugins()`.

## 3. Rebuild or restart the editor

1. Restart the development server (`npm run dev`, `npm run debug`, etc.) if it is already running.
2. Launch the editor application so the manifest loader can dynamically import the new plugin module from the provided `entrypoint`.

## 4. Verify the panel

- Select one or more actors in the scene view.
- The left sidebar should display the new “Selection” tab with the actor count and names when active.

## 5. Extend the plugin

You can register additional contributions inside the same `activate` call:

```ts
activate: ({ editor, panels, sceneContextMenu, modals }) => {
  const disposers = [
    panels.register({
      id: "example.selection-info.panel",
      title: "Selection",
      location: "left",
      render: ({ editor }) => <SelectionPanel editor={editor} />,
    }),
    sceneContextMenu.registerItem({
      id: "example.selection.focus-camera",
      label: "Focus Camera",
      order: 50,
      isVisible: ({ selection }) => selection.length > 0,
      onSelect: ({ editor, selection }) => {
        editor.selectActors(selection, selection[0] ?? null);
      },
    }),
  ];

  return () => {
    disposers.forEach((dispose) => dispose());
  };
},
```

- `sceneContextMenu.registerItem` filters entries with optional `isVisible`/`isEnabled` callbacks and invokes `onSelect` when the user clicks the item.
- `modals.open` shows a floating modal and returns a handle with `close()`; call it in response to UI events inside the registered panel or context menu item.

This structure keeps editor extensions loosely coupled: panels, context menus, and modals can be registered independently while relying on the shared `EditorUIPluginContext` API.
