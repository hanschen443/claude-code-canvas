import type { Mock } from 'vitest';

vi.mock('../../src/services/podStore.js', () => ({
    podStore: {
        setStatus: vi.fn(),
    },
}));

vi.mock('../../src/services/messageStore.js', () => ({
    messageStore: {
        addMessage: vi.fn(),
    },
}));

vi.mock('../../src/services/socketService.js', () => ({
    socketService: {
        emitToCanvas: vi.fn(),
    },
}));

import { beforeEach, describe, expect, it } from 'vitest';
import { extractDisplayContent, injectUserMessage } from '../../src/utils/chatHelpers.js';
import { podStore } from '../../src/services/podStore.js';
import { messageStore } from '../../src/services/messageStore.js';
import { socketService } from '../../src/services/socketService.js';
import { WebSocketResponseEvents } from '../../src/schemas/events.js';
import type { ContentBlock } from '../../src/types/index.js';

function asMock(fn: unknown): Mock<any> {
    return fn as Mock<any>;
}

describe('extractDisplayContent', () => {
    it('傳入 string 時直接回傳原始字串', () => {
        const result = extractDisplayContent('hello world');
        expect(result).toBe('hello world');
    });

    it('傳入含 text block 的 ContentBlock[] 時回傳合併文字', () => {
        const blocks: ContentBlock[] = [
            { type: 'text', text: 'foo' },
            { type: 'text', text: 'bar' },
        ];
        const result = extractDisplayContent(blocks);
        expect(result).toBe('foobar');
    });

    it('傳入含 image block 的 ContentBlock[] 時 image 轉為 [image]', () => {
        const blocks: ContentBlock[] = [
            { type: 'image', mediaType: 'image/png', base64Data: 'abc' },
        ];
        const result = extractDisplayContent(blocks);
        expect(result).toBe('[image]');
    });

    it('傳入混合 text + image 時正確組合', () => {
        const blocks: ContentBlock[] = [
            { type: 'text', text: '看這張圖：' },
            { type: 'image', mediaType: 'image/png', base64Data: 'abc' },
            { type: 'text', text: '這是說明' },
        ];
        const result = extractDisplayContent(blocks);
        expect(result).toBe('看這張圖：[image]這是說明');
    });
});

describe('injectUserMessage', () => {
    const canvasId = 'canvas-1';
    const podId = 'pod-1';

    beforeEach(() => {
        vi.resetAllMocks();
        asMock(messageStore.addMessage).mockResolvedValue(undefined);
    });

    it('呼叫後 podStore.setStatus 被設為 chatting', async () => {
        await injectUserMessage({ canvasId, podId, content: '測試' });

        expect(podStore.setStatus).toHaveBeenCalledWith(canvasId, podId, 'chatting');
    });

    it('呼叫後 messageStore.addMessage 加入 user 訊息', async () => {
        await injectUserMessage({ canvasId, podId, content: '你好' });

        expect(messageStore.addMessage).toHaveBeenCalledWith(canvasId, podId, 'user', '你好');
    });

    it('呼叫後 socketService.emitToCanvas 廣播正確 payload', async () => {
        await injectUserMessage({ canvasId, podId, content: '廣播測試' });

        expect(socketService.emitToCanvas).toHaveBeenCalledWith(
            canvasId,
            WebSocketResponseEvents.POD_CHAT_USER_MESSAGE,
            expect.objectContaining({
                canvasId,
                podId,
                content: '廣播測試',
                messageId: expect.any(String),
                timestamp: expect.any(String),
            }),
        );
    });

    it('content 為 ContentBlock[] 時先經 extractDisplayContent 轉換', async () => {
        const blocks: ContentBlock[] = [
            { type: 'text', text: '區塊文字' },
            { type: 'image', mediaType: 'image/png', base64Data: 'xyz' },
        ];

        await injectUserMessage({ canvasId, podId, content: blocks });

        const expectedDisplay = '區塊文字[image]';
        expect(messageStore.addMessage).toHaveBeenCalledWith(canvasId, podId, 'user', expectedDisplay);
        expect(socketService.emitToCanvas).toHaveBeenCalledWith(
            canvasId,
            WebSocketResponseEvents.POD_CHAT_USER_MESSAGE,
            expect.objectContaining({ content: expectedDisplay }),
        );
    });
});
