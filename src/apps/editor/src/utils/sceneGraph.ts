import { Actor } from "@repo/engine";

export type SceneNode = {
  id: string;
  name: string;
  actor: Actor;
  children: SceneNode[];
};

export const areSceneNodesEqual = (a: SceneNode, b: SceneNode): boolean => {
  if (a.id !== b.id || a.name !== b.name) {
    return false;
  }
  return areSceneGraphsEqual(a.children, b.children);
};

export const areSceneGraphsEqual = (a: SceneNode[], b: SceneNode[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (!areSceneNodesEqual(a[i], b[i])) {
      return false;
    }
  }
  return true;
};

export const buildSceneGraph = (rootActors: Actor[]): SceneNode[] => {
  const traverse = (actor: Actor): SceneNode => {
    const children = actor.getChildrenOfType(Actor).map(traverse);
    return {
      id: actor.getId(),
      name: (actor as any).name ?? actor.constructor?.name ?? "Actor",
      actor,
      children,
    };
  };
  return rootActors.map(traverse);
};
