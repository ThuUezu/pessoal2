import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Os testes de integração compartilham o mesmo banco: rodar um arquivo por vez.
    fileParallelism: false,
  },
});
