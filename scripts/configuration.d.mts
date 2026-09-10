export interface Configuration {
  programRoot: string;
  configFile: string;
  legacyFile: string;
  settings: Record<string, string>;
  environment: NodeJS.ProcessEnv;
  sources: Record<string, string>;
}
export function resolveConfiguration(options: {
  programRoot: string;
  environment?: NodeJS.ProcessEnv;
  requirePaths?: boolean;
  preferLegacy?: boolean;
}): Configuration;
