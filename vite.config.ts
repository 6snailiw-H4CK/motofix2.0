import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const lowMemoryBuild = process.env.MOTOFIX_LOW_MEMORY_BUILD === '1';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: false,
    },
    build: {
      minify: lowMemoryBuild ? false : 'esbuild',
      cssMinify: lowMemoryBuild ? false : undefined,
      reportCompressedSize: !lowMemoryBuild,
      rollupOptions: {
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
