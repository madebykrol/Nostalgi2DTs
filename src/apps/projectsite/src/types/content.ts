// Type definitions for JSON content files

export interface Navigation {
  brand: {
    name: string;
    tagline: string;
  };
  externalLinks: ExternalLink[];
  routes: Route[];
}

export interface ExternalLink {
  id: string;
  label: string;
  url: string;
  icon: string;
}

export interface Route {
  id: string;
  label: string;
  icon: string;
  contentFile: string;
}

export interface HomeContent {
  hero: {
    title: string;
    subtitle: string;
    cta: CTAButton[];
  };
  features: Feature[];
  pitch: {
    title: string;
    columns: string[][];
  };
}

export interface CTAButton {
  label: string;
  icon?: string;
  action: string;
  target?: string;
  style: "primary" | "ghost";
}

export interface Feature {
  title: string;
  description: string;
  icon: string;
  color: string;
}

export interface DocsContent {
  title: string;
  sections: DocSection[];
}

export interface DocSection {
  id: string;
  title: string;
  summary: string;
  content: ContentBlock[];
}

export interface ContentBlock {
  type: "paragraph" | "heading" | "list" | "code";
  text?: string;
  level?: number;
  items?: string[];
  language?: string;
  code?: string;
}

export interface ApiContent {
  title: string;
  subtitle: string;
  modules: ApiModule[];
}

export interface ApiModule {
  name: string;
  description: string;
  color: string;
  example: string;
}

export interface TutorialsContent {
  title: string;
  subtitle: string;
  tutorials: Tutorial[];
}

export interface Tutorial {
  title: string;
  summary: string;
  color: string;
  steps?: string[];
}
