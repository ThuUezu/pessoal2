/** Erro esperado, com status HTTP e um código estável para o frontend. */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, 'NOT_FOUND', `${what} não encontrada.`);

/** Mensagens genéricas para erros do próprio Fastify/plugins (nunca vazam detalhes internos). */
export function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Pedido inválido.';
    case 401:
      return 'Entre com sua conta Google para continuar.';
    case 403:
      return 'Acesso não permitido.';
    case 404:
      return 'Não encontrado.';
    case 413:
      return 'O arquivo é grande demais.';
    case 415:
      return 'Formato de pedido não suportado.';
    case 429:
      return 'Muitas tentativas. Espere um pouco e tente de novo.';
    default:
      return 'Algo deu errado. Tente de novo.';
  }
}
