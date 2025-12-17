# Editor Plugin Example

This guide walks through creating a minimal editor UI plugin that adds a custom property inspector panel. It assumes the editor already provides the IoC utilities (`withInjection`, `useInjectedDependencies`) and the plugin registry infrastructure found in `src/apps/editor/src/plugins/pluginSystem.tsx`.

## 1. Create the plugin file

Add a new file under `src/apps/editor/src/plugins`. For example:

```
src/apps/editor/src/plugins/examplePropertiesPlugin.tsx
```

Paste the following starter code:

```tsx
import { useMemo } from "react";
import type { Actor, Editor } from "@repo/engine";
import type { EditorUIPlugin } from "./pluginSystem";
import { withInjection } from "../ioc/ioc";

// Component props resolve dependencies automatically via withInjection
const ExampleInspectorBase = ({ editor }: { editor: Editor }) => {
  const selection = editor.getSelectedActors();
  const actorNames = useMemo(
    () => selection.map((actor) => actor.constructor?.name ?? actor.getId()),
    [selection]
  );

  if (selection.length === 0) {
    return <div className="text-xs">Select an actor to view examples</div>;
  }

  return (
    <div className="space-y-2 text-xs">
      <div className="font-semibold">Example Inspector</div>
      <div>Selection count: {selection.length}</div>
      <ul className="list-disc list-inside space-y-1">
        {actorNames.map((name, index) => (
          <li key={index}>{name}</li>
        ))}
      </ul>
    </div>
  );
};

const ExampleInspector = withInjection({ editor: Editor })(ExampleInspectorBase);

const examplePropertiesPlugin: EditorUIPlugin = {
  id: "example.properties",
  activate: ({ propertyInspectors }) => {
    // Register a property inspector that applies whenever actors are selected
    const unregisterInspector = propertyInspectors.register({
      id: "example.properties.panel",
      order: 100,
      appliesTo: (selection: Actor[]) => selection.length > 0,
      render: () => <ExampleInspector />,
    });

    return () => {
      unregisterInspector();
    };
  },
};

export default examplePropertiesPlugin;
```

Key points:

- `withInjection({ editor: Editor })` resolves the `Editor` instance from the IoC container automatically. The exported component only needs props that aren’t injected.
- The `activate` function returns a disposer to clean up the registration when the plugin unloads.

## 2. Register the plugin in the manifest

Edit `src/apps/editor/src/plugins/manifest.ts` and add the entry so the plugin loader can discover it:

```ts
export const editorPluginManifest: EditorPluginManifestEntry[] = [
  {
    id: "example.properties",
    title: "Example Properties Panel",
    description: "Demonstrates a simple inspector plugin.",
    entrypoint: "./examplePropertiesPlugin",
    enabled: true,
  },
];
```

Multiple plugins can be listed in this array. Toggle `enabled` to disable a plugin without removing it.

## 3. Rebuild or restart the editor

1. Restart the development server (`npm run dev` or equivalent) if it was already running.
2. Launch the editor application. The manifest loader dynamically imports the plugin module using the `entrypoint` path.

## 4. Verify the plugin

- Select one or more actors in the scene.
- The property panel should display “Example Inspector” along with the count and names of selected actors.

## 5. Extend the plugin

From here you can:

- Add modals via `context.modals.open`.
- Contribute scene context menu items through `context.sceneContextMenu.registerItem`.
- Resolve additional services by expanding the `withInjection` dependency map.

Refer to `pluginSystem.tsx` for registry APIs and the IoC helper definitions in `src/apps/editor/src/ioc/ioc.ts`. This pattern keeps plugin components decoupled from manual prop wiring while still supporting full editor integration.
