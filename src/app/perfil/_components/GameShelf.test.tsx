// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameShelf, type ShelfData } from './GameShelf';

const actions = vi.hoisted(() => ({
  searchGamesAction: vi.fn(),
  addGameAction: vi.fn(),
  moveGameAction: vi.fn(),
}));
vi.mock('../shelf-actions', () => actions);

const empty = (): ShelfData => ({ 'quero-jogar': [], parado: [], jogando: [], zerado: [] });
const columns = (): ShelfData => ({ ...empty(), jogando: [{ entryId: '11111111-1111-4111-8111-111111111111', name: 'Celeste', detail: '2018' }] });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Game Shelf: ver', () => {
  it('mostra as 4 colunas com a contagem e o jogo na coluna certa', () => {
    render(<GameShelf columns={columns()} own title="Game Shelf" />);
    const jogando = screen.getByRole('region', { name: 'Jogando' });
    expect(within(jogando).getByText('Celeste')).toBeInTheDocument();
    expect(within(jogando).getByText('1')).toBeInTheDocument();
    expect(screen.getAllByText('Nenhum jogo aqui ainda.')).toHaveLength(3);
  });

  it('no perfil de outra pessoa não há adicionar, menu nem arrastar', () => {
    render(<GameShelf columns={columns()} own={false} title="Game Shelf" />);
    expect(screen.queryByRole('button', { name: 'Adicionar jogo' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Ações de/ })).toBeNull();
    expect(screen.getByText('Celeste').closest('[draggable]')).toHaveAttribute('draggable', 'false');
  });
});

describe('Game Shelf: mover', () => {
  it('o menu "Mover para" leva o card para a coluna escolhida e avisa', async () => {
    // A ação fica pendente até o teste liberar: enquanto isso o card já aparece na coluna nova (atualização otimista).
    // Na tela real, depois da ação o servidor reenvia a estante e o estado passa a vir das props.
    let finish: (value: unknown) => void = () => {};
    actions.moveGameAction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" />);

    await user.click(screen.getByRole('button', { name: 'Ações de Celeste' }));
    expect(screen.queryByRole('menuitem', { name: 'Mover para Jogando' })).toBeNull(); // não oferece a coluna atual
    await user.click(screen.getByRole('menuitem', { name: 'Mover para Zerado' }));

    expect(actions.moveGameAction).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'zerado');
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Zerado' })).getByText('Celeste')).toBeInTheDocument());
    expect(within(screen.getByRole('region', { name: 'Jogando' })).queryByText('Celeste')).toBeNull();

    finish({ ok: true, gameName: 'Celeste', status: 'zerado', changed: true });
    expect(await screen.findByText('Celeste agora está em Zerado.')).toBeInTheDocument();
  });

  it('falha ao mover mostra aviso de erro', async () => {
    actions.moveGameAction.mockResolvedValue({ ok: false, error: 'not-found' });
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" />);
    await user.click(screen.getByRole('button', { name: 'Ações de Celeste' }));
    await user.click(screen.getByRole('menuitem', { name: 'Mover para Parado' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível concluir');
  });
});

describe('Game Shelf: adicionar', () => {
  const found = { igdbId: 7, name: 'Hades', detail: '2020 · PC', status: undefined };

  it('busca, escolhe o status e adiciona', async () => {
    actions.searchGamesAction.mockResolvedValue({ ok: true, results: [found, { igdbId: 8, name: 'Celeste', detail: '2018', status: 'jogando' }] });
    actions.addGameAction.mockResolvedValue({ ok: true, gameName: 'Hades', status: 'jogando', alreadyOnShelf: false });
    const user = userEvent.setup();
    render(<GameShelf columns={empty()} own title="Game Shelf" />);

    await user.click(screen.getByRole('button', { name: 'Adicionar jogo' }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar jogo' }), 'had');
    const add = await screen.findByRole('button', { name: 'Adicionar Hades' }, { timeout: 3000 });
    expect(actions.searchGamesAction).toHaveBeenCalledWith('had');
    // Jogo que já está na estante mostra o status em selo e não tem botão.
    expect(screen.queryByRole('button', { name: 'Adicionar Celeste' })).toBeNull();
    expect(within(screen.getByRole('dialog')).getByText('Jogando')).toBeInTheDocument();

    await user.click(add);
    await user.click(screen.getByRole('radio', { name: /Jogando/ }));
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(actions.addGameAction).toHaveBeenCalledWith(7, 'jogando');
    expect(await screen.findByText('Hades entrou em Jogando.')).toBeInTheDocument();
  });

  it('busca com menos de 2 letras só mostra a dica e não chama o servidor', async () => {
    const user = userEvent.setup();
    render(<GameShelf columns={empty()} own title="Game Shelf" />);
    await user.click(screen.getByRole('button', { name: 'Adicionar jogo' }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar jogo' }), 'h');
    expect(screen.getByText('Digite pelo menos 2 letras.')).toBeInTheDocument();
    expect(actions.searchGamesAction).not.toHaveBeenCalled();
  });

  it('IGDB não configurado: mostra o aviso no lugar dos resultados', async () => {
    actions.searchGamesAction.mockResolvedValue({ ok: false, error: 'not-configured' });
    const user = userEvent.setup();
    render(<GameShelf columns={empty()} own title="Game Shelf" />);
    await user.click(screen.getByRole('button', { name: 'Adicionar jogo' }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar jogo' }), 'hades');
    expect(await screen.findByText('A busca de jogos ainda não está configurada neste ambiente.', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('jogo já na estante: o aviso diz em que coluna ele está', async () => {
    actions.searchGamesAction.mockResolvedValue({ ok: true, results: [found] });
    actions.addGameAction.mockResolvedValue({ ok: true, gameName: 'Hades', status: 'zerado', alreadyOnShelf: true });
    const user = userEvent.setup();
    render(<GameShelf columns={empty()} own title="Game Shelf" />);
    await user.click(screen.getByRole('button', { name: 'Adicionar jogo' }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar jogo' }), 'hades');
    await user.click(await screen.findByRole('button', { name: 'Adicionar Hades' }, { timeout: 3000 }));
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByText('Esse jogo já está na sua Game Shelf')).toBeInTheDocument();
    expect(screen.getByText('Hades está em Zerado.')).toBeInTheDocument();
  });
});
