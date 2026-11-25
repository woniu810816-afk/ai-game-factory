import { defineConfig } from 'vite';

// 使用相对路径 base: './'，确保同一份构建产物同时兼容：
// 1. GitHub Pages 子路径部署（/game-factory/）
// 2. Cloudflare Pages 根路径部署
// 3. Poki / CrazyGames / itch.io iframe 沙箱
// 4. Telegram Mini App 内嵌容器
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild',
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser']
        }
      }
    }
  },
  server: {
    host: true,
    port: 5173
  }
});
