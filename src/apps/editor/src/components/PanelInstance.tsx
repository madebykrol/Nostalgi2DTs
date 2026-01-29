import type { Editor } from "@nostalgi2d/engine";
import type { PanelRegistry } from "../plugins/pluginSystem";

type RegisteredPanelInstance = ReturnType<PanelRegistry["resolve"]>[number];

export const PanelInstance = ({ panel, editor }: { panel: RegisteredPanelInstance; editor: Editor }) => {
  return <>{panel.render({ editor })}</>;
};
