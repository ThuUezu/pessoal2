import formbody from '@fastify/formbody';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { type VerifyGoogleIdToken } from '../auth/google.js';
import { SESSION_MAX_AGE_SECONDS, signSession } from '../auth/session.js';
import type { Config } from '../config.js';
import { GoogleCallbackBody } from '../schemas.js';

interface Deps {
  config: Config;
  verifyGoogleIdToken: VerifyGoogleIdToken;
}

/** Redireciona para o app; o frontend lê ?erro=... e mostra uma mensagem amigável. */
const redirectTo = (reply: FastifyReply, location: string) => reply.code(303).header('location', location).send();

export const publicAuthRoutes = ({ config, verifyGoogleIdToken }: Deps): FastifyPluginAsync => async (app) => {
  // O Google devolve o login por POST de formulário (ux_mode "redirect"); só esta rota lê esse formato.
  await app.register(formbody);

  app.post(
    '/auth/google/callback',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const body = GoogleCallbackBody.safeParse(req.body);
      if (!body.success) return redirectTo(reply, '/?erro=token');

      // Proteção CSRF do Google: o cookie g_csrf_token e o campo do formulário precisam ser iguais.
      const csrfCookie = req.cookies['g_csrf_token'];
      if (!csrfCookie || csrfCookie !== body.data.g_csrf_token) return redirectTo(reply, '/?erro=csrf');

      let identity;
      try {
        identity = await verifyGoogleIdToken(body.data.credential);
      } catch (err) {
        req.log.warn({ err }, 'ID token do Google recusado');
        return redirectTo(reply, '/?erro=token');
      }

      if (!identity.emailVerified || identity.email.toLowerCase() !== config.ALLOWED_EMAIL) {
        req.log.warn('Login recusado: e-mail não autorizado');
        return redirectTo(reply, '/?erro=nao_autorizado');
      }

      const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
      const token = signSession({ email: config.ALLOWED_EMAIL, name: identity.name, exp }, config.SESSION_SECRET);
      reply.setCookie(config.sessionCookieName, token, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_MAX_AGE_SECONDS,
      });
      return redirectTo(reply, '/');
    },
  );

  app.post('/auth/logout', async (_req, reply) => {
    reply.clearCookie(config.sessionCookieName, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      path: '/',
    });
    return reply.code(204).send();
  });
};

export const protectedAuthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', async (req) => ({ email: req.auth!.email, name: req.auth!.name }));
};
