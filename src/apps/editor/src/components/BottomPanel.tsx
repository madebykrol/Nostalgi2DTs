import { useEffect, useMemo, useState } from "react";
import { theme } from "../theme";
import type { PanelRegistry } from "../plugins/pluginSystem";
import type { Editor } from "@repo/engine";

type BottomPanelProps = {
  panelRegistry: PanelRegistry;
  panelRevision: number;
  editor: Editor;
};

export const BottomPanel = ({ panelRegistry, panelRevision, editor }: BottomPanelProps) => {
  const bottomPanels = useMemo(() => panelRegistry.resolve("bottom"), [panelRegistry, panelRevision]);
  const [activeTabId, setActiveTabId] = useState<string>(() => bottomPanels[0]?.id ?? "");

  useEffect(() => {
    if (activeTabId && !bottomPanels.some((panel) => panel.id === activeTabId)) {
      setActiveTabId(bottomPanels[0]?.id ?? "");
    }
  }, [activeTabId, bottomPanels]);

  const activePanel = bottomPanels.find((panel) => panel.id === activeTabId);

  const ActivePanelComponent = useMemo(() => {
    if (!activePanel) {
      return null;
    }
    const Renderer = activePanel.render;
    return () => Renderer({ editor });
  }, [activePanel, editor]);

  if (bottomPanels.length === 0) {
    return null;
  }

  return (
    <div
      className="h-full flex flex-col border-t"
      style={{
        backgroundColor: theme.panel,
        borderColor: "rgba(8, 247, 254, 0.25)",
      }}
    >
      {/* Tab Headers */}
      <div
        className="flex items-center gap-1 px-4 py-2 border-b"
        style={{
          borderColor: "rgba(8, 247, 254, 0.2)",
        }}
      >
        {bottomPanels.map((panel) => (
          <button
            key={panel.id}
            onClick={() => setActiveTabId(panel.id)}
            className={`px-3 py-1.5 text-xs font-semibold tracking-wide rounded transition-all ${
              activeTabId === panel.id
                ? "border-b-2 border-cyan-400"
                : "border-b-2 border-transparent hover:border-cyan-400/30"
            }`}
            style={{
              color: activeTabId === panel.id ? theme.neon.cyan : theme.text,
            }}
          >
            {panel.title}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">{ActivePanelComponent ? <ActivePanelComponent /> : null}</div>
    </div>
  );
};
