import { describe, expect, it } from 'vitest';
import { testConfig } from './helpers.js';

describe('configuração', () => {
  it('normaliza o e-mail permitido para minúsculas', () => {
    expect(testConfig().ALLOWED_EMAIL).toBe('ele@example.com');
  });

  it('aceita várias origens separadas por vírgula e guarda só a origem (sem caminho)', () => {
    const config = testConfig({ WEB_ORIGIN: 'https://a.netlify.app/, https://analy.example/qualquer' });

    expect(config.webOrigins).toEqual(['https://a.netlify.app', 'https://analy.example']);
  });

  it('recusa SESSION_SECRET curto', () => {
    expect(() => testConfig({ SESSION_SECRET: 'curto' })).toThrow(/SESSION_SECRET/);
  });

  it('recusa origem sem https (fora o localhost)', () => {
    expect(() => testConfig({ WEB_ORIGIN: 'http://analy.example' })).toThrow(/WEB_ORIGIN/);
  });

  it('usa cookie com prefixo __Host- só em produção', () => {
    expect(testConfig({ NODE_ENV: 'production' }).sessionCookieName).toBe('__Host-analy');
    expect(testConfig({ NODE_ENV: 'development' }).sessionCookieName).toBe('analy');
  });
});
