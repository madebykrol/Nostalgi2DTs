export const theme = {
  bg: "#070b14",
  panel: "rgba(14, 20, 35, 0.9)",
  text: "#e6f0ff",
  neon: {
    cyan: "#08f7fe",
    magenta: "#fe53bb",
    purple: "#9d4edd",
  },
} as const;

export type Theme = typeof theme;
