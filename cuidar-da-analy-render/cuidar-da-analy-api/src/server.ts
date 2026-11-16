import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPrisma } from './db.js';

const config = loadConfig();
const prisma = createPrisma(config.DATABASE_URL);
const app = await buildApp({ config, prisma });

async function shutdown(signal: string) {
  app.log.info({ signal }, 'Encerrando');
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: '0.0.0.0', port: config.PORT });
