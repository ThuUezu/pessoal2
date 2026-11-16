import { createHash } from 'node:crypto';

export const UPLOAD_FOLDER = 'cuidar-da-analy/itens';

export interface CloudinaryCreds {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * Assinatura da Cloudinary: parâmetros em ordem alfabética (k=v&k=v) + API secret, SHA-1 em hex.
 * Só entram na conta os parâmetros assinados (file, api_key e resource_type ficam de fora).
 */
export function signParams(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1').update(toSign + apiSecret).digest('hex');
}

/** Dados para o navegador enviar a foto direto para a Cloudinary. O segredo nunca sai do servidor. */
export function createUploadSignature(creds: CloudinaryCreds, nowMs = Date.now()) {
  const timestamp = Math.floor(nowMs / 1000);
  return {
    cloudName: creds.cloudName,
    apiKey: creds.apiKey,
    timestamp,
    folder: UPLOAD_FOLDER,
    signature: signParams({ folder: UPLOAD_FOLDER, timestamp }, creds.apiSecret),
    uploadUrl: `https://api.cloudinary.com/v1_1/${creds.cloudName}/image/upload`,
  };
}

export type DestroyImage = (publicId: string) => Promise<void>;

export function createImageDestroyer(creds: CloudinaryCreds): DestroyImage {
  return async (publicId) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = new URLSearchParams({
      public_id: publicId,
      timestamp: String(timestamp),
      api_key: creds.apiKey,
      signature: signParams({ public_id: publicId, timestamp }, creds.apiSecret),
    });
    const res = await fetch(`https://api.cloudinary.com/v1_1/${creds.cloudName}/image/destroy`, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Cloudinary respondeu ${res.status} ao apagar a foto`);
  };
}
