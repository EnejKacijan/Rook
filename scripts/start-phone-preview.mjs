import { createServer, loadEnv } from 'vite';

// Full local app: reuse public client configuration, never server credentials.
// The existing hosted proxy retains sign-in, consent and quota enforcement.
const env = loadEnv('production', process.cwd(), 'VITE_');
const required = ['VITE_ROOK_FIREBASE_API_KEY', 'VITE_ROOK_FIREBASE_AUTH_DOMAIN',
  'VITE_ROOK_FIREBASE_PROJECT_ID', 'VITE_ROOK_FIREBASE_APP_ID'];
if (env.VITE_ROOK_ACCOUNT_SYNC_ROLLOUT !== 'true' || required.some(key => !env[key]))
  throw new Error('Phone preview needs the existing public Firebase client configuration and account rollout in .env.production.local.');

for (const [key, value] of Object.entries(env)) process.env[key] = value;
process.env.ROOK_DEV_USE_HOSTED_AI = 'true';
const server = await createServer({
  mode: 'phone-preview',
  server: { host: '0.0.0.0', port: 4400, strictPort: true },
});
await server.listen();
server.printUrls();
