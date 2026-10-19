export const TEST_PROJECT_REF: string;
export function publicSupabaseConfig(env: Record<string, unknown>): { url: string; key: string; localTest: boolean };
export function testHtml(html: string, localTest: boolean): string;
export function browserStorageKey(name: string, mode: string): string;
