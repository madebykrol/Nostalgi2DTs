import { useCallback, useEffect, useMemo, useState } from "react";
import { Actor, Editor, Engine } from "@repo/engine";
import { EditorUIPlugin } from "@repo/engine";
import { withInjection } from "../ioc/ioc";

type SceneNode = {
  id: string;
  name: string;
  actor: Actor;
  children: SceneNode[];
};

const buildSceneGraph = (actors: Actor[]): SceneNode[] => {
  const traverse = (actor: Actor): SceneNode => ({
    id: actor.getId(),
    name: (actor as any).name ?? actor.constructor?.name ?? "Actor",
    actor,
    children: actor.getChildrenOfType(Actor).map(traverse),
  });

  return actors.map(traverse);
};

const areSceneNodesEqual = (a: SceneNode, b: SceneNode): boolean => {
  if (a.id !== b.id || a.name !== b.name || a.actor !== b.actor) {
    return false;
  }
  return areSceneGraphsEqual(a.children, b.children);
};

const areSceneGraphsEqual = (a: SceneNode[], b: SceneNode[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index++) {
    if (!areSceneNodesEqual(a[index], b[index])) {
      return false;
    }
  }

  return true;
};

type SceneGraphPanelBaseProps = {
  editor: Editor;
  engine: Engine<unknown, unknown>;
};

const SceneGraphPanelBase = ({ editor, engine }: SceneGraphPanelBaseProps) => {
  const [nodes, setNodes] = useState<SceneNode[]>(() => buildSceneGraph(engine.getRootActors()));
  const [selection, setSelection] = useState<Actor[]>(() => editor.getSelectedActors());

  useEffect(() => {
    const handleSelectionChanged = () => {
      setSelection(editor.getSelectedActors());
    };

    editor.subscribe("actor:selected", handleSelectionChanged);
    return () => {
      editor.unsubscribe("actor:selected", handleSelectionChanged);
    };
  }, [editor]);

  useEffect(() => {
    const update = () => {
      const nextGraph = buildSceneGraph(engine.getRootActors());
      setNodes((previous) => (areSceneGraphsEqual(previous, nextGraph) ? previous : nextGraph));
    };

    update();
    const subscriptionId = engine.onAfterRender(update);
    return () => {
      engine.offAfterRender(subscriptionId);
    };
  }, [engine]);

  const selectedIds = useMemo(() => new Set(selection.map((actor) => actor.getId())), [selection]);
  const currentLevelName = engine.getCurrentLevel()?.name ?? null;

  const handleSelect = useCallback(
    (actor: Actor) => {
      editor.selectActors([actor], actor);
    },
    [editor]
  );

  const handleDoubleClick = useCallback(
    (actor: Actor) => {
      editor.emit("actor:double-click", actor);
    },
    [editor]
  );

  return (
    <div className="space-y-2 text-xs text-white/90">
      <header className="text-[11px] uppercase tracking-wide text-white/60">
        {currentLevelName ? `Level: ${currentLevelName}` : "World Actors"}
      </header>
      {nodes.length === 0 ? (
        <div className="text-xs text-white/60">Scene graph is empty.</div>
      ) : (
        <div className="space-y-1">
          {nodes.map((node) => (
            <SceneNodeEntry
              key={node.id}
              node={node}
              depth={0}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              onDoubleClick={handleDoubleClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

type SceneNodeEntryProps = {
  node: SceneNode;
  depth: number;
  selectedIds: Set<string>;
  onSelect: (actor: Actor) => void;
  onDoubleClick?: (actor: Actor) => void;
};

const SceneNodeEntry = ({ node, depth, selectedIds, onSelect, onDoubleClick }: SceneNodeEntryProps) => {
  const isSelected = selectedIds.has(node.id);

  return (
    <div className="space-y-1">
      <button
        type="button"
        className={`flex w-full items-center rounded px-2 py-1 transition-colors ${
          isSelected ? "bg-white/15 text-white" : "hover:bg-white/10 text-white/80"
        }`}
        style={{ paddingLeft: depth * 12 + 8 }}
        onClick={() => onSelect(node.actor)}
        onDoubleClick={() => onDoubleClick?.(node.actor)}
      >
        <span className="truncate">{node.name}</span>
      </button>
      {node.children.length > 0 && (
        <div className="space-y-1">
          {node.children.map((child) => (
            <SceneNodeEntry
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedIds={selectedIds}
              onSelect={onSelect}
              onDoubleClick={onDoubleClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const SceneGraphPanel = withInjection({ engine: Engine })(SceneGraphPanelBase);

const sceneGraphPanelPlugin: EditorUIPlugin = {
  id: "builtin.scene-graph",
  activate: ({ panels } : { panels: any }) => {
    const unregisterPanel = panels.register({
      id: "builtin.scene-graph.panel",
      title: "Scene",
      location: "left",
      order: 50,
      render: ({ editor } : { editor: Editor }) => <SceneGraphPanel editor={editor} />,
    });

    return () => {
      unregisterPanel();
    };
  },
};

export default sceneGraphPanelPlugin;