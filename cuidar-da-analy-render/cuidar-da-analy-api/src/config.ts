import { z } from 'zod';

/** Aceita uma ou várias origens separadas por vírgula (ex.: site do Netlify + domínio próprio). */
const isOriginList = (value: string) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .every((s) => {
      try {
        const u = new URL(s);
        return u.protocol === 'https:' || u.hostname === 'localhost';
      } catch {
        return false;
      }
    });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID é obrigatória'),
  ALLOWED_EMAIL: z.string().trim().toLowerCase().pipe(z.email('ALLOWED_EMAIL precisa ser um e-mail')),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET precisa ter pelo menos 32 caracteres'),
  WEB_ORIGIN: z
    .string()
    .refine(isOriginList, 'WEB_ORIGIN precisa ser uma URL https (ou http://localhost), separadas por vírgula')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => new URL(s).origin),
    ),
  CLOUDINARY_CLOUD_NAME: z.string().min(1, 'CLOUDINARY_CLOUD_NAME é obrigatória'),
  CLOUDINARY_API_KEY: z.string().min(1, 'CLOUDINARY_API_KEY é obrigatória'),
  CLOUDINARY_API_SECRET: z.string().min(1, 'CLOUDINARY_API_SECRET é obrigatória'),
});

export type Config = Omit<z.output<typeof EnvSchema>, 'WEB_ORIGIN'> & {
  /** Origens permitidas para chamar a API (verificação de Origin e CORS). */
  webOrigins: string[];
  isProduction: boolean;
  /** Em produção usa o prefixo __Host-, que obriga Secure + Path=/ + sem Domain. */
  sessionCookieName: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Variáveis de ambiente inválidas:\n${z.prettifyError(parsed.error)}`);
  }
  const { WEB_ORIGIN, ...rest } = parsed.data;
  const isProduction = rest.NODE_ENV === 'production';
  return {
    ...rest,
    webOrigins: WEB_ORIGIN,
    isProduction,
    sessionCookieName: isProduction ? '__Host-analy' : 'analy',
  };
}
