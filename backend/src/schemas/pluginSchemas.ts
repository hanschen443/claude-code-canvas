import { z } from "zod";
import type { InstalledPlugin } from "../services/pluginScanner.js";
import { providerSchema } from "./podSchemas.js";

export const pluginListSchema = z.object({
  requestId: z.string(),
  provider: providerSchema.optional(),
});

export type PluginListPayload = z.infer<typeof pluginListSchema>;

export interface PluginListResultPayload {
  requestId: string;
  success: boolean;
  plugins?: InstalledPlugin[];
  error?: string;
}
