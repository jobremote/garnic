import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// Segredo fixo e senha com custo baixo, só para os testes ficarem rápidos e repetíveis.
process.env.AUTH_SECRET = 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';
process.env.PASSWORD_HASH_COST = '10';

afterEach(async () => {
  // Os testes de tela (jsdom) precisam limpar o DOM; nos de servidor este módulo não existe.
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
  }
});
