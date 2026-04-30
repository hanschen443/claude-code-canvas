import { WebSocketResponseEvents } from "../../schemas";
import { groupStore } from "../../services/groupStore.js";
import { emitNotFound } from "../../utils/websocketResponse.js";
import { socketService } from "../../services/socketService.js";

interface MoveToGroupConfig<TIdField extends string = string> {
  service: {
    exists: (id: string) => Promise<boolean>;
    setGroupId: (id: string, groupId: string | null) => Promise<void>;
  };
  resourceName: string;
  idField: TIdField;
  events: {
    moved: WebSocketResponseEvents;
  };
}

export function createMoveToGroupHandler<TIdField extends string>(
  config: MoveToGroupConfig<TIdField>,
) {
  return async (
    connectionId: string,
    payload: Record<TIdField, string> & { groupId: string | null },
    requestId: string,
  ): Promise<void> => {
    const resourceId = payload[config.idField];
    const groupId = payload.groupId;

    const resourceExists = await config.service.exists(resourceId);
    if (!resourceExists) {
      emitNotFound(
        connectionId,
        config.events.moved,
        config.resourceName,
        resourceId,
        requestId,
        null,
      );
      return;
    }

    if (groupId !== null) {
      // 目前只有 "command" 一種 groupType
      const groupExists = await groupStore.exists(groupId, "command");
      if (!groupExists) {
        emitNotFound(
          connectionId,
          config.events.moved,
          "Group",
          groupId,
          requestId,
          null,
        );
        return;
      }
    }

    await config.service.setGroupId(resourceId, groupId);

    socketService.emitToConnection(connectionId, config.events.moved, {
      requestId,
      success: true,
      [config.idField]: resourceId,
      groupId,
    });
  };
}
