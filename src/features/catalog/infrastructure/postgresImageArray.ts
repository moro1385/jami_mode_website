// Array elements are already validated (no controls or malformed UTF-16).
// JSON string quoting matches PostgreSQL quoted text-array escaping for these strings.
export function postgresImageArray(values: string[]): string {
 if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) throw Error('Invalid image comparison');
 for (const value of values) encodeURIComponent(value);
 const literal = '{' + values.map(value => JSON.stringify(value)).join(',') + '}';
 if (new URLSearchParams({ images: 'eq.' + literal }).toString().length > 6000) throw Error('فهرست عکس‌ها برای ویرایش گروهی بیش از حد بزرگ است؛ از ویرایش تکی استفاده کنید.');
 return literal;
}
