import net from 'node:net';
import 'dotenv/config';

// Import db eagerly so migrations run before the server starts accepting connections
import './db/index.js';

import fastify, { frontendDist } from './server.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

// Diagnostic check: On Windows, 0.0.0.0 binding can succeed even if 127.0.0.1 is hijacked
// by another process (like a stale VS Code port forwarder).
async function checkLocalhostConflict(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    tester.once('listening', () => {
      tester.close(() => resolve(false));
    });
    tester.listen(port, '127.0.0.1');
  });
}

const conflict = await checkLocalhostConflict(PORT);
if (conflict) {
  console.warn(`
⚠️  PORT CONFLICT DETECTED on port ${PORT}!
   Another process (such as VS Code's automatic "Ports" forwarding) is bound to 127.0.0.1:${PORT}.
   Your browser requests to http://localhost:${PORT} may hang or fail.
   👉 To fix: In VS Code, open the "Ports" tab at the bottom and right-click -> "Stop Forwarding Port",
   👉 Or run on an open port:  $env:PORT="3005"; node packages/backend/dist/index.js
  `);
}

try {
  await fastify.listen({ port: PORT, host: HOST });
  
  const displayHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
  const isDocker = process.env.DATABASE_PATH?.startsWith('/app/data');
  const externalPort = process.env.EXTERNAL_PORT || (isDocker ? '8080' : PORT);

  console.log(`
┌─────────────────────────────────────────────────────────────┐
│   ✨ Forma — Body Progress Tracker                          │
│                                                             │
│   🌐 Frontend UI:  http://${displayHost}:${externalPort}                   │
│   🔌 Backend API:  http://${displayHost}:${externalPort}/api               │
│   📁 Static SPA:   ${frontendDist ? 'Mounted (' + frontendDist + ')' : 'Not mounted (API only)'} 
└─────────────────────────────────────────────────────────────┘
  `);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
