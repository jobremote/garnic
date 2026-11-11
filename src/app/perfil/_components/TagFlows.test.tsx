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
  discardScreenshotAction: vi.fn(),
  viewEntryAction: vi.fn(),
  reportScreenshotAction: vi.fn(),
  createTagAction: vi.fn(),
  updateTagAction: vi.fn(),
  deleteTagAction: vi.fn(),
}));
vi.mock('../shelf-actions', () => actions);

const ZELDA = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Zelda', color: 'olive' as const };
const SOULS = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Souls', color: 'wine' as const };
const tagList = [
  { ...SOULS, gameCount: 1 },
  { ...ZELDA, gameCount: 2 },
];
const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const columns = (): ShelfData => ({
  'quero-jogar': [],
  parado: [],
  jogando: [
    { entryId: ID1, name: 'Elden Ring', detail: '2022', tags: [SOULS] },
    { entryId: ID2, name: 'Tears of the Kingdom', detail: '2023', tags: [ZELDA] },
  ],
  zerado: [],
});

type User = ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Game Shelf: tags nos cards e filtro', () => {
  it('mostra as tags de cada card, com a cor', () => {
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={tagList} uploadMode="local" userId="u1" />);
    expect(screen.getAllByText('Souls').some((node) => node.classList.contains('nds-tag--wine'))).toBe(true);
    expect(screen.getAllByText('Zelda').some((node) => node.classList.contains('nds-tag--olive'))).toBe(true);
  });

  it('filtra por uma tag por vez; o contador da coluna acompanha; "Todos os jogos" limpa', async () => {
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={tagList} uploadMode="local" userId="u1" />);
    const filter = screen.getByRole('combobox', { name: 'Filtrar por tag' });
    await user.selectOptions(filter, 'Zelda');

    const playing = screen.getByRole('region', { name: 'Jogando' });
    expect(within(playing).getByText('Tears of the Kingdom')).toBeInTheDocument();
    expect(within(playing).queryByText('Elden Ring')).toBeNull();
    expect(within(playing).getByText('1')).toBeInTheDocument();
    // Coluna sem jogo com a tag diz isso.
    expect(within(screen.getByRole('region', { name: 'Zerado' })).getByText('Nenhum jogo com essa tag.')).toBeInTheDocument();

    await user.selectOptions(filter, 'Todos os jogos');
    expect(within(playing).getByText('Elden Ring')).toBeInTheDocument();
  });

  it('sem tags, não há filtro; no perfil de outra pessoa o filtro existe mas não há "Gerenciar tags"', () => {
    const { rerender } = render(<GameShelf columns={columns()} own title="Game Shelf" tags={[]} uploadMode="local" userId="u1" />);
    expect(screen.queryByRole('combobox', { name: 'Filtrar por tag' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Gerenciar tags' })).toBeInTheDocument();
    rerender(<GameShelf columns={columns()} own={false} title="Game Shelf" tags={tagList} uploadMode="local" userId="u1" />);
    expect(screen.getByRole('combobox', { name: 'Filtrar por tag' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gerenciar tags' })).toBeNull();
  });
});

describe('Game Shelf: gerenciar tags', () => {
  const openManager = async (user: User) => {
    await user.click(screen.getByRole('button', { name: 'Gerenciar tags' }));
    return screen.findByRole('dialog', { name: 'Gerenciar tags' });
  };

  it('lista as tags com a quantidade de jogos', async () => {
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={tagList} uploadMode="local" userId="u1" />);
    const dialog = await openManager(user);
    expect(within(dialog).getByText('1 jogo')).toBeInTheDocument();
    expect(within(dialog).getByText('2 jogos')).toBeInTheDocument();
    expect(within(dialog).getByText('2 de 30 tags.')).toBeInTheDocument();
  });

  it('cria uma tag com nome e cor e passa a oferecê-la no filtro', async () => {
    actions.createTagAction.mockResolvedValue({ ok: true, tag: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Top da vida', color: 'sky', gameCount: 0 } });
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={tagList} uploadMode="local" userId="u1" />);
    await openManager(user);
    await user.click(screen.getByRole('button', { name: 'Nova tag' }));
    const form = await screen.findByRole('dialog', { name: 'Nova tag' });
    await user.type(within(form).getByRole('textbox', { name: 'Nome da tag' }), 'Top da vida');
    await user.click(within(form).getByRole('radio', { name: 'Céu' }));
    await user.click(within(form).getByRole('button', { name: 'Criar tag' }));

    expect(actions.createTagAction).toHaveBeenCalledWith('Top da vida', 'sky');
    expect(await screen.findByText('A tag Top da vida está pronta para usar.')).toBeInTheDocument();
    expect(within(screen.getByRole('combobox', { name: 'Filtrar por tag' })).getByRole('option', { name: 'Top da vida' })).toBeInTheDocument();
  });

  it('erro de nome vem do servidor e aparece no campo', async () => {
    actions.createTagAction.mockResolvedValue({ ok: false, error: 'invalid', errors: { name: 'Você já tem uma tag com esse nome.' } });
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={tagList} uploadMode="local" userId="u1" />);
    await openManager(user);
    await user.click(screen.getByRole('button', { name: 'Nova tag' }));
    const form = await screen.findByRole('dialog', { name: 'Nova tag' });
    await user.type(within(form).getByRole('textbox', { name: 'Nome da tag' }), 'Zelda');
    await user.click(within(form).getByRole('button', { name: 'Criar tag' }));
    expect(await within(form).findByText('Você já tem uma tag com esse nome.')).toBeInTheDocument();
  });

  it('excluir pede confirmação, avisa que os jogos ficam e tira a tag da lista', async () => {
    actions.deleteTagAction.mockResolvedValue({ ok: true, name: 'Zelda' });
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={tagList} uploadMode="local" userId="u1" />);
    const dialog = await openManager(user);
    await user.click(within(dialog).getByRole('button', { name: 'Editar tag: Zelda' }));
    const edit = await screen.findByRole('dialog', { name: 'Editar tag' });
    await user.click(within(edit).getByRole('button', { name: 'Excluir tag' }));
    const confirm = await screen.findByRole('dialog', { name: 'Excluir tag?' });
    expect(within(confirm).getByText(/Os jogos continuam na sua Game Shelf/)).toBeInTheDocument();
    expect(actions.deleteTagAction).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Excluir tag' }));
    expect(actions.deleteTagAction).toHaveBeenCalledWith(ZELDA.id);
    expect(await screen.findByText(/A tag Zelda foi excluída/)).toBeInTheDocument();
    // A tag some dos cards e do filtro na hora.
    expect(screen.queryByRole('option', { name: 'Zelda' })).toBeNull();
  });
});

describe('Game Shelf: tags na edição da entrada', () => {
  const entry = (tagIds: string[]) => ({
    entryId: ID1,
    status: 'jogando',
    platform: null,
    rating: null,
    review: null,
    reviewSpoiler: false,
    started: { month: null, year: null },
    ended: { month: null, year: null },
    playMinutes: null,
    tagIds,
    gameName: 'Elden Ring',
    year: '2022',
    platforms: [],
  });
  const openEdit = async (user: User) => {
    await user.click(screen.getByRole('button', { name: 'Ações de Elden Ring' }));
    await user.click(screen.getByRole('menuitem', { name: 'Editar entrada' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar entrada' });
    await within(dialog).findByText('Elden Ring'); // espera carregar
    return dialog;
  };

  it('adiciona e tira tags da entrada e envia a lista ao salvar', async () => {
    actions.openEntryAction.mockResolvedValue({ ok: true, entry: entry([SOULS.id]), timeToBeat: null });
    actions.saveEntryAction.mockResolvedValue({ ok: true, gameName: 'Elden Ring', status: 'jogando', statusChanged: false });
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={tagList} uploadMode="local" userId="u1" />);
    const dialog = await openEdit(user);

    await user.click(within(dialog).getByRole('button', { name: 'Adicionar a tag Zelda' }));
    await user.click(within(dialog).getByRole('button', { name: 'Remover: Souls' }));
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(actions.saveEntryAction).toHaveBeenCalledWith(ID1, expect.objectContaining({ tagIds: [ZELDA.id] }));
  });

  it('"+ Nova tag" cria a tag sem sair da edição e já a põe no jogo', async () => {
    actions.openEntryAction.mockResolvedValue({ ok: true, entry: entry([]), timeToBeat: null });
    actions.createTagAction.mockResolvedValue({ ok: true, tag: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Rejogar', color: 'rose', gameCount: 0 } });
    actions.saveEntryAction.mockResolvedValue({ ok: true, gameName: 'Elden Ring', status: 'jogando', statusChanged: false });
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={tagList} uploadMode="local" userId="u1" />);
    const dialog = await openEdit(user);

    await user.click(within(dialog).getByRole('button', { name: '+ Nova tag' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Nome da tag' }), 'Rejogar');
    await user.click(within(dialog).getByRole('radio', { name: 'Rosa' }));
    await user.click(within(dialog).getByRole('button', { name: 'Criar tag' }));
    expect(actions.createTagAction).toHaveBeenCalledWith('Rejogar', 'rose');
    expect(await within(dialog).findByRole('button', { name: 'Remover: Rejogar' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(actions.saveEntryAction).toHaveBeenCalledWith(ID1, expect.objectContaining({ tagIds: ['dddddddd-dddd-4ddd-8ddd-dddddddddddd'] }));
  });

  it('com 5 tags no jogo, as outras ficam desabilitadas e o limite é explicado', async () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ id: `0000000${i}-0000-4000-8000-000000000000`, name: `T${i}`, color: 'neutral' as const, gameCount: 1 }));
    actions.openEntryAction.mockResolvedValue({ ok: true, entry: entry(five.map((t) => t.id)), timeToBeat: null });
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={[...five, { ...ZELDA, gameCount: 0 }]} uploadMode="local" userId="u1" />);
    const dialog = await openEdit(user);
    expect(within(dialog).getByRole('button', { name: 'Adicionar a tag Zelda' })).toBeDisabled();
    expect(within(dialog).getByText('Até 5 tags por jogo.')).toBeInTheDocument();
  });
});
