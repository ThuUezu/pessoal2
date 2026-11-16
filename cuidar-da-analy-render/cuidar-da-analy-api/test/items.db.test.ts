import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrisma } from '../src/db.js';
import { WEB_ORIGIN, makeApp, photoFor, sessionCookie, testConfig } from './helpers.js';

// Integração com Postgres de verdade. ATENÇÃO: limpa a tabela Item do banco apontado por TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('itens (com banco real)', () => {
  const config = testConfig();
  const destroyImage = vi.fn<(publicId: string) => Promise<void>>();
  let prisma: PrismaClient;
  let app: FastifyInstance;

  beforeAll(async () => {
    prisma = createPrisma(url!);
    app = await makeApp(config, { prisma, destroyImage });
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await prisma.item.deleteMany();
    destroyImage.mockReset();
    destroyImage.mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  const headers = () => ({ cookie: sessionCookie(config), origin: WEB_ORIGIN, 'content-type': 'application/json' });
  const create = (payload: object) => app.inject({ method: 'POST', url: '/api/items', headers: headers(), payload });
  const patch = (id: string, payload: object) =>
    app.inject({ method: 'PATCH', url: `/api/items/${id}`, headers: headers(), payload });
  const list = (query = '') =>
    app.inject({ method: 'GET', url: `/api/items${query}`, headers: { cookie: sessionCookie(config) } });

  describe('criar', () => {
    it('cria só com o nome e aplica os padrões', async () => {
      const res = await create({ name: 'Rímel' });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        name: 'Rímel',
        category: 'OUTRO',
        priority: 'MEDIA',
        status: 'PENDENTE',
        origin: 'ELA_PEDIU',
        paidWith: 'MEU_DINHEIRO',
        photoUrl: null,
        purchasedAt: null,
      });
    });

    it('apara espaços e transforma texto vazio em null', async () => {
      const res = await create({ name: '  Base  ', brand: '   ', notes: '' });

      expect(res.json()).toMatchObject({ name: 'Base', brand: null, notes: null });
    });

    it('guarda a foto mas não expõe o publicId', async () => {
      const photo = photoFor('abc123');

      const res = await create({ name: 'Batom', photo });

      expect(res.json().photoUrl).toBe(photo.url);
      expect(Object.keys(res.json())).not.toContain('photoPublicId');
    });
  });

  describe('listar', () => {
    it('mostra pendentes com prioridade alta primeiro e, na mesma prioridade, o mais novo primeiro', async () => {
      await create({ name: 'Baixa antiga', priority: 'BAIXA' });
      await create({ name: 'Alta antiga', priority: 'ALTA' });
      await create({ name: 'Media', priority: 'MEDIA' });
      await create({ name: 'Alta nova', priority: 'ALTA' });

      const res = await list('?status=PENDENTE');

      expect(res.json().data.map((i: { name: string }) => i.name)).toEqual([
        'Alta nova',
        'Alta antiga',
        'Media',
        'Baixa antiga',
      ]);
    });

    it('separa pendentes de comprados e mostra os comprados do mais recente para o mais antigo', async () => {
      const a = (await create({ name: 'Primeiro' })).json().id;
      const b = (await create({ name: 'Segundo' })).json().id;
      await create({ name: 'Ainda pendente' });
      await patch(a, { status: 'COMPRADO' });
      await new Promise((r) => setTimeout(r, 15));
      await patch(b, { status: 'COMPRADO' });

      const bought = (await list('?status=COMPRADO')).json().data.map((i: { name: string }) => i.name);
      const pending = (await list('?status=PENDENTE')).json().data.map((i: { name: string }) => i.name);

      expect(bought).toEqual(['Segundo', 'Primeiro']);
      expect(pending).toEqual(['Ainda pendente']);
    });

    it('pagina o resultado', async () => {
      for (const name of ['A', 'B', 'C']) await create({ name });

      const first = (await list('?pageSize=2&page=1')).json();
      const second = (await list('?pageSize=2&page=2')).json();

      expect(first.data).toHaveLength(2);
      expect(second.data).toHaveLength(1);
      expect(first.pagination).toEqual({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
    });

    it('lista vazia devolve uma página', async () => {
      const res = (await list()).json();

      expect(res.data).toEqual([]);
      expect(res.pagination.totalPages).toBe(1);
    });
  });

  describe('marcar como comprado', () => {
    it('registra a data da compra e permite desfazer', async () => {
      const id = (await create({ name: 'Protetor solar' })).json().id;

      const bought = (await patch(id, { status: 'COMPRADO' })).json();
      expect(bought.status).toBe('COMPRADO');
      expect(new Date(bought.purchasedAt).getTime()).toBeGreaterThan(Date.now() - 5000);

      const undone = (await patch(id, { status: 'PENDENTE' })).json();
      expect(undone.status).toBe('PENDENTE');
      expect(undone.purchasedAt).toBeNull();
    });

    it('repetir "comprado" não muda a data original (idempotente)', async () => {
      const id = (await create({ name: 'Pó compacto' })).json().id;
      const first = (await patch(id, { status: 'COMPRADO' })).json().purchasedAt;
      await new Promise((r) => setTimeout(r, 15));

      const second = (await patch(id, { status: 'COMPRADO' })).json().purchasedAt;

      expect(second).toBe(first);
    });

    it('guarda "pago com" a caixinha', async () => {
      const id = (await create({ name: 'Perfume' })).json().id;

      const res = (await patch(id, { status: 'COMPRADO', paidWith: 'CAIXINHA' })).json();

      expect(res).toMatchObject({ status: 'COMPRADO', paidWith: 'CAIXINHA' });
    });
  });

  describe('editar', () => {
    it('muda só o que foi enviado', async () => {
      const id = (await create({ name: 'Rímel', brand: 'Maybelline', priority: 'ALTA' })).json().id;

      const res = (await patch(id, { notes: 'À prova d’água' })).json();

      expect(res).toMatchObject({ name: 'Rímel', brand: 'Maybelline', priority: 'ALTA', notes: 'À prova d’água' });
    });

    it('limpa um campo com texto vazio', async () => {
      const id = (await create({ name: 'Rímel', brand: 'Maybelline' })).json().id;

      const res = (await patch(id, { brand: '' })).json();

      expect(res.brand).toBeNull();
    });

    it('PATCH em item que não existe dá 404', async () => {
      const res = await patch('cmxxxxxxxxxxxxxxxxxxxxxxx', { name: 'x' });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    });
  });

  describe('fotos', () => {
    it('trocar a foto apaga a antiga na Cloudinary', async () => {
      const id = (await create({ name: 'Batom', photo: photoFor('velha') })).json().id;

      const res = await patch(id, { photo: photoFor('nova') });

      expect(res.json().photoUrl).toBe(photoFor('nova').url);
      expect(destroyImage).toHaveBeenCalledTimes(1);
      expect(destroyImage).toHaveBeenCalledWith(photoFor('velha').publicId);
    });

    it('remover a foto (photo: null) limpa o item e apaga o arquivo', async () => {
      const id = (await create({ name: 'Batom', photo: photoFor('velha') })).json().id;

      const res = await patch(id, { photo: null });

      expect(res.json().photoUrl).toBeNull();
      expect(destroyImage).toHaveBeenCalledWith(photoFor('velha').publicId);
    });

    it('editar outros campos não mexe na foto', async () => {
      const id = (await create({ name: 'Batom', photo: photoFor('fica') })).json().id;

      const res = await patch(id, { name: 'Batom vermelho' });

      expect(res.json().photoUrl).toBe(photoFor('fica').url);
      expect(destroyImage).not.toHaveBeenCalled();
    });

    it('enviar a mesma foto de novo não apaga o arquivo', async () => {
      const id = (await create({ name: 'Batom', photo: photoFor('igual') })).json().id;

      await patch(id, { photo: photoFor('igual') });

      expect(destroyImage).not.toHaveBeenCalled();
    });

    it('se a Cloudinary falhar ao apagar, a edição continua valendo', async () => {
      const id = (await create({ name: 'Batom', photo: photoFor('velha') })).json().id;
      destroyImage.mockRejectedValue(new Error('Cloudinary fora do ar'));

      const res = await patch(id, { photo: null });

      expect(res.statusCode).toBe(200);
      expect(res.json().photoUrl).toBeNull();
    });
  });

  describe('apagar', () => {
    it('remove o item e a foto; apagar de novo também dá 204', async () => {
      const id = (await create({ name: 'Batom', photo: photoFor('x') })).json().id;
      // Como o navegador: DELETE sem corpo não manda content-type.
      const del = () =>
        app.inject({ method: 'DELETE', url: `/api/items/${id}`, headers: { cookie: sessionCookie(config), origin: WEB_ORIGIN } });

      expect((await del()).statusCode).toBe(204);
      expect((await del()).statusCode).toBe(204);

      const get = await app.inject({ method: 'GET', url: `/api/items/${id}`, headers: { cookie: sessionCookie(config) } });
      expect(get.statusCode).toBe(404);
      expect(destroyImage).toHaveBeenCalledTimes(1);
      expect(destroyImage).toHaveBeenCalledWith(photoFor('x').publicId);
    });
  });
});
