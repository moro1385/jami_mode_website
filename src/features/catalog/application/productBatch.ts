export type ProductBatchReport = { succeeded: string[]; unchanged: string[]; failed: string[]; unattempted: string[] };
export async function runProductBatch<T extends { id: string }>(queue: T[], unchanged: (target: T) => boolean, change: (target: T) => Promise<void>, current: () => boolean): Promise<ProductBatchReport> {
 const report: ProductBatchReport = { succeeded: [], unchanged: [], failed: [], unattempted: [] };
 for (let i = 0; i < queue.length; i++) {
  if (!current()) { report.unattempted.push(...queue.slice(i).map(target => target.id)); break; }
  const target = queue[i];
  if (unchanged(target)) { report.unchanged.push(target.id); continue; }
  try { await change(target); report.succeeded.push(target.id); }
  catch { report.failed.push(target.id); report.unattempted.push(...queue.slice(i + 1).map(row => row.id)); break; }
 }
 return report;
}
