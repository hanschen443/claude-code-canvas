import { describe, it, expect } from 'vitest';
import { buildDisplayContentWithCommand } from '../../src/utils/chatHelpers.js';

describe('buildDisplayContentWithCommand', () => {
  it('有 commandId 時回傳 /{commandId} {content} 格式', () => {
    const result = buildDisplayContentWithCommand('你好', 'greet');
    expect(result).toBe('/greet 你好');
  });

  it('無 commandId 時回傳原始 content', () => {
    const result = buildDisplayContentWithCommand('你好', null);
    expect(result).toBe('你好');
  });

  it('content 為空字串時仍正確加前綴', () => {
    const result = buildDisplayContentWithCommand('', 'cmd');
    expect(result).toBe('/cmd ');
  });

  it('commandId 為空字串時回傳原始 content', () => {
    const result = buildDisplayContentWithCommand('hello', '');
    expect(result).toBe('hello');
  });
});
