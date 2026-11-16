import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { buildApp, type AppDeps } from '../src/app.js';
import { signSession } from '../src/auth/session.js';
import { type Config, loadConfig } from '../src/config.js';
import { UPLOAD_FOLDER } from '../src/lib/cloudinary.js';

export const WEB_ORIGIN = 'https://analy.example';

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://nao-usado',
    GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
    ALLOWED_EMAIL: 'Ele@Example.com',
    SESSION_SECRET: 'x'.repeat(40),
    WEB_ORIGIN,
    CLOUDINARY_CLOUD_NAME: 'democloud',
    CLOUDINARY_API_KEY: '123456',
    CLOUDINARY_API_SECRET: 'segredo-de-teste',
    ...overrides,
  });
}

/** Banco que explode se alguém encostar nele: prova que a rota recusou o pedido ANTES de gravar. */
export const databaseThatMustNotBeUsed = new Proxy(
  {},
  {
    get() {
      throw new Error('O banco não deveria ser usado neste teste');
    },
  },
) as unknown as PrismaClient;

export async function makeApp(config: Config, deps: Partial<AppDeps> = {}): Promise<FastifyInstance> {
  const app = await buildApp({ config, prisma: databaseThatMustNotBeUsed, logger: false, ...deps });
  await app.ready();
  return app;
}

/** Cabeçalho Cookie de uma sessão válida (como se o login já tivesse acontecido). */
export function sessionCookie(config: Config, email: string = config.ALLOWED_EMAIL, expiresInSeconds = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return `${config.sessionCookieName}=${signSession({ email, name: 'Ele', exp }, config.SESSION_SECRET)}`;
}

export function photoFor(id: string) {
  return {
    url: `https://res.cloudinary.com/democloud/image/upload/v1700000000/${UPLOAD_FOLDER}/${id}.jpg`,
    publicId: `${UPLOAD_FOLDER}/${id}`,
  };
}
