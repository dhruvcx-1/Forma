import 'dotenv/config';

// Import db eagerly so migrations run before the server starts accepting connections
import './db/index.js';

import fastify, { frontendDist } from './server.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

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
