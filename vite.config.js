import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@mediapipe/pose': path.resolve('src/mediapipe-pose-shim.js'),
    },
  },
})
