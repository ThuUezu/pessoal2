import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { type Session, verifySession } from './session.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: Session;
  }
}

/** Exige sessão válida E que o e-mail ainda seja o ALLOWED_EMAIL (trocar a variável derruba sessões antigas). */
export function requireSession(config: Config) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const session = verifySession(req.cookies[config.sessionCookieName], config.SESSION_SECRET);
    if (!session || session.email.toLowerCase() !== config.ALLOWED_EMAIL) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Entre com sua conta Google para continuar.');
    }
    req.auth = session;
  };
}
