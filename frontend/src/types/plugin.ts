import type { PodProvider } from "./pod";

export interface InstalledPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  repo: string;
  /** 支援此 plugin 的 provider 清單；使用 PodProvider（string）不限定特定 provider */
  compatibleProviders: PodProvider[];
}
