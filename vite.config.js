import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
  },
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("firebase") || id.includes("@firebase")) {
              return "vendor-firebase";
            }
            if (id.includes("leaflet") || id.includes("react-leaflet")) {
              return "vendor-leaflet";
            }
            if (id.includes("jspdf") || id.includes("xlsx") || id.includes("html-to-image") || id.includes("html2canvas")) {
              return "vendor-export";
            }
            if (id.includes("html5-qrcode") || id.includes("qrcode.react")) {
              return "vendor-scanner";
            }
            if (id.includes("react") || id.includes("react-dom") || id.includes("react-router")) {
              return "vendor-react";
            }
            return "vendor-libs";
          }
        },
      },
    },
  },
});
