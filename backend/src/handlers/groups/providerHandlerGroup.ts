import { WebSocketRequestEvents, WebSocketResponseEvents } from "../../schemas";
import { providerListSchema } from "../../schemas";
import { handleProviderList } from "../providerHandlers.js";
import { createHandlerGroup } from "./createHandlerGroup.js";

export const providerHandlerGroup = createHandlerGroup({
  name: "provider",
  handlers: [
    {
      event: WebSocketRequestEvents.PROVIDER_LIST,
      handler: handleProviderList,
      schema: providerListSchema,
      responseEvent: WebSocketResponseEvents.PROVIDER_LIST_RESULT,
    },
  ],
});
