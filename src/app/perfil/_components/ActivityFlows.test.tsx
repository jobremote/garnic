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
}));
vi.mock('../shelf-actions', () => actions);

const activityActions = vi.hoisted(() => ({
  previewActivityAction: vi.fn(),
  shareActivityAction: vi.fn(),
  recentActivitiesAction: vi.fn(),
}));
vi.mock('../activity-actions', () => activityActions);

const ID = '11111111-1111-4111-8111-111111111111';
const ACTIVITY = '22222222-2222-4222-8222-222222222222';
const empty = (): ShelfData => ({ 'quero-jogar': [], parado: [], jogando: [], zerado: [] });
const columns = (): ShelfData => ({ ...empty(), 'quero-jogar': [{ entryId: ID, name: 'Celeste', detail: '2018', tags: [] }] });
const author = { name: 'Ana Teste', username: 'ana.teste' };

const preview = (over: Record<string, unknown> = {}) => ({
  ok: true,
  spoiler: false,
  activity: { phrase: 'Começou a jogar', gameName: 'Celeste', meta: '2018', status: 'jogando', ...over },
});

beforeEach(() => {
  vi.clearAllMocks();
  activityActions.recentActivitiesAction.mockResolvedValue({ ok: true, rows: [] });
});

async function moveTo(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('button', { name: 'Ações de Celeste' }));
  await user.click(screen.getByRole('menuitem', { name: `Mover para ${label}` }));
}

describe('Game Shelf: compartilhar atividade', () => {
  it('depois de mudar de coluna, o aviso oferece compartilhar; nada é publicado sem o clique', async () => {
    actions.moveGameAction.mockResolvedValue({ ok: true, gameName: 'Celeste', status: 'jogando', changed: true, activity: { id: ACTIVITY, kind: 'started' } });
    activityActions.previewActivityAction.mockResolvedValue(preview());
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={[]} uploadMode="local" userId="u1" author={author} />);
    await moveTo(user, 'Jogando');

    const toast = await screen.findByText(/Quer compartilhar isso no seu feed\?/);
    expect(activityActions.shareActivityAction).not.toHaveBeenCalled();
    await user.click(within(toast.closest('[role="status"]') as HTMLElement).getByRole('button', { name: 'Compartilhar' }));

    const dialog = await screen.findByRole('dialog', { name: 'Compartilhar atividade' });
    expect(await within(dialog).findByText('Começou a jogar')).toBeInTheDocument(); // prévia
    expect(within(dialog).getByText('Celeste')).toBeInTheDocument();
    expect(activityActions.shareActivityAction).not.toHaveBeenCalled();
  });

  it('compartilha com o texto opcional e avisa com "Ver post"', async () => {
    actions.moveGameAction.mockResolvedValue({ ok: true, gameName: 'Celeste', status: 'jogando', changed: true, activity: { id: ACTIVITY, kind: 'started' } });
    activityActions.previewActivityAction.mockResolvedValue(preview());
    activityActions.shareActivityAction.mockResolvedValue({ ok: true, postId: 'post-1' });
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={[]} uploadMode="local" userId="u1" author={author} />);
    await moveTo(user, 'Jogando');
    await user.click(within((await screen.findByText(/Quer compartilhar/)).closest('[role="status"]') as HTMLElement).getByRole('button', { name: 'Compartilhar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compartilhar atividade' });
    await within(dialog).findByText('Começou a jogar');
    await user.type(within(dialog).getByRole('textbox', { name: 'Texto (opcional)' }), 'Bora!');
    await user.click(within(dialog).getByRole('button', { name: 'Compartilhar' }));

    expect(activityActions.shareActivityAction).toHaveBeenCalledWith(ACTIVITY, 'Bora!');
    expect(await screen.findByText('Compartilhado no seu feed.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver post' })).toHaveAttribute('href', '/post/post-1');
  });

  it('cancelar a prévia não publica nada', async () => {
    actions.moveGameAction.mockResolvedValue({ ok: true, gameName: 'Celeste', status: 'jogando', changed: true, activity: { id: ACTIVITY, kind: 'started' } });
    activityActions.previewActivityAction.mockResolvedValue(preview());
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={[]} uploadMode="local" userId="u1" author={author} />);
    await moveTo(user, 'Jogando');
    await user.click(within((await screen.findByText(/Quer compartilhar/)).closest('[role="status"]') as HTMLElement).getByRole('button', { name: 'Compartilhar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compartilhar atividade' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(activityActions.shareActivityAction).not.toHaveBeenCalled();
  });

  it('erro ao compartilhar aparece na janela, que continua aberta', async () => {
    actions.moveGameAction.mockResolvedValue({ ok: true, gameName: 'Celeste', status: 'jogando', changed: true, activity: { id: ACTIVITY, kind: 'started' } });
    activityActions.previewActivityAction.mockResolvedValue(preview());
    activityActions.shareActivityAction.mockResolvedValue({ ok: false, error: 'generic' });
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={[]} uploadMode="local" userId="u1" author={author} />);
    await moveTo(user, 'Jogando');
    await user.click(within((await screen.findByText(/Quer compartilhar/)).closest('[role="status"]') as HTMLElement).getByRole('button', { name: 'Compartilhar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compartilhar atividade' });
    await within(dialog).findByText('Começou a jogar');
    await user.click(within(dialog).getByRole('button', { name: 'Compartilhar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Não foi possível compartilhar');
  });

  it('ao zerar, a oferta espera o pop-up do Zerado e aparece quando ele fecha', async () => {
    actions.moveGameAction.mockResolvedValue({ ok: true, gameName: 'Celeste', status: 'zerado', changed: true, activity: { id: ACTIVITY, kind: 'finished' } });
    actions.openEntryAction.mockResolvedValue({
      ok: true,
      timeToBeat: null,
      entry: { entryId: ID, status: 'zerado', platform: null, rating: null, review: null, reviewSpoiler: false, started: { month: null, year: null }, ended: { month: null, year: null }, playMinutes: null, tagIds: [], gameName: 'Celeste', year: '2018', platforms: [], screenshotSpoiler: false },
    });
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={[]} uploadMode="local" userId="u1" author={author} />);
    await moveTo(user, 'Zerado');
    const popup = await screen.findByRole('dialog', { name: 'Jogo zerado!' });
    expect(screen.queryByText(/Quer compartilhar/)).toBeNull();
    await user.click(await within(popup).findByRole('button', { name: 'Agora não' }));
    expect(await screen.findByText(/Quer compartilhar/)).toBeInTheDocument();
  });

  it('salvar nota e tempo no pop-up do Zerado oferece o mesmo "Zerou", já completo', async () => {
    actions.moveGameAction.mockResolvedValue({ ok: true, gameName: 'Celeste', status: 'zerado', changed: true, activity: { id: ACTIVITY, kind: 'finished' } });
    actions.openEntryAction.mockResolvedValue({
      ok: true,
      timeToBeat: null,
      entry: { entryId: ID, status: 'zerado', platform: null, rating: null, review: null, reviewSpoiler: false, started: { month: null, year: null }, ended: { month: null, year: null }, playMinutes: null, tagIds: [], gameName: 'Celeste', year: '2018', platforms: [], screenshotSpoiler: false },
    });
    actions.saveEntryAction.mockResolvedValue({ ok: true, gameName: 'Celeste', status: 'zerado', statusChanged: false, activities: [{ id: ACTIVITY, kind: 'finished' }] });
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={[]} uploadMode="local" userId="u1" author={author} />);
    await moveTo(user, 'Zerado');
    const popup = await screen.findByRole('dialog', { name: 'Jogo zerado!' });
    await user.click(await within(popup).findByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText(/Quer compartilhar/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Compartilhar' })).toHaveLength(1);
  });
});

describe('Game Shelf: atividade recente da entrada', () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    actions.openEntryAction.mockResolvedValue({
      ok: true,
      timeToBeat: null,
      entry: { entryId: ID, status: 'quero-jogar', platform: null, rating: null, review: null, reviewSpoiler: false, started: { month: null, year: null }, ended: { month: null, year: null }, playMinutes: null, tagIds: [], gameName: 'Celeste', year: '2018', platforms: [], screenshotSpoiler: false },
    });
    await user.click(screen.getByRole('button', { name: 'Ações de Celeste' }));
    await user.click(screen.getByRole('menuitem', { name: /Editar/ }));
    return screen.findByRole('dialog', { name: /Editar entrada/ });
  };

  it('lista as atividades: a não compartilhada tem o botão; a compartilhada vira "Compartilhado" e leva ao post', async () => {
    activityActions.recentActivitiesAction.mockResolvedValue({
      ok: true,
      rows: [
        { id: 'a1', phrase: 'Zerou', detail: '38 h · Nota 5 de 5', time: 'há 1 h', postId: null },
        { id: 'a2', phrase: 'Começou a jogar', time: 'há 3 d', postId: 'post-9' },
      ],
    });
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={[]} uploadMode="local" userId="u1" author={author} />);
    const dialog = await open(user);
    const section = await within(dialog).findByRole('region', { name: 'Atividade recente' });
    expect(within(section).getByText('Zerou')).toBeInTheDocument();
    expect(within(section).getByText('38 h · Nota 5 de 5 · há 1 h')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Compartilhado' })).toHaveAttribute('href', '/post/post-9');
    expect(within(section).getAllByRole('button', { name: 'Compartilhar' })).toHaveLength(1);
  });

  it('clicar em Compartilhar abre a prévia dessa atividade', async () => {
    activityActions.recentActivitiesAction.mockResolvedValue({ ok: true, rows: [{ id: ACTIVITY, phrase: 'Zerou', time: 'há 1 h', postId: null }] });
    activityActions.previewActivityAction.mockResolvedValue(preview({ phrase: 'Zerou', status: 'zerado' }));
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={[]} uploadMode="local" userId="u1" author={author} />);
    const dialog = await open(user);
    await user.click(await within(dialog).findByRole('button', { name: 'Compartilhar' }));
    expect(await screen.findByRole('dialog', { name: 'Compartilhar atividade' })).toBeInTheDocument();
    expect(activityActions.previewActivityAction).toHaveBeenCalledWith(ACTIVITY);
  });

  it('sem atividade, mostra a mensagem de lista vazia', async () => {
    const user = userEvent.setup();
    render(<GameShelf columns={columns()} own title="Game Shelf" tags={[]} uploadMode="local" userId="u1" author={author} />);
    const dialog = await open(user);
    expect(await within(dialog).findByText('Nenhuma atividade ainda.')).toBeInTheDocument();
  });
});
