/** The quiet ground and brass accent originate in Henry Williams's Prospect maps. */
export interface Theme {
  background: string;
  land: string;
  street: string;
  boundary: string;
  accent: string;
  ink: string;
  muted: string;
  buildingLow: string;
  buildingHigh: string;
  selection: string;
  /** Sky above the horizon when 3D terrain is enabled. Defaults to the background. */
  sky?: string;
}
export const themes = {
  blueprint: { background: '#0c1322', land: '#101a2e', street: '#1a2438', boundary: '#46516b', accent: '#d9a44e', ink: '#eef1f6', muted: '#7683a0', buildingLow: '#26354d', buildingHigh: '#8a9bb3', selection: '#ffe1a1', sky: '#1b2740' },
  paper: { background: '#dfe4ed', land: '#f7f8fb', street: '#e6eaf2', boundary: '#858c99', accent: '#874400', ink: '#12151c', muted: '#656c7a', buildingLow: '#d0d7e2', buildingHigh: '#687b96', selection: '#a55d18', sky: '#c9d3e4' },
} satisfies Record<string, Theme>;
export type ThemeName = keyof typeof themes;
export function resolveTheme(theme: ThemeName | Theme = 'blueprint'): Theme {
  return typeof theme === 'string' ? themes[theme] : theme;
}
