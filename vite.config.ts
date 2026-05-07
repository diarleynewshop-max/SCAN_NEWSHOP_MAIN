import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/erp-api-facil": {
        target: "https://facil.varejofacil.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/erp-api-facil/, ""),
      },
      "/erp-api-soye": {
        target: "https://soye.varejofacil.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/erp-api-soye/, ""),
      },
      "/erp-api-newshop": {
        target: "https://newshop.varejofacil.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/erp-api-newshop/, ""),
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      // Trigger.dev é server-side — não entra no bundle do frontend
      external: [
        "@trigger.dev/sdk",
        "@trigger.dev/sdk/v3",
        "@trigger.dev/build",
      ],
    },
  },
});
