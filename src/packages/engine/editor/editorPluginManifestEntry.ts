export type EditorPluginManifestEntry = {
  id: string;
  title: string;
  description?: string;
  entrypoint: string; // Path to a module exporting an EditorUIPlugin (property panels, modals, context menus, etc.).
  exportName?: string;
  enabled?: boolean;
};