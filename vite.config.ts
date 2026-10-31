import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// 关键点：
// 1. base: './' —— 扩展页通过 chrome-extension://<id>/index.html 打开，必须用相对路径
// 2. build.outDir 固定 dist —— 该目录即为「加载已解压的扩展程序」的目标目录
// 3. rollupOptions.input 单入口 —— newtab 覆盖页只有这一个页面
export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome110',
    // 关闭 sourcemap 可减小体积；调试需要时改 true
    sourcemap: false,
    rollupOptions: {
      input: fileURLToPath(new URL('./index.html', import.meta.url)),
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 5273,
  },
})
