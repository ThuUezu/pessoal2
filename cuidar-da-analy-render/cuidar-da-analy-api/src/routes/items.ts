import type { Item, Prisma, PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger, FastifyPluginAsync } from 'fastify';
import type { Config } from '../config.js';
import type { DestroyImage } from '../lib/cloudinary.js';
import { notFound } from '../lib/errors.js';
import { IdParams, ListItemsQuery, makeItemSchemas } from '../schemas.js';

interface Deps {
  config: Config;
  prisma: PrismaClient;
  destroyImage: DestroyImage;
}

/** Forma pública do item. O publicId da foto fica no servidor (o frontend só precisa da URL). */
export function serializeItem(item: Item) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    brand: item.brand,
    notes: item.notes,
    whereSeen: item.whereSeen,
    priority: item.priority,
    status: item.status,
    origin: item.origin,
    paidWith: item.paidWith,
    photoUrl: item.photoUrl,
    purchasedAt: item.purchasedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export const itemRoutes = ({ config, prisma, destroyImage }: Deps): FastifyPluginAsync => async (app) => {
  const schemas = makeItemSchemas(config.CLOUDINARY_CLOUD_NAME);

  /** Apagar a foto antiga é "o melhor possível": se falhar, o item já foi salvo e só sobra um arquivo órfão. */
  async function discardPhoto(publicId: string | null, log: FastifyBaseLogger) {
    if (!publicId) return;
    try {
      await destroyImage(publicId);
    } catch (err) {
      log.warn({ err, publicId }, 'Não consegui apagar a foto antiga na Cloudinary');
    }
  }

  app.get('/items', async (req) => {
    const { status, page, pageSize } = ListItemsQuery.parse(req.query);
    const where: Prisma.ItemWhereInput = status ? { status } : {};
    const orderBy: Prisma.ItemOrderByWithRelationInput[] =
      status === 'COMPRADO'
        ? [{ purchasedAt: 'desc' }, { id: 'desc' }]
        : [{ priority: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }];

    const [totalItems, rows] = await Promise.all([
      prisma.item.count({ where }),
      prisma.item.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return {
      data: rows.map(serializeItem),
      pagination: { page, pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)) },
    };
  });

  app.post('/items', async (req, reply) => {
    const { photo, ...fields } = schemas.create.parse(req.body);
    const item = await prisma.item.create({
      data: { ...fields, photoUrl: photo?.url ?? null, photoPublicId: photo?.publicId ?? null },
    });
    return reply.code(201).send(serializeItem(item));
  });

  app.get('/items/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    const item = await prisma.item.findUnique({ where: { id } });
    if (!item) throw notFound('Coisa');
    return serializeItem(item);
  });

  app.patch('/items/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    const { photo, status, ...fields } = schemas.update.parse(req.body);

    const existing = await prisma.item.findUnique({ where: { id } });
    if (!existing) throw notFound('Coisa');

    const data: Prisma.ItemUpdateInput = { ...fields };
    if (photo !== undefined) {
      data.photoUrl = photo?.url ?? null;
      data.photoPublicId = photo?.publicId ?? null;
    }
    // A data da compra é do servidor. Repetir COMPRADO não muda a data (idempotente); PENDENTE limpa.
    if (status !== undefined && status !== existing.status) {
      data.status = status;
      data.purchasedAt = status === 'COMPRADO' ? new Date() : null;
    }

    const updated = await prisma.item.update({ where: { id }, data });
    if (photo !== undefined && existing.photoPublicId && existing.photoPublicId !== photo?.publicId) {
      await discardPhoto(existing.photoPublicId, req.log);
    }
    return serializeItem(updated);
  });

  // Idempotente: apagar algo que já não existe também dá 204.
  app.delete('/items/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const existing = await prisma.item.findUnique({ where: { id } });
    if (existing) {
      await prisma.item.deleteMany({ where: { id } });
      await discardPhoto(existing.photoPublicId, req.log);
    }
    return reply.code(204).send();
  });
};
