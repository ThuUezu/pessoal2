import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { GoogleIdentity, VerifyGoogleIdToken } from '../src/auth/google.js';
import { WEB_ORIGIN, makeApp, sessionCookie, testConfig } from './helpers.js';

const config = testConfig();
const allowed: GoogleIdentity = { email: 'ele@example.com', emailVerified: true, name: 'Ele' };

let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

function callback(payload: string, cookie = 'g_csrf_token=abc') {
  return app.inject({
    method: 'POST',
    url: '/api/auth/google/callback',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie, origin: 'https://accounts.google.com' },
    payload,
  });
}

describe('login com Google', () => {
  it('aceita o e-mail permitido, cria cookie de sessão seguro e volta para o app', async () => {
    app = await makeApp(config, { verifyGoogleIdToken: async () => allowed });

    const res = await callback('credential=token-do-google&g_csrf_token=abc');

    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe('/');
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toContain('__Host-analy=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).not.toContain('Domain');
  });

  it('a sessão criada no login vale para /api/me', async () => {
    app = await makeApp(config, { verifyGoogleIdToken: async () => allowed });
    const login = await callback('credential=token-do-google&g_csrf_token=abc');
    const cookiePair = String(login.headers['set-cookie']).split(';')[0]!;

    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: cookiePair } });

    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({ email: 'ele@example.com', name: 'Ele' });
  });

  it('recusa qualquer outro e-mail, sem criar sessão', async () => {
    app = await makeApp(config, {
      verifyGoogleIdToken: async () => ({ ...allowed, email: 'intruso@example.com' }),
    });

    const res = await callback('credential=token&g_csrf_token=abc');

    expect(res.headers.location).toBe('/?erro=nao_autorizado');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('recusa e-mail permitido que o Google não verificou', async () => {
    app = await makeApp(config, { verifyGoogleIdToken: async () => ({ ...allowed, emailVerified: false }) });

    const res = await callback('credential=token&g_csrf_token=abc');

    expect(res.headers.location).toBe('/?erro=nao_autorizado');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('recusa token inválido do Google', async () => {
    app = await makeApp(config, {
      verifyGoogleIdToken: async () => {
        throw new Error('Token expirado');
      },
    });

    const res = await callback('credential=token-ruim&g_csrf_token=abc');

    expect(res.headers.location).toBe('/?erro=token');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('recusa quando o token CSRF do cookie e do formulário não batem, sem chamar o Google', async () => {
    const verify = vi.fn<VerifyGoogleIdToken>(async () => allowed);
    app = await makeApp(config, { verifyGoogleIdToken: verify });

    const res = await callback('credential=token&g_csrf_token=um', 'g_csrf_token=outro');

    expect(res.headers.location).toBe('/?erro=csrf');
    expect(verify).not.toHaveBeenCalled();
  });

  it('recusa quando falta o cookie CSRF', async () => {
    app = await makeApp(config, { verifyGoogleIdToken: async () => allowed });

    const res = await callback('credential=token&g_csrf_token=abc', 'outro=valor');

    expect(res.headers.location).toBe('/?erro=csrf');
  });

  it('limita tentativas de login (10 por 15 minutos)', async () => {
    app = await makeApp(config, { verifyGoogleIdToken: async () => allowed });

    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await callback('lixo=1')).statusCode);

    expect(statuses.slice(0, 10).every((s) => s === 303)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe('sessão e rotas protegidas', () => {
  it('/api/me sem cookie dá 401 no formato padrão de erro', async () => {
    app = await makeApp(config);

    const res = await app.inject({ method: 'GET', url: '/api/me' });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('recusa cookie adulterado', async () => {
    app = await makeApp(config);
    const cookie = sessionCookie(config).replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));

    const res = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });

    expect(res.statusCode).toBe(401);
  });

  it('recusa sessão de um e-mail que não é mais o permitido', async () => {
    app = await makeApp(config);
    const cookie = sessionCookie(config, 'antigo@example.com');

    const res = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });

    expect(res.statusCode).toBe(401);
  });

  it.each([
    ['GET', '/api/items'],
    ['POST', '/api/items'],
    ['GET', '/api/items/abcdefghijk'],
    ['PATCH', '/api/items/abcdefghijk'],
    ['DELETE', '/api/items/abcdefghijk'],
    ['POST', '/api/uploads/signatures'],
  ])('%s %s exige login', async (method, url) => {
    app = await makeApp(config);

    const res = await app.inject({ method: method as 'GET', url });

    expect(res.statusCode).toBe(401);
  });

  it('o health check é público', async () => {
    app = await makeApp(config);

    const res = await app.inject({ method: 'GET', url: '/api/health' });

    expect(res.statusCode).toBe(200);
  });

  it('logout apaga o cookie', async () => {
    app = await makeApp(config);

    const res = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { origin: WEB_ORIGIN } });

    expect(res.statusCode).toBe(204);
    expect(String(res.headers['set-cookie'])).toMatch(/__Host-analy=;/);
  });

  it('recusa pedido que altera dados vindo de outra origem (mesmo com sessão válida)', async () => {
    app = await makeApp(config);

    const res = await app.inject({
      method: 'POST',
      url: '/api/items',
      headers: { cookie: sessionCookie(config), origin: 'https://site-malicioso.example', 'content-type': 'application/json' },
      payload: { name: 'Rímel' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('BAD_ORIGIN');
  });

  it('manda os cabeçalhos de segurança do helmet', async () => {
    app = await makeApp(config);

    const res = await app.inject({ method: 'GET', url: '/api/health' });

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });
});
