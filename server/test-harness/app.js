import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { createPaymentRouter } from '../bitpay-routes.js';
import { testBackendConfig, guardedTestFetch } from './config.js';
import { createFakeProvider, blockedLegacyProvider } from './fake-provider.js';

export function createHarness({ env, transport = globalThis.fetch, clients, provider: injectedProvider } = {}) {
  const config = testBackendConfig(env);
  const safeFetch = guardedTestFetch(transport);
  const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: safeFetch } };
  const admin = clients?.admin ?? createClient(config.url, config.secret, options);
  const authClient = clients?.auth ?? createClient(config.url, config.publishable, options);
  const provider = injectedProvider ?? createFakeProvider(config);
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const hosts = ['127.0.0.1:3001', '127.0.0.1:8080'];
    if (!['127.0.0.1', '::ffff:127.0.0.1', '::1'].includes(req.socket.remoteAddress)
      || !hosts.includes(req.headers.host)
      || (req.headers.origin && ![config.frontendOrigin, config.backendOrigin].includes(req.headers.origin))
      || (req.method === 'POST' && !req.headers.origin)) return res.status(403).json({ error: 'Loopback origin required' });
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Content-Security-Policy', "default-src 'none'; form-action 'self'; frame-ancestors 'none'");
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.use(express.urlencoded({ extended: false, limit: '2kb' }));
  const authenticate = async header => {
    if (!header?.startsWith('Bearer ')) return null;
    const { data, error } = await authClient.auth.getUser(header.slice(7));
    return error ? null : data.user;
  };
  app.use('/api/bitpay', createPaymentRouter({ admin: () => admin, auth: authenticate,
    provider, legacy: blockedLegacyProvider, merchant: () => config.merchant, recoveryEnabled: true }));
  app.get('/fake-payments/:reference', (req, res) => {
    const ref = req.params.reference;
    if (!/^[1-9][0-9]*$/.test(ref) || !provider.session(ref)) return res.sendStatus(404);
    return res.type('html').send(`<!doctype html><title>Local fake payment</title>
      <h1>Synthetic payment only</h1><p>No payment provider is contacted. No money moves.</p>
      <form method="post" action="/fake-payments/${ref}">
      <button name="result" value="approve">Simulate success</button>
      <button name="result" value="cancel">Simulate cancellation</button></form>`);
  });
  app.post('/fake-payments/:reference', (req, res) => {
    if (!['approve', 'cancel'].includes(req.body.result)) return res.sendStatus(400);
    try { return res.redirect(303, provider.complete(req.params.reference, req.body.result === 'approve')); }
    catch { return res.sendStatus(404); }
  });
  app.use((_err, _req, res, _next) => res.status(400).json({ error: 'Invalid test request' }));
  return app;
}
