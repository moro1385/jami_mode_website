export function parseLegacyQuery(query?: string): string[] {
  if (!query) return [];
  return query
    .split(/\s+OR\s+|\s+AND\s+|,/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.includes(":") ? part.split(":").slice(1).join(":") : part))
    .map((part) => part.replace(/["']/g, "").trim())
    .filter(Boolean);
}
