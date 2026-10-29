import { defineConfig, loadEnv } from "vite";
import express from "express";
import {createSupabaseRelay} from "./server/supabase-relay.js";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { publicSupabaseConfig, testHtml } from "./config/supabase-public.js";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const localTest = mode === "local-test";
  if (localTest) publicSupabaseConfig({ ...process.env, MODE: mode });
  return ({
  // Test configuration comes only from the sanitized launcher process.
  ...(localTest ? { envDir: false } : {}),
  build: { manifest: true },
  server: {
    host: "127.0.0.1",
    strictPort: localTest,
    ...(localTest ? { fs: { strict: true, deny: ["**/.env*", "**/*.env*", "**/*.local", "**/*.{crt,pem}"] } } : {}),
    port: 8080,
    proxy: (mode === "development" || localTest) ? {
      "/api/admin": { target: "http://127.0.0.1:3001" },
      "/api/bitpay": {
        target: "http://127.0.0.1:3001",
      },
    } : undefined,
    hmr: {
      overlay: false,
    },
  },
  plugins: [{name:"supabase-same-origin-relay",configureServer(server){
    if(localTest)return;
    const env=loadEnv(mode,process.cwd(),'VITE_');
    const config=publicSupabaseConfig({MODE:mode,VITE_SUPABASE_URL:env.VITE_SUPABASE_URL,VITE_SUPABASE_PUBLISHABLE_KEY:env.VITE_SUPABASE_PUBLISHABLE_KEY});
    const relay=express();relay.disable('x-powered-by');relay.use(createSupabaseRelay({upstream:config.url}));
    server.middlewares.use('/api/supabase',relay);
  }},{ name: "test-network-isolation", transformIndexHtml: (html) => testHtml(html, localTest) }, react()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
});
