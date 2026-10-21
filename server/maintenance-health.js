import { Router } from 'express';
import { isIP } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { maintenanceConfig, maintenanceFetch, maintenanceOptions, runMaintenance } from './maintenance-ops.js';

export function maintenanceHealthState(status, now = Date.now()) {
  if (!Number.isFinite(now) || !status || typeof status !== 'object') return 'unavailable';
  if (!Object.hasOwn(status, 'lastExpiryRun')) return 'unavailable';
  if (status.lastExpiryRun === null) return 'never_run';
  const stamp = status.lastExpiryRun?.finishedAt;
  if (typeof stamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(stamp)) return 'unavailable';
  const finished = Date.parse(stamp);
  if (!Number.isFinite(finished) || finished > now + 60000) return 'unavailable';
  return now - finished > 15 * 60000 ? 'stale' : 'healthy';
}

// A single shared in-flight read and a short cache bound database traffic even
// when the public health endpoint is polled concurrently. Raw errors never escape.
export function createMaintenanceHealth({ read, now = Date.now, cacheMs = 30000, notify = () => {} }) {
  let cached, cachedAt = -Infinity, pending, lastReported, lastWarningAt = -Infinity;
  async function refresh() {
    let state;
    try { state = maintenanceHealthState(await read(), now()); }
    catch { state = 'unavailable'; }
    cached = Object.freeze({ state, healthy: state === 'healthy' });
    cachedAt = now();
    if (state !== lastReported || (state !== 'healthy' && cachedAt - lastWarningAt >= 15 * 60000)) {
      lastReported = state;
      if (state !== 'healthy') lastWarningAt = cachedAt;
      // Fixed state codes only: never pass raw RPC output/errors to logs.
      try { notify(state); } catch { /* Logging cannot break the readiness response. */ }
    }
    return cached;
  }
  return {
    async check() {
      const age = now() - cachedAt;
      if (cached && age >= 0 && age < cacheMs) return cached;
      if (!pending) pending = refresh().finally(() => { pending = undefined; });
      return pending;
    },
  };
}

export function productionMaintenanceHealth(env = process.env) {
  let client, options;
  return createMaintenanceHealth({
    read: async () => {
      if (!client) {
        const url = env.SUPABASE_URL;
        const ref = url === 'https://klfmscuogsocfjxqkuib.supabase.co' ? 'klfmscuogsocfjxqkuib'
          : url === 'https://cifhcrlmjnsxpkhyloen.supabase.co' ? 'cifhcrlmjnsxpkhyloen' : '';
        options = maintenanceOptions(['report', '--project-ref', ref]);
        const config = maintenanceConfig(options, env);
        const safe = maintenanceFetch(config.url);
        client = createClient(config.url, config.key, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          global: { fetch: (input, init = {}) => {
            const raw = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
            if (new URL(raw).pathname !== '/rest/v1/rpc/trusted_maintenance_status') throw new Error('Health transport blocked');
            const deadline = AbortSignal.timeout(5000);
            return safe(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, deadline]) : deadline });
          } },
        });
      }
      return runMaintenance(options, client);
    },
    notify: state => {
      const event = JSON.stringify({ event: 'maintenance_health', state });
      if (state === 'healthy') console.info(event); else console.warn(event);
    },
  });
}

export function maintenanceHealthRouter(health) {
  const router = Router();
  // Only the caller's observed IP: no raw forwarding chain, tokens, logs or DB read.
  // Shares the existing /api/health limiter and application trust-proxy setting.
  router.get('/client-ip', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const ip = req.ip;
    if (typeof ip !== 'string' || !isIP(ip)) return res.status(503).json({ status: 'unavailable' });
    return res.status(200).json({ ip });
  });
  router.get('/live', (_req, res) => res.set('Cache-Control', 'no-store').status(200).json({ status: 'ok' }));
  router.get('/maintenance', async (_req, res) => {
    let result;
    try { result = await health.check(); } catch { result = { healthy: false }; }
    res.set('Cache-Control', 'no-store').status(result.healthy ? 200 : 503)
      .json({ status: result.healthy ? 'ok' : 'unavailable' });
  });
  return router;
}

export function startMaintenanceWatch(health) {
  const check = () => { void health.check().catch(() => {}); };
  const first = setTimeout(check, 1000);
  const timer = setInterval(check, 60000);
  first.unref(); timer.unref();
  return () => { clearTimeout(first); clearInterval(timer); };
}
