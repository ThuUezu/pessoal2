import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { UPLOAD_FOLDER } from '../src/lib/cloudinary.js';
import { WEB_ORIGIN, makeApp, photoFor, sessionCookie, testConfig } from './helpers.js';

// Aqui o banco é um Proxy que explode se for usado: todo pedido inválido tem de ser recusado ANTES de gravar.
const config = testConfig();
let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

function send(method: 'POST' | 'PATCH', url: string, payload: unknown) {
  return app.inject({
    method,
    url,
    headers: { cookie: sessionCookie(config), origin: WEB_ORIGIN, 'content-type': 'application/json' },
    payload: payload as object,
  });
}

describe('validação de itens', () => {
  it('exige nome', async () => {
    app = await makeApp(config);

    const res = await send('POST', '/api/items', { category: 'ROUPA' });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(res.json().error.details.name).toBeDefined();
  });

  it('recusa nome só com espaços', async () => {
    app = await makeApp(config);

    const res = await send('POST', '/api/items', { name: '   ' });

    expect(res.statusCode).toBe(422);
  });

  it('recusa campos que o cliente não pode definir (id, status na criação, datas)', async () => {
    app = await makeApp(config);

    for (const extra of [{ id: 'abc' }, { status: 'COMPRADO' }, { purchasedAt: '2020-01-01T00:00:00Z' }, { photoUrl: 'https://x.y/z.jpg' }]) {
      const res = await send('POST', '/api/items', { name: 'Rímel', ...extra });
      expect(res.statusCode, JSON.stringify(extra)).toBe(422);
    }
  });

  it('recusa categoria, prioridade e "pago com" fora da lista', async () => {
    app = await makeApp(config);

    for (const bad of [{ category: 'CARRO' }, { priority: 'URGENTE' }, { paidWith: 'PIX' }, { origin: 'ACHEI' }]) {
      const res = await send('POST', '/api/items', { name: 'Rímel', ...bad });
      expect(res.statusCode, JSON.stringify(bad)).toBe(422);
    }
  });

  it('recusa texto acima do limite', async () => {
    app = await makeApp(config);

    const res = await send('POST', '/api/items', { name: 'a'.repeat(121) });

    expect(res.statusCode).toBe(422);
  });

  it('recusa foto de outra conta da Cloudinary', async () => {
    app = await makeApp(config);
    const foreign = { url: photoFor('x').url.replace('democloud', 'outra-conta'), publicId: photoFor('x').publicId };

    const res = await send('POST', '/api/items', { name: 'Rímel', photo: foreign });

    expect(res.statusCode).toBe(422);
  });

  it('recusa foto fora da pasta do app e URL que não é da Cloudinary', async () => {
    app = await makeApp(config);

    const outsideFolder = {
      url: 'https://res.cloudinary.com/democloud/image/upload/v1/outra-pasta/abc.jpg',
      publicId: 'outra-pasta/abc',
    };
    const notCloudinary = { url: 'https://evil.example/tracker.png', publicId: `${UPLOAD_FOLDER}/abc` };

    expect((await send('POST', '/api/items', { name: 'A', photo: outsideFolder })).statusCode).toBe(422);
    expect((await send('POST', '/api/items', { name: 'A', photo: notCloudinary })).statusCode).toBe(422);
  });

  it('recusa foto cujo publicId não corresponde à URL', async () => {
    app = await makeApp(config);
    const mismatched = { url: photoFor('aaa').url, publicId: photoFor('bbb').publicId };

    const res = await send('POST', '/api/items', { name: 'A', photo: mismatched });

    expect(res.statusCode).toBe(422);
  });

  it('no PATCH, recusa status inválido e identificador malformado', async () => {
    app = await makeApp(config);

    expect((await send('PATCH', '/api/items/abcdefghijk', { status: 'TALVEZ' })).statusCode).toBe(422);
    expect((await send('PATCH', '/api/items/..%2F..%2Fetc', { name: 'x' })).statusCode).toBe(422);
  });

  it('recusa paginação absurda', async () => {
    app = await makeApp(config);

    const res = await app.inject({
      method: 'GET',
      url: '/api/items?pageSize=100000',
      headers: { cookie: sessionCookie(config) },
    });

    expect(res.statusCode).toBe(422);
  });

  it('recusa corpo que não é JSON (415) sem vazar detalhes', async () => {
    app = await makeApp(config);

    const res = await app.inject({
      method: 'POST',
      url: '/api/items',
      headers: { cookie: sessionCookie(config), origin: WEB_ORIGIN, 'content-type': 'text/plain' },
      payload: 'name=Rímel',
    });

    expect(res.statusCode).toBe(415);
    expect(res.json().error.message).not.toMatch(/fastify|stack/i);
  });
});
