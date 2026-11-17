import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

// Ações de servidor das atividades: nos testes de tela entram como padrão "sem atividade"; cada teste que precisa de
// outro retorno troca com `vi.mocked(...)` ou com o próprio `vi.mock` no arquivo.
vi.mock('@/app/perfil/activity-actions', () => ({
  previewActivityAction: vi.fn(async () => ({ ok: false })),
  shareActivityAction: vi.fn(async () => ({ ok: false, error: 'generic' })),
  recentActivitiesAction: vi.fn(async () => ({ ok: true, rows: [] })),
}));

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
