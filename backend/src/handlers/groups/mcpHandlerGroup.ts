import {
  WebSocketRequestEvents,
  WebSocketResponseEvents,
} from "../../schemas/index.js";
import {
  mcpListRequestSchema,
  podSetMcpServerNamesSchema,
} from "../../schemas/mcpSchemas.js";
import { handleMcpList, handlePodSetMcpServerNames } from "../mcpHandlers.js";
import { createHandlerGroup } from "./createHandlerGroup.js";

export const mcpHandlerGroup = createHandlerGroup({
  name: "mcp",
  handlers: [
    {
      event: WebSocketRequestEvents.MCP_LIST,
      handler: handleMcpList,
      schema: mcpListRequestSchema,
      responseEvent: WebSocketResponseEvents.MCP_LIST_RESULT,
    },
    {
      event: WebSocketRequestEvents.POD_SET_MCP_SERVER_NAMES,
      handler: handlePodSetMcpServerNames,
      schema: podSetMcpServerNamesSchema,
      responseEvent: WebSocketResponseEvents.POD_MCP_SERVER_NAMES_UPDATED,
    },
  ],
});
