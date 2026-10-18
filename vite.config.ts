import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { publicSupabaseConfig, testHtml } from "./config/supabase-public.js";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const localTest = mode === "local-test";
  if (localTest) publicSupabaseConfig({ ...process.env, MODE: mode });
  return ({
  // Test configuration comes only from the sanitized launcher process.
  ...(localTest ? { envDir: false } : {}),
  server: {
    host: localTest ? "127.0.0.1" : "::",
    strictPort: localTest,
    ...(localTest ? { fs: { strict: true, deny: ["**/.env*", "**/*.env*", "**/*.local", "**/*.{crt,pem}"] } } : {}),
    port: 8080,
    proxy: (mode === "development" || localTest) ? {
      "/api/bitpay": {
        target: "http://127.0.0.1:3001",
      },
    } : undefined,
    hmr: {
      overlay: false,
    },
  },
  plugins: [{ name: "test-network-isolation", transformIndexHtml: (html) => testHtml(html, localTest) }, react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
});
