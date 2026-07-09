import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

const collectBuildAssets = (directory: string, root = directory): string[] => {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectBuildAssets(fullPath, root);
    }

    const relativePath = path.relative(root, fullPath).replace(/\\/g, '/');
    if (relativePath === 'sw.js' || relativePath === 'offline-assets.json') return [];
    if (relativePath.endsWith('.map')) return [];
    return [`/${relativePath}`];
  });
};

const createOfflineManifestPlugin = (): Plugin => ({
  name: 'motofix-offline-manifest',
  apply: 'build',
  closeBundle() {
    const outDir = path.resolve(__dirname, 'dist');
    const assets = Array.from(new Set(collectBuildAssets(outDir))).sort();
    const hash = createHash('sha256');

    assets.forEach((assetUrl) => {
      hash.update(assetUrl);
      const filePath = path.join(outDir, assetUrl.slice(1));
      if (fs.existsSync(filePath)) {
        hash.update(fs.readFileSync(filePath));
      }
    });

    const version = hash.digest('hex').slice(0, 16);
    fs.writeFileSync(
      path.join(outDir, 'offline-assets.json'),
      `${JSON.stringify({ version, assets }, null, 2)}\n`
    );

    const swPath = path.join(outDir, 'sw.js');
    if (fs.existsSync(swPath)) {
      const swSource = fs.readFileSync(swPath, 'utf8');
      fs.writeFileSync(swPath, swSource.replaceAll('__MOTOFIX_BUILD_VERSION__', version));
    }
  },
});

export default defineConfig(() => {
  const lowMemoryBuild = process.env.MOTOFIX_LOW_MEMORY_BUILD === '1';

  return {
    plugins: [react(), tailwindcss(), createOfflineManifestPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      target: lowMemoryBuild ? 'esnext' : undefined,
      minify: lowMemoryBuild ? false : 'esbuild',
      cssMinify: lowMemoryBuild ? false : undefined,
      reportCompressedSize: !lowMemoryBuild,
      rollupOptions: {
        maxParallelFileOps: lowMemoryBuild ? 1 : undefined,
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;

            const normalizedId = id.replace(/\\/g, '/');

            if (
              normalizedId.includes('/node_modules/react/') ||
              normalizedId.includes('/node_modules/react-dom/') ||
              normalizedId.includes('/node_modules/scheduler/')
            ) {
              return 'vendor-react';
            }
            if (normalizedId.includes('/node_modules/firebase/') || normalizedId.includes('/node_modules/@firebase/')) return 'vendor-firebase';
            if (normalizedId.includes('/node_modules/recharts/') || normalizedId.includes('/node_modules/d3-')) return 'vendor-charts';
            if (normalizedId.includes('/node_modules/jspdf/')) return 'vendor-jspdf';
            if (normalizedId.includes('/node_modules/html2canvas/')) return 'vendor-html2canvas';
            if (normalizedId.includes('/node_modules/dompurify/')) return 'vendor-dompurify';
            if (normalizedId.includes('/node_modules/@stripe/') || normalizedId.includes('/node_modules/stripe/')) return 'vendor-stripe';
            if (normalizedId.includes('/node_modules/date-fns/')) return 'vendor-date';
            if (normalizedId.includes('/node_modules/lucide-react/')) return 'vendor-icons';

            return undefined;
          },
        },
      },
    },
  };
});
