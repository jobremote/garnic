// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameShelf, type ShelfData } from './GameShelf';

const actions = vi.hoisted(() => ({
  searchGamesAction: vi.fn(),
  addGameAction: vi.fn(),
  addGamesAction: vi.fn(),
  moveGameAction: vi.fn(),
  openEntryAction: vi.fn(),
  saveEntryAction: vi.fn(),
  removeEntryAction: vi.fn(),
  createTagAction: vi.fn(),
  updateTagAction: vi.fn(),
  deleteTagAction: vi.fn(),
  discardScreenshotAction: vi.fn(),
  viewEntryAction: vi.fn(),
  reportScreenshotAction: vi.fn(),
}));
vi.mock('../shelf-actions', () => actions);

const empty = (): ShelfData => ({ 'quero-jogar': [], parado: [], jogando: [], zerado: [] });
const shelf = (own = true) => <GameShelf columns={empty()} own={own} title="Game Shelf" tags={[]} uploadMode="local" userId="u1" />;

const found = [
  { igdbId: 1, name: 'Hades', detail: '2020 · PC' },
  { igdbId: 2, name: 'Celeste', detail: '2018 · PC' },
  { igdbId: 3, name: 'Hollow Knight', detail: '2017 · PC' },
  { igdbId: 4, name: 'Já tenho', detail: '2020', status: 'zerado', entryId: 'e9' },
];

type User = ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  vi.clearAllMocks();
  actions.searchGamesAction.mockResolvedValue({ ok: true, results: found });
});

async function openQuick(user: User, column = 'Quero jogar') {
  await user.click(screen.getByRole('button', { name: `Adicionar jogos em ${column}` }));
  return screen.findByRole('dialog', { name: `Adicionar em ${column}` });
}
async function search(user: User, dialog: HTMLElement, text = 'ha') {
  await user.type(within(dialog).getByRole('searchbox', { name: 'Buscar jogo' }), text);
  await within(dialog).findByRole('button', { name: 'Incluir: Hades' }, { timeout: 3000 });
}

describe('cadastro rápido de vários jogos', () => {
  it('cada coluna tem o seu botão +, só para a dona da Game Shelf', () => {
    const { unmount } = render(shelf());
    for (const column of ['Quero jogar', 'Parado', 'Jogando', 'Zerado']) {
      expect(screen.getByRole('button', { name: `Adicionar jogos em ${column}` })).toBeInTheDocument();
    }
    unmount();
    render(shelf(false));
    expect(screen.queryByRole('button', { name: /Adicionar jogos em/ })).toBeNull();
  });

  it('escolhe vários jogos como chips, sem fechar a busca, e adiciona todos de uma vez na coluna', async () => {
    actions.addGamesAction.mockResolvedValue({ ok: true, status: 'quero-jogar', added: ['Hades', 'Celeste'], alreadyOnShelf: [] });
    const user = userEvent.setup();
    render(shelf());
    const dialog = await openQuick(user);
    expect(within(dialog).getByText('Nenhum jogo escolhido ainda.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Adicionar' })).toBeDisabled();

    await search(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Incluir: Hades' }));
    await user.click(within(dialog).getByRole('button', { name: 'Incluir: Celeste' }));
    // A lista escolhida aparece como chips e o botão mostra a quantidade.
    expect(within(dialog).getByRole('button', { name: 'Tirar da lista: Hades' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Tirar da lista: Celeste' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Incluído: Hades' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(dialog).getByRole('button', { name: 'Adicionar 2 jogos' }));
    expect(actions.addGamesAction).toHaveBeenCalledWith([1, 2], 'quero-jogar');
    expect(await screen.findByText('2 jogos adicionados')).toBeInTheDocument();
    expect(screen.getByText('Entraram em Quero jogar.')).toBeInTheDocument();
  });

  it('tirar um chip (ou clicar de novo em Incluído) remove da lista', async () => {
    const user = userEvent.setup();
    render(shelf());
    const dialog = await openQuick(user);
    await search(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Incluir: Hades' }));
    await user.click(within(dialog).getByRole('button', { name: 'Incluir: Celeste' }));
    await user.click(within(dialog).getByRole('button', { name: 'Tirar da lista: Hades' }));
    expect(within(dialog).queryByRole('button', { name: 'Tirar da lista: Hades' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Incluído: Celeste' }));
    expect(within(dialog).getByText('Nenhum jogo escolhido ainda.')).toBeInTheDocument();
  });

  it('a lista escolhida não se perde ao buscar outro nome', async () => {
    const user = userEvent.setup();
    render(shelf());
    const dialog = await openQuick(user);
    await search(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Incluir: Hades' }));
    actions.searchGamesAction.mockResolvedValue({ ok: true, results: [{ igdbId: 7, name: 'Outro', detail: '2021' }] });
    await user.clear(within(dialog).getByRole('searchbox', { name: 'Buscar jogo' }));
    await user.type(within(dialog).getByRole('searchbox', { name: 'Buscar jogo' }), 'out');
    await within(dialog).findByRole('button', { name: 'Incluir: Outro' }, { timeout: 3000 });
    expect(within(dialog).getByRole('button', { name: 'Tirar da lista: Hades' })).toBeInTheDocument();
  });

  it('jogo que já está na Game Shelf mostra o selo da coluna e não pode ser incluído', async () => {
    const user = userEvent.setup();
    render(shelf());
    const dialog = await openQuick(user);
    await search(user, dialog);
    expect(within(dialog).queryByRole('button', { name: /Incluir: Já tenho/ })).toBeNull();
    expect(within(dialog).getByText('Zerado', { selector: '.nds-badge' })).toBeInTheDocument();
  });

  it('avisa quantos já estavam na Game Shelf e não mudaram de coluna', async () => {
    actions.addGamesAction.mockResolvedValue({ ok: true, status: 'jogando', added: ['Hades'], alreadyOnShelf: ['Celeste'] });
    const user = userEvent.setup();
    render(shelf());
    const dialog = await openQuick(user, 'Jogando');
    await search(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Incluir: Hades' }));
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar 1 jogo' }));
    expect(actions.addGamesAction).toHaveBeenCalledWith([1], 'jogando');
    expect(await screen.findByText('1 jogo adicionado')).toBeInTheDocument();
    expect(screen.getByText(/1 já estava na sua Game Shelf e não mudou de coluna/)).toBeInTheDocument();
  });

  it('falha ao adicionar mostra o erro e mantém a janela aberta com a lista', async () => {
    actions.addGamesAction.mockResolvedValue({ ok: false, error: 'unavailable' });
    const user = userEvent.setup();
    render(shelf());
    const dialog = await openQuick(user);
    await search(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Incluir: Hades' }));
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar 1 jogo' }));
    expect(await screen.findByText(/A busca de jogos está fora do ar agora/)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Adicionar em Quero jogar' })).toBeInTheDocument();
  });

  it('com 20 jogos escolhidos, os demais ficam desabilitados e o limite é explicado', async () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ igdbId: 100 + i, name: `Jogo ${i + 1}`, detail: '2020' }));
    actions.searchGamesAction.mockResolvedValue({ ok: true, results: many });
    const user = userEvent.setup();
    render(shelf());
    const dialog = await openQuick(user);
    await user.type(within(dialog).getByRole('searchbox', { name: 'Buscar jogo' }), 'jogo');
    await within(dialog).findByRole('button', { name: 'Incluir: Jogo 1' }, { timeout: 3000 });
    for (let i = 1; i <= 20; i += 1) await user.click(within(dialog).getByRole('button', { name: `Incluir: Jogo ${i}` }));
    expect(within(dialog).getByRole('button', { name: 'Incluir: Jogo 21' })).toBeDisabled();
    expect(within(dialog).getByText(/Você chegou a 20 jogos/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Adicionar 20 jogos' })).toBeEnabled();
  });

  it('o X limpa a busca, mantém os chips e devolve o foco; sem texto não há X', async () => {
    const user = userEvent.setup();
    render(shelf());
    const dialog = await openQuick(user);
    expect(within(dialog).queryByRole('button', { name: 'Limpar busca' })).toBeNull();
    await search(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Incluir: Hades' }));
    await user.click(within(dialog).getByRole('button', { name: 'Limpar busca' }));
    const field = within(dialog).getByRole('searchbox', { name: 'Buscar jogo' });
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
    expect(within(dialog).getByText('Digite pelo menos 2 letras.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Tirar da lista: Hades' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Limpar busca' })).toBeNull();
  });

  it('clicar fora da janela não fecha; o X da janela fecha', async () => {
    const user = userEvent.setup();
    render(shelf());
    const dialog = await openQuick(user);
    await user.click(dialog); // o fundo escurecido
    expect(screen.getByRole('dialog', { name: 'Adicionar em Quero jogar' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog', { name: /Adicionar em/ })).toBeNull();
  });

  it('cancelar fecha sem adicionar nada', async () => {
    const user = userEvent.setup();
    render(shelf());
    const dialog = await openQuick(user);
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog', { name: /Adicionar em/ })).toBeNull();
    expect(actions.addGamesAction).not.toHaveBeenCalled();
  });
});
