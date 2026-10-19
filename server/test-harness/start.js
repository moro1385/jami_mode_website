// Only the dedicated launcher supplies configuration. No root .env is loaded.
import { createHarness } from './app.js';
import { guardedTestFetch, testBackendConfig } from './config.js';
try {
  testBackendConfig(process.env);
  // Dedicated process only: even an accidentally invoked real adapter cannot
  // send fetch requests to a provider, production or a redirect destination.
  globalThis.fetch = guardedTestFetch(globalThis.fetch);
  const app = createHarness({ env: process.env });
  app.listen(3001, '127.0.0.1', () => console.log('Fake checkout harness: http://127.0.0.1:3001'));
} catch { console.error('Test harness refused configuration; check the dedicated test environment.'); process.exitCode = 1; }
