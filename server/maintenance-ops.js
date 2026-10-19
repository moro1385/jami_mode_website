const refs = new Set(['klfmscuogsocfjxqkuib', 'cifhcrlmjnsxpkhyloen']);
const count = value => Number.isSafeInteger(value) && value >= 0;
export function maintenanceOptions(args) {
  const [task, ...rest] = args;
  if (!['report', 'check', 'expire', 'reconcile'].includes(task)) throw new Error('Invalid maintenance task');
  const options = { task, batch: 50, execute: false };
  const seen = new Set();
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (seen.has(key)) throw new Error('Duplicate maintenance option');
    seen.add(key);
    if (key === '--execute') options.execute = true;
    else if (key === '--project-ref') options.ref = rest[++i];
    else if (key === '--batch') {
      const value = rest[++i];
      if (!/^[1-9][0-9]{0,2}$/.test(value ?? '')) throw new Error('Invalid maintenance batch');
      options.batch = Number(value);
    } else throw new Error('Unknown maintenance option');
  }
  if (!refs.has(options.ref) || options.batch > 100 || (!['report', 'check'].includes(task) && !options.execute)
      || (['report', 'check'].includes(task) && (options.execute || seen.has('--batch')))) throw new Error('Invalid maintenance options');
  return Object.freeze(options);
}
export function maintenanceConfig(options, env) {
  const url = `https://${options.ref}.supabase.co`;
  if (!refs.has(options.ref) || env.SUPABASE_URL !== url) throw new Error('Explicit project does not match server configuration');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key?.startsWith('sb_secret_')) {
    try {
      const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
      if (claims.role !== 'service_role' || (claims.ref && claims.ref !== options.ref)) throw new Error();
    } catch { throw new Error('Server-only Supabase credential required'); }
  }
  return Object.freeze({ url, key });
}
export function maintenanceFetch(origin, transport = globalThis.fetch) {
  return async (input, init = {}) => {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const url = new URL(raw);
    const method = (init.method ?? (typeof input === 'object' && input.method) ?? 'GET').toUpperCase();
    if (url.origin !== origin || url.username || url.password || url.search || url.hash || method !== 'POST'
      || !['/rest/v1/rpc/trusted_maintenance_status', '/rest/v1/rpc/trusted_maintenance_run'].includes(url.pathname)) throw new Error('Maintenance transport blocked');
    const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
    return transport(input, { ...init, signal, redirect: 'error' });
  };
}
export async function runMaintenance(options, client) {
  const report = ['report', 'check'].includes(options.task);
  const { data, error } = await client.rpc(report ? 'trusted_maintenance_status' : 'trusted_maintenance_run', report ? {} : {
    p_expire_limit: options.task === 'expire' ? options.batch : 0,
    p_reconcile_limit: options.task === 'reconcile' ? options.batch : 0,
  });
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Maintenance result unavailable');
  if (report) {
    const result = {};
    for (const key of ['expiredUnstarted', 'verifiedReady', 'verificationUncertain', 'creatingOver15m', 'readyWithoutEvidenceOver30m']) {
      if (!count(data[key])) throw new Error('Invalid maintenance report');
      result[key] = data[key];
    }
    const lastRun = last => {
      if (last === null) return null;
      if (!last || typeof last.finishedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(last.finishedAt)
        || !['expired', 'settled', 'pending'].every(key => count(last[key]))) throw new Error('Invalid last run');
      return { finishedAt: last.finishedAt, expired: last.expired, settled: last.settled, pending: last.pending };
    };
    result.lastRun = lastRun(data.lastRun);
    if (Object.hasOwn(data, 'lastExpiryRun')) {
      result.lastExpiryRun = lastRun(data.lastExpiryRun);
      if (result.lastExpiryRun && (result.lastExpiryRun.settled !== 0 || result.lastExpiryRun.pending !== 0)) throw new Error('Invalid expiry report');
    }
    return result;
  }
  if (data.skipped === true) return { skipped: true };
  if (data.skipped !== false || !['expired', 'settled', 'pending'].every(key => count(data[key]) && data[key] <= options.batch)
    || (options.task === 'expire' && (data.settled !== 0 || data.pending !== 0))
    || (options.task === 'reconcile' && (data.expired !== 0 || data.settled + data.pending > options.batch))) throw new Error('Invalid maintenance result');
  return { skipped: false, expired: data.expired, settled: data.settled, pending: data.pending };
}
