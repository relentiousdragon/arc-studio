import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
//
const clientDirectory = dirname(fileURLToPath(import.meta.url));
const retainedAssetAgeMs = 30 * 24 * 60 * 60 * 1000;

function retainRecentHashedAssets() {
  return {
    name: 'arc-retain-recent-client-assets',
    closeBundle() {
      const assetsDirectory = join(clientDirectory, 'dist', 'assets');
      let entries;
      try { entries = readdirSync(assetsDirectory, { withFileTypes: true }); } catch { return; }
      const cutoff = Date.now() - retainedAssetAgeMs;
      for (const entry of entries) {
        if (!entry.isFile() || !/-[\w-]{8,}\.(?:js|css)$/.test(entry.name)) continue;
        const assetPath = join(assetsDirectory, entry.name);
        try { if (statSync(assetPath).mtimeMs < cutoff) rmSync(assetPath); } catch { }
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), retainRecentHashedAssets()],
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://127.0.0.1:3000',
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll(String.fromCharCode(92), '/');
          const pathParts = normalizedId.split('/');
          const modulesIndex = pathParts.lastIndexOf('node_modules');
          const packageName = pathParts[modulesIndex + 1];
          if (['react', 'react-dom', 'scheduler'].includes(packageName)) return 'react-vendor';
          if (normalizedId.includes('/emoji-picker-react/dist/data/emojis-en.js')) return 'emoji-data';
          if (['emoji-picker-react', 'shipstyles'].includes(packageName)) return 'emoji-vendor';
        }
      }
    }
  }
});
