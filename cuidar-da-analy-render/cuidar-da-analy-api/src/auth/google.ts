import { OAuth2Client } from 'google-auth-library';

export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  name: string | null;
}

/** Valida o ID token do Google Identity Services. Injetável para os testes não chamarem o Google. */
export type VerifyGoogleIdToken = (idToken: string) => Promise<GoogleIdentity>;

export function createGoogleVerifier(clientId: string): VerifyGoogleIdToken {
  const client = new OAuth2Client(clientId);
  return async (idToken) => {
    // verifyIdToken confere assinatura, validade, emissor (accounts.google.com) e audiência (nosso Client ID).
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload?.email) throw new Error('Token do Google sem e-mail');
    return {
      email: payload.email,
      emailVerified: payload.email_verified === true,
      name: payload.name ?? null,
    };
  };
}
