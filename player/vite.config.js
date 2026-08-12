import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    // Dev-only convenience: `npm run dev` outside Docker still reaches the
    // backend/MinIO on their host-mapped ports, mirroring what nginx does in
    // production so the app can stay same-origin in both environments.
    proxy: {
      '/api': 'http://localhost:9101',
      '/socket.io': { target: 'http://localhost:9101', ws: true },
      '/scavenger': 'http://localhost:9110',
    },
  },
});
