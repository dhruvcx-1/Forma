import 'dotenv/config';

// Import db eagerly so migrations run before the server starts accepting connections
import './db/index.js';

import fastify from './server.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

try {
  await fastify.listen({ port: PORT, host: HOST });
  console.log(`[server] Listening on http://${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
