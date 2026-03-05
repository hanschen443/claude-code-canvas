export const INJECTION_PREFIX_PATTERN = /(^|\s)(System:|Human:|Assistant:)/g;

export function escapeUserInput(input: string): string {
    return input
        .replace(INJECTION_PREFIX_PATTERN, '$1\\$2')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/</g, '＜')
        .replace(/>/g, '＞');
}
