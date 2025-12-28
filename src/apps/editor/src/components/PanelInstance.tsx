import type { Editor } from "@repo/engine";
import type { PanelRegistry } from "../plugins/pluginSystem";

type RegisteredPanelInstance = ReturnType<PanelRegistry["resolve"]>[number];

export const PanelInstance = ({ panel, editor }: { panel: RegisteredPanelInstance; editor: Editor }) => {
  return <>{panel.render({ editor })}</>;
};
