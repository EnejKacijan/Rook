import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { configDefaults } from 'vitest/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function rookLocalApi() {
  let handlerPromise;
  const handleApi = async (request, response, next) => {
    if (!String(request.url || '').split('?')[0].startsWith('/api/')) {
      next();
      return;
    }
    try {
      const { rookRequestHandler } = await (handlerPromise ||= import(
        './server.mjs'
      ));
      await rookRequestHandler(request, response);
    } catch (error) {
      if (response.headersSent) {
        response.end();
        return;
      }
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({ error: error?.message || 'Local API unavailable.' })
      );
    }
  };
  return {
    name: 'rook-local-api',
    configureServer(server) {
      server.middlewares.use(handleApi);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleApi);
    },
  };
}

export default defineConfig(({ mode }) => {
  // These values remain server-only. Loading them here lets local Vite use
  // the same /api routes as the production Netlify function.
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), '')))
    if (/^(?:OPENAI_|EXPERT_)/.test(key)) process.env[key] = value;
  return {
    plugins: [react(), rookLocalApi()],
    define: {
      __ROOK_APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
      __ROOK_BUILD_ID__: JSON.stringify(createHash('sha256').update(['src/App.jsx','src/domain.js','src/localStateStorage.js','src/StartupBoundary.jsx','src/main.jsx','src/backup.js','src/restoreTransaction.js','public/sw.js'].map(path=>readFileSync(new URL(path,import.meta.url))).join('\n')).digest('hex').slice(0,16)),
    },
    test: { environment: 'jsdom', globals: true, testTimeout: 10000,
      setupFiles: ['./src/testStorageSession.js'],
      exclude: [...configDefaults.exclude, 'artifacts/**', 'tmp/**', 'output/**'],
    },
  };
});
