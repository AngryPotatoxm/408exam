import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // 大依赖独立分包，利用浏览器缓存，避免单个巨型 chunk
        manualChunks: {
          react: ['react', 'react-dom'],
          echarts: ['echarts', 'echarts-for-react'],
          xlsx: ['xlsx'],
        },
      },
    },
  },
});
