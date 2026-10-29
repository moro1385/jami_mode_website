import {publicSupabaseConfig} from './config/supabase-public.js';
import {createPublicProductSeoReader} from './server/public-product-seo.js';
import {createStorefrontStatic} from "./server/storefront-static.js";
import express from "express";
import {createHttpObservation} from "./server/http-observability.js";
import {createSupabaseRelay} from "./server/supabase-relay.js";
import { productionMaintenanceHealth, maintenanceHealthRouter, startMaintenanceWatch } from "./server/maintenance-health.js";
import path from "path";
import { fileURLToPath } from "url";
import bitpayRoutes from "./server/bitpay-routes.js";
import walletRoutes from "./server/wallet-routes.js";
import erpRoutes from './server/erp-routes.js';
import inventoryRoutes from "./server/inventory-routes.js";
import { securityHeaders, createRateLimiter, trustedProxyHops } from './server/http-security.js';
import torobRoutes from "./server/torob-routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', trustedProxyHops(process.env.JAMI_TRUST_PROXY_HOPS));
app.use(securityHeaders);
app.use(createHttpObservation());
// Raw relay bodies must be handled before the ordinary JSON/form parsers.
app.use("/api/supabase",createSupabaseRelay());
app.use(['/api/bitpay', '/api/wallet', '/api/admin/inventory', '/api/admin/erp'], createRateLimiter(), express.json({ limit: '32kb' }), express.urlencoded({ extended: false, limit: '32kb' }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

const maintenanceHealth = productionMaintenanceHealth();
app.use("/api/health", createRateLimiter(), maintenanceHealthRouter(maintenanceHealth));
app.use("/api/bitpay", bitpayRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/admin/inventory", inventoryRoutes);
app.use("/api/admin/erp", erpRoutes);
app.use("/torob_api/v3", torobRoutes);
app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found" }));

app.use(createStorefrontStatic(path.join(__dirname, "dist"),{readProduct:createPublicProductSeoReader({publicConfig:publicSupabaseConfig({MODE:"production",VITE_SUPABASE_URL:process.env.SUPABASE_URL,VITE_SUPABASE_PUBLISHABLE_KEY:process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY})})}));

app.use((error, _req, res, _next) => {
  const status = error?.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500;
  res.status(status).json({ error: status === 413 ? 'Request too large' : status === 400 ? 'Invalid request' : 'Request failed' });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
const stopMaintenanceWatch = startMaintenanceWatch(maintenanceHealth);
server.once("close", stopMaintenanceWatch);
