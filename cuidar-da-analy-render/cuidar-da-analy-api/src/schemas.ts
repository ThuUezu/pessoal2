import { z } from 'zod';
import { UPLOAD_FOLDER } from './lib/cloudinary.js';

export const CATEGORIES = ['MAQUIAGEM', 'COMIDA', 'ROUPA', 'OUTRO'] as const;
export const PRIORITIES = ['BAIXA', 'MEDIA', 'ALTA'] as const;
export const ITEM_STATUSES = ['PENDENTE', 'COMPRADO'] as const;
export const ORIGINS = ['ELA_PEDIU', 'PEGOU_E_DEVOLVEU', 'ESTAVA_ACABANDO'] as const;
export const PAID_WITH = ['MEU_DINHEIRO', 'CAIXINHA'] as const;

/** Texto opcional: apara espaços e transforma "" em null (para limpar um campo). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `No máximo ${max} caracteres`)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export function makeItemSchemas(cloudName: string) {
  // Só aceitamos fotos que o NOSSO upload assinado gerou: mesma conta, mesma pasta.
  const photo = z
    .strictObject({
      url: z.url().refine((u) => u.startsWith(`https://res.cloudinary.com/${cloudName}/`), 'Foto inválida'),
      publicId: z
        .string()
        .max(200)
        .regex(/^[A-Za-z0-9_\-/]+$/, 'Foto inválida')
        .refine((id) => id.startsWith(`${UPLOAD_FOLDER}/`), 'Foto inválida'),
    })
    .refine((p) => p.url.includes(p.publicId), 'Foto inválida');

  const fields = {
    name: z.string().trim().min(1, 'Dê um nome para a coisa').max(120, 'No máximo 120 caracteres'),
    category: z.enum(CATEGORIES),
    brand: optionalText(80),
    notes: optionalText(1000),
    whereSeen: optionalText(200),
    priority: z.enum(PRIORITIES),
    origin: z.enum(ORIGINS),
    paidWith: z.enum(PAID_WITH),
  };

  // strictObject: campos desconhecidos (id, purchasedAt, createdAt...) viram erro, não são ignorados.
  const create = z.strictObject({
    ...fields,
    category: fields.category.optional(),
    priority: fields.priority.optional(),
    origin: fields.origin.optional(),
    paidWith: fields.paidWith.optional(),
    photo: photo.nullable().optional(),
  });

  const update = z.strictObject({
    name: fields.name.optional(),
    category: fields.category.optional(),
    brand: fields.brand,
    notes: fields.notes,
    whereSeen: fields.whereSeen,
    priority: fields.priority.optional(),
    origin: fields.origin.optional(),
    paidWith: fields.paidWith.optional(),
    status: z.enum(ITEM_STATUSES).optional(),
    /** null remove a foto; um objeto troca; ausente mantém. */
    photo: photo.nullable().optional(),
  });

  return { create, update };
}

export const ListItemsQuery = z.object({
  status: z.enum(ITEM_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const IdParams = z.object({ id: z.string().regex(/^[a-z0-9]{10,40}$/, 'Identificador inválido') });

export const GoogleCallbackBody = z.object({
  credential: z.string().min(1),
  g_csrf_token: z.string().min(1),
});
