import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  define: {
    __SUPABASE_URL_FALLBACK__: JSON.stringify(process.env.SUPABASE_URL || "https://sknyigbnlbbpbbmsbbmc.supabase.co"),
    __SUPABASE_FUNCTIONS_URL_FALLBACK__: JSON.stringify(
      process.env.VITE_SUPABASE_FUNCTIONS_URL ||
      process.env.SUPABASE_FUNCTIONS_URL ||
      "https://sknyigbnlbbpbbmsbbmc.supabase.co"
    ),
    __SUPABASE_ANON_KEY_FALLBACK__: JSON.stringify(process.env.SUPABASE_ANON_KEY || ""),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
