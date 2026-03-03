import { describe, it, expect } from 'vitest'
import { updateAssistantSubMessages, finalizeSubMessages } from '@/stores/chat/subMessageHelpers'
import type { Message, SubMessage } from '@/types/chat'

describe('updateAssistantSubMessages', () => {
  const buildMessage = (overrides: Partial<Message> = {}): Message => ({
    id: 'msg-1',
    role: 'assistant',
    content: 'Hello',
    isPartial: true,
    timestamp: new Date().toISOString(),
    subMessages: [{ id: 'msg-1-sub-0', content: 'Hello', isPartial: true }],
    expectingNewBlock: false,
    ...overrides,
  })

  it('應呼叫 updateSubMessageContent 更新 subMessages', () => {
    const existingMessage = buildMessage()
    const result = updateAssistantSubMessages(existingMessage, ' World', true, 'Hello World')

    expect(result.subMessages).toBeDefined()
    expect(result.subMessages).toHaveLength(1)
    expect(result.subMessages![0]!.content).toBe('Hello World')
  })

  it('應將 expectingNewBlock 從 true 設為 false', () => {
    const existingMessage = buildMessage({ expectingNewBlock: true })
    const result = updateAssistantSubMessages(existingMessage, 'delta', true, 'content')

    expect(result.expectingNewBlock).toBe(false)
  })

  it('expectingNewBlock 為 undefined 時應維持 undefined', () => {
    const existingMessage = buildMessage({ expectingNewBlock: undefined })
    const result = updateAssistantSubMessages(existingMessage, 'delta', true, 'content')

    expect(result.expectingNewBlock).toBeUndefined()
  })
})

describe('finalizeSubMessages', () => {
  it('subMessages 為 undefined 時應回傳 undefined', () => {
    expect(finalizeSubMessages(undefined)).toBeUndefined()
  })

  it('subMessages 為空陣列時應回傳 undefined', () => {
    expect(finalizeSubMessages([])).toBeUndefined()
  })

  it('無 toolUse 的 sub 應將 isPartial 設為 false', () => {
    const subMessages: SubMessage[] = [
      { id: 'sub-1', content: '內容', isPartial: true },
    ]
    const result = finalizeSubMessages(subMessages)

    expect(result).toBeDefined()
    expect(result![0]!.isPartial).toBe(false)
    expect(result![0]!.toolUse).toBeUndefined()
  })

  it('toolUse 為空陣列的 sub 應將 isPartial 設為 false 且移除 toolUse', () => {
    const subMessages: SubMessage[] = [
      { id: 'sub-1', content: '內容', isPartial: true, toolUse: [] },
    ]
    const result = finalizeSubMessages(subMessages)

    expect(result).toBeDefined()
    expect(result![0]!.isPartial).toBe(false)
    expect(result![0]!.toolUse).toBeUndefined()
  })

  it('running 狀態的 toolUse 應被標記為 completed', () => {
    const subMessages: SubMessage[] = [
      {
        id: 'sub-1',
        content: '內容',
        isPartial: true,
        toolUse: [
          { toolUseId: 'tool-1', toolName: 'bash', status: 'running', input: {} },
        ],
      },
    ]
    const result = finalizeSubMessages(subMessages)

    expect(result).toBeDefined()
    expect(result![0]!.isPartial).toBe(false)
    expect(result![0]!.toolUse![0]!.status).toBe('completed')
  })

  it('已是 completed 狀態的 toolUse 應維持不變', () => {
    const subMessages: SubMessage[] = [
      {
        id: 'sub-1',
        content: '內容',
        isPartial: true,
        toolUse: [
          { toolUseId: 'tool-1', toolName: 'bash', status: 'completed', input: {} },
        ],
      },
    ]
    const result = finalizeSubMessages(subMessages)

    expect(result).toBeDefined()
    expect(result![0]!.toolUse![0]!.status).toBe('completed')
  })
})
