// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameShelf, type ShelfData } from './GameShelf';

const actions = vi.hoisted(() => ({
  searchGamesAction: vi.fn(),
  addGameAction: vi.fn(),
  moveGameAction: vi.fn(),
  openEntryAction: vi.fn(),
  saveEntryAction: vi.fn(),
  removeEntryAction: vi.fn(),
}));
vi.mock('../shelf-actions', () => actions);

const ID = '11111111-1111-4111-8111-111111111111';
const empty = (): ShelfData => ({ 'quero-jogar': [], parado: [], jogando: [], zerado: [] });
const columns = (): ShelfData => ({ ...empty(), jogando: [{ entryId: ID, name: 'Celeste', detail: '2018', tags: [] }] });

const entry = (over: Record<string, unknown> = {}) => ({
  entryId: ID,
  status: 'jogando',
  platform: null,
  rating: null,
  review: null,
  reviewSpoiler: false,
  started: { month: null, year: null },
  ended: { month: null, year: null },
  playMinutes: null,
  tagIds: [],
  gameName: 'Celeste',
  year: '2018',
  platforms: ['PC (Microsoft Windows)', 'Nintendo Switch'],
  ...over,
});

type User = ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  vi.clearAllMocks();
});

async function moveToZeroed(user: User) {
  await user.click(screen.getByRole('button', { name: 'Ações de Celeste' }));
  await user.click(screen.getByRole('menuitem', { name: 'Mover para Zerado' }));
  return screen.findByRole('dialog', { name: 'Jogo zerado!' });
}

describe('Game Shelf: pop-up do Zerado', () => {
  it('mover para Zerado conclui na hora e abre o pop-up opcional, com as estimativas do IGDB', async () => {
    actions.moveGameAction.mockResolvedValue({ ok: true, gameName: 'Celeste', status: 'zerado', changed: true });
    actions.openEntryAction.mockResolvedValue({ ok: true, entry: entry({ status: 'zerado' }), timeToBeat: { hastily: 480, normally: 600, completely: 1500 } });
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={[]} />);
    const dialog = await moveToZeroed(user);

    expect(await within(dialog).findByText('Celeste está em Zerado.')).toBeInTheDocument();
    expect(within(dialog).getByText('8 h')).toBeInTheDocument();
    expect(within(dialog).getByText('10 h')).toBeInTheDocument();
    expect(within(dialog).getByText('25 h')).toBeInTheDocument();
    // "Agora não" fecha sem exigir nada.
    await user.click(within(dialog).getByRole('button', { name: 'Agora não' }));
    expect(screen.queryByRole('dialog', { name: 'Jogo zerado!' })).toBeNull();
    expect(actions.saveEntryAction).not.toHaveBeenCalled();
  });

  it('salva nota e tempo pelo pop-up; sem estimativa do IGDB, nada aparece', async () => {
    actions.moveGameAction.mockResolvedValue({ ok: true, gameName: 'Celeste', status: 'zerado', changed: true });
    actions.openEntryAction.mockResolvedValue({ ok: true, entry: entry({ status: 'zerado' }), timeToBeat: null });
    actions.saveEntryAction.mockResolvedValue({ ok: true, gameName: 'Celeste', status: 'zerado', statusChanged: false });
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={[]} />);
    const dialog = await moveToZeroed(user);

    await within(dialog).findByText('Celeste está em Zerado.'); // espera a entrada carregar
    expect(within(dialog).queryByText('Estimativas do IGDB')).toBeNull();
    await user.click(within(dialog).getByRole('radio', { name: '4 estrelas' }));
    await user.type(within(dialog).getByRole('spinbutton', { name: 'Horas' }), '12');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(actions.saveEntryAction).toHaveBeenCalledWith(ID, { rating: 4, ended: { month: null, year: null }, playMinutes: 720 });
    expect(await screen.findByText('Entrada salva')).toBeInTheDocument();
  });
});

describe('Game Shelf: editar a entrada', () => {
  const openEdit = async (user: User) => {
    await user.click(screen.getByRole('button', { name: 'Ações de Celeste' }));
    await user.click(screen.getByRole('menuitem', { name: 'Editar entrada' }));
    return screen.findByRole('dialog', { name: 'Editar entrada' });
  };

  it('tem 3 abas, abre na Essencial e salva todos os campos juntos', async () => {
    actions.openEntryAction.mockResolvedValue({ ok: true, entry: entry(), timeToBeat: null });
    actions.saveEntryAction.mockResolvedValue({ ok: true, gameName: 'Celeste', status: 'jogando', statusChanged: false });
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={[]} />);
    const dialog = await openEdit(user);

    expect((await within(dialog).findAllByRole('tab')).map((tab) => tab.textContent)).toEqual(['Essencial', 'Jogatina', 'Review']);
    expect(within(dialog).getByRole('tab', { name: 'Essencial' })).toHaveAttribute('aria-selected', 'true');

    await user.click(within(dialog).getByRole('radio', { name: '5 estrelas' }));
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Plataforma' }), 'Nintendo Switch');
    // Jogando: o tempo de jogo não aparece, só o aviso.
    await user.click(within(dialog).getByRole('tab', { name: /Jogatina/ }));
    expect(within(dialog).queryByRole('group', { name: 'Tempo de jogo' })).toBeNull();
    await user.click(within(dialog).getByRole('tab', { name: /Review/ }));
    await user.type(within(dialog).getByRole('textbox', { name: /Review/ }), 'Obra-prima');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Contém spoiler' }));
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(actions.saveEntryAction).toHaveBeenCalledWith(ID, {
      status: 'jogando',
      rating: 5,
      platform: 'Nintendo Switch',
      review: 'Obra-prima',
      reviewSpoiler: true,
      tagIds: [],
      started: { month: null, year: null },
      ended: { month: null, year: null },
    });
    expect(await screen.findByText('Os detalhes de Celeste foram atualizados.')).toBeInTheDocument();
  });

  it('aba com algo preenchido ganha o ponto', async () => {
    actions.openEntryAction.mockResolvedValue({ ok: true, entry: entry({ review: 'Já escrevi', rating: 3 }), timeToBeat: null });
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={[]} />);
    const dialog = await openEdit(user);
    expect(within(dialog).getByRole('tab', { name: /Essencial/ })).toHaveTextContent('preenchida');
    expect(within(dialog).getByRole('tab', { name: /Review/ })).toHaveTextContent('preenchida');
    expect(within(dialog).getByRole('tab', { name: /Jogatina/ })).not.toHaveTextContent('preenchida');
  });

  it('em Zerado a aba Jogatina mostra o tempo de jogo', async () => {
    actions.openEntryAction.mockResolvedValue({ ok: true, entry: entry({ status: 'zerado' }), timeToBeat: null });
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={[]} />);
    const dialog = await openEdit(user);
    await user.click(within(dialog).getByRole('tab', { name: /Jogatina/ }));
    expect(within(dialog).getByRole('group', { name: 'Tempo de jogo' })).toBeInTheDocument();
  });

  it('erro de validação aparece no campo e leva para a aba certa', async () => {
    actions.openEntryAction.mockResolvedValue({ ok: true, entry: entry(), timeToBeat: null });
    actions.saveEntryAction.mockResolvedValue({ ok: false, error: 'invalid', errors: { ended: 'O fim não pode ser antes do início.' } });
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={[]} />);
    const dialog = await openEdit(user);
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByText('O fim não pode ser antes do início.')).toBeVisible();
    expect(within(dialog).getByRole('tab', { name: /Jogatina/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('mudar o status para Zerado pela edição abre o pop-up do Zerado depois de salvar', async () => {
    actions.openEntryAction.mockResolvedValue({ ok: true, entry: entry(), timeToBeat: null });
    actions.saveEntryAction.mockResolvedValue({ ok: true, gameName: 'Celeste', status: 'zerado', statusChanged: true });
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={[]} />);
    const dialog = await openEdit(user);
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Status' }), 'Zerado');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('dialog', { name: 'Jogo zerado!' })).toBeInTheDocument();
  });
});

describe('Game Shelf: remover', () => {
  it('pede confirmação, explica o que sai e remove', async () => {
    actions.removeEntryAction.mockResolvedValue({ ok: true, gameName: 'Celeste' });
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={[]} />);
    await user.click(screen.getByRole('button', { name: 'Ações de Celeste' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remover da Game Shelf' }));

    const dialog = await screen.findByRole('dialog', { name: 'Remover da Game Shelf?' });
    expect(within(dialog).getByText(/junto com a nota, a review e as datas/)).toBeInTheDocument();
    expect(actions.removeEntryAction).not.toHaveBeenCalled(); // só depois de confirmar
    await user.click(within(dialog).getByRole('button', { name: 'Remover' }));
    expect(actions.removeEntryAction).toHaveBeenCalledWith(ID);
    expect(await screen.findByText('Celeste saiu da sua Game Shelf.')).toBeInTheDocument();
  });

  it('cancelar não remove', async () => {
    actions.openEntryAction.mockResolvedValue({ ok: true, entry: entry(), timeToBeat: null });
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={[]} />);
    await user.click(screen.getByRole('button', { name: 'Ações de Celeste' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remover da Game Shelf' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remover da Game Shelf?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(actions.removeEntryAction).not.toHaveBeenCalled();
  });
});

describe('Game Shelf: adicionar e detalhar', () => {
  const found = { igdbId: 7, name: 'Hades', detail: '2020 · PC', status: undefined };
  const search = async (user: User) => {
    await user.click(screen.getByRole('button', { name: 'Adicionar jogo' }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar jogo' }), 'hades');
  };

  it('adiciona e abre a edição da entrada', async () => {
    actions.searchGamesAction.mockResolvedValue({ ok: true, results: [found] });
    actions.addGameAction.mockResolvedValue({ ok: true, entryId: ID, gameName: 'Hades', status: 'quero-jogar', alreadyOnShelf: false });
    actions.openEntryAction.mockResolvedValue({ ok: true, entry: entry({ gameName: 'Hades' }), timeToBeat: null });
    const user = userEvent.setup();
    render(<GameShelf columns={empty()} own title="Game Shelf" tags={[]} />);
    await search(user);
    await user.click(await screen.findByRole('button', { name: 'Adicionar Hades' }, { timeout: 3000 }));
    await user.click(screen.getByRole('button', { name: 'Adicionar e detalhar' }));
    expect(await screen.findByRole('dialog', { name: 'Editar entrada' })).toBeInTheDocument();
  });

  it('adicionar já como Zerado abre o pop-up do Zerado', async () => {
    actions.searchGamesAction.mockResolvedValue({ ok: true, results: [found] });
    actions.addGameAction.mockResolvedValue({ ok: true, entryId: ID, gameName: 'Hades', status: 'zerado', alreadyOnShelf: false });
    actions.openEntryAction.mockResolvedValue({ ok: true, entry: entry({ gameName: 'Hades', status: 'zerado' }), timeToBeat: null });
    const user = userEvent.setup();
    render(<GameShelf columns={empty()} own title="Game Shelf" tags={[]} />);
    await search(user);
    await user.click(await screen.findByRole('button', { name: 'Adicionar Hades' }, { timeout: 3000 }));
    await user.click(screen.getByRole('radio', { name: /Zerado/ }));
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByRole('dialog', { name: 'Jogo zerado!' })).toBeInTheDocument();
  });

  it('jogo que já está na estante abre a entrada existente, sem duplicar', async () => {
    actions.searchGamesAction.mockResolvedValue({ ok: true, results: [{ ...found, status: 'jogando', entryId: ID }] });
    actions.openEntryAction.mockResolvedValue({ ok: true, entry: entry({ gameName: 'Hades' }), timeToBeat: null });
    const user = userEvent.setup();
    render(<GameShelf columns={empty()} own title="Game Shelf" tags={[]} />);
    await search(user);
    await user.click(await screen.findByRole('button', { name: 'Editar entrada: Hades' }, { timeout: 3000 }));
    expect(await screen.findByRole('dialog', { name: 'Editar entrada' })).toBeInTheDocument();
    expect(actions.addGameAction).not.toHaveBeenCalled();
  });
});
