import type { EditorUIPlugin } from "./pluginSystem";

export type EditorPluginManifestEntry = {
  id: string;
  title: string;
  description?: string;
  entrypoint: string; // Path to a module exporting an EditorUIPlugin (property panels, modals, context menus, etc.).
  exportName?: string;
  enabled?: boolean;
};

export const editorPluginManifest: EditorPluginManifestEntry[] = [];

export const loadEnabledEditorPlugins = async (): Promise<EditorUIPlugin[]> => {
  const entries = editorPluginManifest.filter((entry) => entry.enabled !== false);
  const plugins: EditorUIPlugin[] = [];

  for (const entry of entries) {
    try {
      const module = (await import(/* @vite-ignore */ entry.entrypoint)) as Record<string, EditorUIPlugin | undefined>;
      const exportName = entry.exportName ?? "default";
      const plugin = module[exportName];

      if (!plugin) {
        console.warn(`Editor plugin "${entry.id}" failed to load export "${exportName}" from ${entry.entrypoint}`);
        continue;
      }

      plugins.push(plugin);
    } catch (error) {
      console.error(`Failed to load editor plugin module "${entry.id}" from ${entry.entrypoint}`, error);
    }
  }

  return plugins;
};
