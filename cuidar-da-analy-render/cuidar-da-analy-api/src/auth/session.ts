import { createHmac, timingSafeEqual } from 'node:crypto';

export interface Session {
  email: string;
  name: string | null;
  /** Expiração em segundos desde 1970. */
  exp: number;
}

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dias

const hmac = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest();

/** Cookie de sessão sem estado: base64url(JSON).assinatura-HMAC. Sem JWT, sem dependência. */
export function signSession(session: Session, secret: string): string {
  const body = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${body}.${hmac(body, secret).toString('base64url')}`;
}

export function verifySession(token: string | undefined, secret: string, nowMs = Date.now()): Session | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts as [string, string];

  const expected = hmac(body, secret);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (typeof data.email !== 'string' || typeof data.exp !== 'number') return null;
    if (data.exp * 1000 <= nowMs) return null;
    return { email: data.email, name: typeof data.name === 'string' ? data.name : null, exp: data.exp };
  } catch {
    return null;
  }
}
