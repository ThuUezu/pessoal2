import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError, z } from 'zod';
import { requireSession } from './auth/guard.js';
import { type VerifyGoogleIdToken, createGoogleVerifier } from './auth/google.js';
import type { Config } from './config.js';
import { type DestroyImage, createImageDestroyer } from './lib/cloudinary.js';
import { HttpError, messageForStatus } from './lib/errors.js';
import { protectedAuthRoutes, publicAuthRoutes } from './routes/auth.js';
import { itemRoutes } from './routes/items.js';
import { uploadRoutes } from './routes/uploads.js';

export interface AppDeps {
  config: Config;
  prisma: PrismaClient;
  /** Injetáveis só para teste; em produção usam as implementações reais. */
  verifyGoogleIdToken?: VerifyGoogleIdToken;
  destroyImage?: DestroyImage;
  logger?: boolean;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const GOOGLE_CALLBACK_PATH = '/api/auth/google/callback';

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, prisma } = deps;
  const verifyGoogleIdToken = deps.verifyGoogleIdToken ?? createGoogleVerifier(config.GOOGLE_CLIENT_ID);
  const destroyImage =
    deps.destroyImage ??
    createImageDestroyer({
      cloudName: config.CLOUDINARY_CLOUD_NAME,
      apiKey: config.CLOUDINARY_API_KEY,
      apiSecret: config.CLOUDINARY_API_SECRET,
    });

  const app = Fastify({
    // Atrás do Netlify e do Render: confiar no X-Forwarded-* (IP real para o rate limit).
    trustProxy: true,
    logger:
      (deps.logger ?? config.NODE_ENV !== 'test')
        ? { level: 'info', redact: ['req.headers.cookie', 'req.headers.authorization'] }
        : false,
  });

  // Só JSON entra como corpo de pedido. O text/plain embutido é o formato que um formulário de outro
  // site consegue enviar sem pré-checagem de CORS; sem parser, ele vira 415 antes de chegar nas rotas.
  app.removeContentTypeParser('text/plain');

  await app.register(helmet);
  await app.register(cors, { origin: config.webOrigins, credentials: true });
  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });

  // Defesa extra contra CSRF (além do SameSite=Lax): pedidos que alteram dados precisam vir do nosso site.
  app.addHook('onRequest', async (req) => {
    if (SAFE_METHODS.has(req.method) || req.url.startsWith(GOOGLE_CALLBACK_PATH)) return;
    const origin = req.headers.origin;
    if (origin && !config.webOrigins.includes(origin)) {
      throw new HttpError(403, 'BAD_ORIGIN', 'Origem não permitida.');
    }
  });

  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, req, reply) => {
    if (err instanceof HttpError) {
      return reply
        .code(err.statusCode)
        .send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof ZodError) {
      return reply.code(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Alguns campos estão inválidos.',
          details: z.flattenError(err).fieldErrors,
        },
      });
    }
    const status = err.statusCode ?? 500;
    if (status < 500) {
      return reply
        .code(status)
        .send({ error: { code: err.code ?? 'BAD_REQUEST', message: messageForStatus(status) } });
    }
    req.log.error({ err }, 'Erro inesperado');
    return reply.code(500).send({ error: { code: 'INTERNAL', message: messageForStatus(500) } });
  });

  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: messageForStatus(404) } }),
  );

  await app.register(
    async (api) => {
      api.get('/health', async () => ({ status: 'ok' }));

      await api.register(publicAuthRoutes({ config, verifyGoogleIdToken }));

      // Tudo daqui para baixo exige sessão.
      await api.register(async (secured) => {
        secured.addHook('onRequest', requireSession(config));
        await secured.register(protectedAuthRoutes);
        await secured.register(itemRoutes({ config, prisma, destroyImage }));
        await secured.register(uploadRoutes(config));
      });
    },
    { prefix: '/api' },
  );

  return app;
}
