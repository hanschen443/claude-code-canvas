import {WebSocketResponseEvents} from '../schemas';
import type {
    CanvasPasteResultPayload,
    PasteError,
    OutputStyleNote,
    SkillNote,
    RepositoryNote,
    SubAgentNote,
    CommandNote,
    McpServerNote,
    Pod,
} from '../types';
import type {CanvasPastePayload} from '../schemas';
import {socketService} from '../services/socketService.js';
import {logger} from '../utils/logger.js';
import {withCanvasId} from '../utils/handlerHelpers.js';
import {
    createPastedPods,
    createPastedNotesByType,
    createPastedConnections,
} from './paste/pasteHelpers.js';
import {podStore} from '../services/podStore.js';

function syncBoundNotesToPod<TNote extends { boundToPodId: string | null }>(
    canvasId: string,
    notes: TNote[],
    getResourceId: (note: TNote) => string,
    shouldUpdate: (pod: Pod, resourceId: string) => boolean,
    updatePod: (canvasId: string, podId: string, resourceId: string) => void,
): void {
    for (const note of notes) {
        if (!note.boundToPodId) continue;
        const pod = podStore.getById(canvasId, note.boundToPodId);
        if (pod && shouldUpdate(pod, getResourceId(note))) {
            updatePod(canvasId, note.boundToPodId, getResourceId(note));
        }
    }
}

export const handleCanvasPaste = withCanvasId<CanvasPastePayload>(
    WebSocketResponseEvents.CANVAS_PASTE_RESULT,
    async (_connectionId: string, canvasId: string, payload: CanvasPastePayload, requestId: string): Promise<void> => {
        const {pods, outputStyleNotes, skillNotes, repositoryNotes, subAgentNotes, commandNotes, mcpServerNotes, connections} = payload;

        const podIdMapping: Record<string, string> = {};
        const errors: PasteError[] = [];

        const createdPods = await createPastedPods(canvasId, pods, podIdMapping, errors);

        const noteResultMap = {
            outputStyle: createPastedNotesByType('outputStyle', canvasId, outputStyleNotes, podIdMapping),
            skill: createPastedNotesByType('skill', canvasId, skillNotes, podIdMapping),
            repository: createPastedNotesByType('repository', canvasId, repositoryNotes, podIdMapping),
            subAgent: createPastedNotesByType('subAgent', canvasId, subAgentNotes, podIdMapping),
            command: createPastedNotesByType('command', canvasId, commandNotes ?? [], podIdMapping),
            mcpServer: createPastedNotesByType('mcpServer', canvasId, mcpServerNotes ?? [], podIdMapping),
        };

        errors.push(...Object.values(noteResultMap).flatMap(r => r.errors));

        const createdOutputStyleNotes = noteResultMap.outputStyle.notes as OutputStyleNote[];
        const createdSkillNotes = noteResultMap.skill.notes as SkillNote[];
        const createdRepositoryNotes = noteResultMap.repository.notes as RepositoryNote[];
        const createdSubAgentNotes = noteResultMap.subAgent.notes as SubAgentNote[];
        const createdCommandNotes = noteResultMap.command.notes as CommandNote[];
        const createdMcpServerNotes = noteResultMap.mcpServer.notes as McpServerNote[];

        const createdConnections = createPastedConnections(canvasId, connections, podIdMapping);

        syncBoundNotesToPod(
            canvasId,
            createdCommandNotes,
            note => note.commandId,
            pod => !pod.commandId,
            (cId, pId, cmdId) => podStore.setCommandId(cId, pId, cmdId),
        );

        syncBoundNotesToPod(
            canvasId,
            createdMcpServerNotes,
            note => note.mcpServerId,
            (pod, mcpId) => !pod.mcpServerIds.includes(mcpId),
            (cId, pId, mcpId) => podStore.addMcpServerId(cId, pId, mcpId),
        );

        const response: CanvasPasteResultPayload = {
            requestId,
            success: errors.length === 0,
            createdPods,
            createdOutputStyleNotes,
            createdSkillNotes,
            createdRepositoryNotes,
            createdSubAgentNotes,
            createdCommandNotes,
            createdMcpServerNotes,
            createdConnections,
            podIdMapping,
            errors,
        };

        if (errors.length > 0) {
            response.error = `貼上完成，但有 ${errors.length} 個錯誤`;
        }

        socketService.emitToCanvas(canvasId, WebSocketResponseEvents.CANVAS_PASTE_RESULT, response);

        const pasteItems: string[] = [];
        if (createdPods.length > 0) pasteItems.push(`${createdPods.length} pod`);
        if (createdOutputStyleNotes.length > 0) pasteItems.push(`${createdOutputStyleNotes.length} output style`);
        if (createdSkillNotes.length > 0) pasteItems.push(`${createdSkillNotes.length} skill`);
        if (createdRepositoryNotes.length > 0) pasteItems.push(`${createdRepositoryNotes.length} repository`);
        if (createdSubAgentNotes.length > 0) pasteItems.push(`${createdSubAgentNotes.length} subagent`);
        if (createdCommandNotes.length > 0) pasteItems.push(`${createdCommandNotes.length} command`);
        if (createdMcpServerNotes.length > 0) pasteItems.push(`${createdMcpServerNotes.length} mcp server`);
        if (createdConnections.length > 0) pasteItems.push(`${createdConnections.length} connection`);
        if (errors.length > 0) pasteItems.push(`${errors.length} 個錯誤`);

        logger.log('Paste', 'Complete', `貼上成功：${pasteItems.join('、')}`);
    }
);
