import { describe, expect, it } from 'vitest';
import { isPodBusy } from '../../src/types/pod.js';

describe('isPodBusy', () => {
    it('status 為 chatting 時回傳 true', () => {
        expect(isPodBusy('chatting')).toBe(true);
    });

    it('status 為 summarizing 時回傳 true', () => {
        expect(isPodBusy('summarizing')).toBe(true);
    });

    it('status 為 idle 時回傳 false', () => {
        expect(isPodBusy('idle')).toBe(false);
    });

    it('status 為 error 時回傳 false', () => {
        expect(isPodBusy('error')).toBe(false);
    });
});
