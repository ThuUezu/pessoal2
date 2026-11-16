import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { UPLOAD_FOLDER, createUploadSignature, signParams } from '../src/lib/cloudinary.js';
import { WEB_ORIGIN, makeApp, sessionCookie, testConfig } from './helpers.js';

const config = testConfig();
let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

describe('assinatura de parâmetros da Cloudinary', () => {
  it('bate com o exemplo oficial da documentação da Cloudinary', () => {
    // Exemplo publicado na documentação "Generating authentication signatures" (API secret "abcd").
    const signature = signParams(
      { eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop', public_id: 'sample_image', timestamp: 1315060510 },
      'abcd',
    );

    expect(signature).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  it('ordena os parâmetros em ordem alfabética antes de assinar', () => {
    const a = signParams({ timestamp: 1, folder: 'x' }, 'segredo');
    const b = signParams({ folder: 'x', timestamp: 1 }, 'segredo');

    expect(a).toBe(b);
    expect(a).toBe(createHash('sha1').update('folder=x&timestamp=1segredo').digest('hex'));
  });

  it('assina sempre a pasta fixa dos itens, com o horário em segundos', () => {
    const signed = createUploadSignature(
      { cloudName: 'democloud', apiKey: '123456', apiSecret: 'segredo-de-teste' },
      1_700_000_000_999,
    );

    expect(signed.timestamp).toBe(1_700_000_000);
    expect(signed.folder).toBe('cuidar-da-analy/itens');
    expect(signed.uploadUrl).toBe('https://api.cloudinary.com/v1_1/democloud/image/upload');
    expect(signed.signature).toBe(
      createHash('sha1').update('folder=cuidar-da-analy/itens&timestamp=1700000000segredo-de-teste').digest('hex'),
    );
  });
});

describe('POST /api/uploads/signatures', () => {
  it('exige login', async () => {
    app = await makeApp(config);

    const res = await app.inject({ method: 'POST', url: '/api/uploads/signatures', headers: { origin: WEB_ORIGIN } });

    expect(res.statusCode).toBe(401);
  });

  it('devolve o que o navegador precisa para enviar a foto, sem vazar o API secret', async () => {
    app = await makeApp(config);

    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads/signatures',
      headers: { cookie: sessionCookie(config), origin: WEB_ORIGIN },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ cloudName: 'democloud', apiKey: '123456', folder: UPLOAD_FOLDER });
    expect(body.signature).toBe(
      createHash('sha1').update(`folder=${UPLOAD_FOLDER}&timestamp=${body.timestamp}segredo-de-teste`).digest('hex'),
    );
    expect(res.body).not.toContain('segredo-de-teste');
  });
});
