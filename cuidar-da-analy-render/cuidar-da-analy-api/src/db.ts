import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

export function createPrisma(connectionString: string): PrismaClient {
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  // O Neon derruba conexões ociosas. Sem este listener, o Node encerraria o processo.
  pool.on('error', (err) => console.error('[db] conexão ociosa encerrada (normal no Neon):', err.message));
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}
