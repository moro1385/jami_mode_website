import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["src/features/*/domain/**/*.{ts,tsx}", "src/features/*/application/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["react", "react/**", "@tanstack/**", "@supabase/**", "@/integrations/**",
            "@/stores/**", "@/services/**", "**/infrastructure/**", "**/presentation/**"],
          message: "Domain and application code must use pure types and repository ports; wire UI and data clients in the composition root.",
        }],
      }],
    },
  },
  {
    files: ["src/pages/admin/AdminProducts.tsx", "src/components/admin/ProductFormDialog.tsx",
      "src/components/admin/ProductVariantsManager.tsx", "src/components/admin/ProductImagesManager.tsx",
      "src/pages/admin/AdminUsers.tsx", "src/pages/admin/AdminMessages.tsx", "src/pages/admin/AdminTickets.tsx",
      "src/pages/admin/AdminOrders.tsx", "src/pages/admin/AdminReturnRequests.tsx",
      "src/pages/account/Orders.tsx", "src/pages/account/ReturnRequest.tsx", "src/components/shared/OrderDetailsDialog.tsx",
      "src/pages/account/Addresses.tsx", "src/pages/account/PersonalInformation.tsx",
      "src/stores/authStore.ts", "src/components/auth/RequireAdmin.tsx",
      "src/components/CartSync.tsx", "src/stores/cartStore.ts", "src/pages/Cart.tsx",
      "src/pages/account/Wallet.tsx", "src/components/checkout/WalletCheckout.tsx",
      "src/pages/checkout/CheckoutSuccess.tsx", "src/pages/checkout/CheckoutVerify.tsx", "src/pages/account/WalletVerify.tsx",
      "src/pages/checkout/CheckoutPayment.tsx", "src/pages/checkout/CheckoutAddress.tsx", "src/pages/admin/AdminDashboard.tsx",
      "src/pages/account/Messages.tsx", "src/pages/Contact.tsx", "src/components/Header.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/integrations/supabase/*", "@supabase/**"],
          message: "Migrated UI must use feature APIs; keep database and storage clients in adapters.",
        }],
      }],
    },
  },
);
