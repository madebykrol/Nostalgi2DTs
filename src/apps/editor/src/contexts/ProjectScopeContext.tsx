import { createContext, useContext } from "react";

export type ProjectScopeValue = {
  projectId: string | null;
  projectTitle: string | null;
  projectPath: string | null;
  assetRoots: string[];
};

export const ProjectScopeContext = createContext<ProjectScopeValue>({
  projectId: null,
  projectTitle: null,
  projectPath: null,
  assetRoots: [],
});

export const useProjectScope = () => {
  return useContext(ProjectScopeContext);
};
