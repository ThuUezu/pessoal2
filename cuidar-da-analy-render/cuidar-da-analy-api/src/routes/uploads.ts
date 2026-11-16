import type { FastifyPluginAsync } from 'fastify';
import type { Config } from '../config.js';
import { createUploadSignature } from '../lib/cloudinary.js';

export const uploadRoutes = (config: Config): FastifyPluginAsync => async (app) => {
  // POST (e não GET) porque cada chamada gera uma assinatura nova, válida por poucos minutos.
  app.post('/uploads/signatures', async () =>
    createUploadSignature({
      cloudName: config.CLOUDINARY_CLOUD_NAME,
      apiKey: config.CLOUDINARY_API_KEY,
      apiSecret: config.CLOUDINARY_API_SECRET,
    }),
  );
};
