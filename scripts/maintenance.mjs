// Never loads .env or starts a background job. Reporting is read-only.
import { createClient } from '@supabase/supabase-js';
import { maintenanceOptions, maintenanceConfig, maintenanceFetch, runMaintenance } from '../server/maintenance-ops.js';
try {
  const options = maintenanceOptions(process.argv.slice(2));
  const config = maintenanceConfig(options, process.env);
  const client = createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: maintenanceFetch(config.url) } });
  const result = await runMaintenance(options, client);
  console.log(JSON.stringify({ task: options.task, project: options.ref, result }));
} catch {
  console.error('Maintenance did not return a verified result. Check the explicit project/options and run report before retrying. No automatic retry; no provider calls.');
  process.exitCode = 1;
}
