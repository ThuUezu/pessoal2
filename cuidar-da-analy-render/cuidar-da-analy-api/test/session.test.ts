import { describe, expect, it } from 'vitest';
import { signSession, verifySession } from '../src/auth/session.js';

const secret = 's'.repeat(40);
const nowMs = 1_800_000_000_000;
const inOneHour = nowMs / 1000 + 3600;

describe('sessão assinada', () => {
  it('devolve os dados quando a assinatura e a validade estão corretas', () => {
    const token = signSession({ email: 'ele@example.com', name: 'Ele', exp: inOneHour }, secret);

    expect(verifySession(token, secret, nowMs)).toEqual({ email: 'ele@example.com', name: 'Ele', exp: inOneHour });
  });

  it('recusa quando o conteúdo foi alterado (troca de e-mail)', () => {
    const token = signSession({ email: 'ele@example.com', name: null, exp: inOneHour }, secret);
    const [, signature] = token.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ email: 'outro@example.com', name: null, exp: inOneHour })).toString('base64url');

    expect(verifySession(`${forgedBody}.${signature}`, secret, nowMs)).toBeNull();
  });

  it('recusa quando a assinatura foi trocada', () => {
    const token = signSession({ email: 'ele@example.com', name: null, exp: inOneHour }, secret);
    const [body] = token.split('.');

    expect(verifySession(`${body}.AAAA`, secret, nowMs)).toBeNull();
  });

  it('recusa quando foi assinada com outro segredo', () => {
    const token = signSession({ email: 'ele@example.com', name: null, exp: inOneHour }, 'outro-segredo-'.repeat(4));

    expect(verifySession(token, secret, nowMs)).toBeNull();
  });

  it('recusa sessão expirada', () => {
    const token = signSession({ email: 'ele@example.com', name: null, exp: nowMs / 1000 - 1 }, secret);

    expect(verifySession(token, secret, nowMs)).toBeNull();
  });

  it.each([undefined, '', 'lixo', 'a.b.c', '.'])('recusa valor inválido: %j', (value) => {
    expect(verifySession(value, secret, nowMs)).toBeNull();
  });
});
