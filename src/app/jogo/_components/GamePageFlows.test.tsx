// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameHeroActions } from './GameHeroActions';
import { GameScreenshots } from './GameScreenshots';

const shelf = vi.hoisted(() => ({ addGameAction: vi.fn(), reportScreenshotAction: vi.fn(), viewEntryAction: vi.fn() }));
vi.mock('@/app/perfil/shelf-actions', () => shelf);
const game = vi.hoisted(() => ({ loadMoreScreenshotsAction: vi.fn() }));
vi.mock('../actions', () => game);

const ENTRY = '11111111-1111-4111-8111-111111111111';
const GAME = '22222222-2222-4222-8222-222222222222';
const shot = (n: number, over: Record<string, unknown> = {}) => ({ entryId: `3333333${n}-3333-4333-8333-333333333333`, url: `/media/s${n}.png`, spoiler: false, username: `pessoa${n}`, own: false, ...over });

beforeEach(() => vi.clearAllMocks());

describe('ações do cabeçalho', () => {
  it('no Game Shelf: selo do status e Editar, que leva à edição no perfil', () => {
    render(<GameHeroActions igdbId={1} gameName="Celeste" username="leo" entry={{ entryId: ENTRY, status: 'zerado' }} />);
    expect(screen.getByText('Zerado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Editar' })).toHaveAttribute('href', `/perfil/leo?editar=${ENTRY}`);
    expect(screen.queryByRole('button', { name: 'Adicionar ao Game Shelf' })).toBeNull();
  });

  it('fora do Game Shelf: Adicionar pergunta a coluna e depois mostra o status', async () => {
    const user = userEvent.setup();
    shelf.addGameAction.mockResolvedValue({ ok: true, entryId: ENTRY, gameName: 'Celeste', status: 'jogando', alreadyOnShelf: false });
    render(<GameHeroActions igdbId={26226} gameName="Celeste" username="leo" entry={null} />);
    await user.click(screen.getByRole('button', { name: 'Adicionar ao Game Shelf' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: /Jogando/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }));
    expect(shelf.addGameAction).toHaveBeenCalledWith(26226, 'jogando');
    expect(await screen.findByText('Celeste entrou em Jogando.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Editar' })).toHaveAttribute('href', `/perfil/leo?editar=${ENTRY}`);
  });

  it('erro ao adicionar avisa e mantém o botão', async () => {
    const user = userEvent.setup();
    shelf.addGameAction.mockResolvedValue({ ok: false, error: 'unavailable' });
    render(<GameHeroActions igdbId={1} gameName="Celeste" username="leo" entry={null} />);
    await user.click(screen.getByRole('button', { name: 'Adicionar ao Game Shelf' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByText('Não deu para adicionar agora. Tente de novo.')).toBeInTheDocument();
  });
});

describe('screenshots da comunidade', () => {
  it('sem screenshots mostra a mensagem de vazio', () => {
    render(<GameScreenshots gameId={GAME} gameName="Celeste" initial={[]} next={null} />);
    expect(screen.getByText('Ninguém compartilhou screenshots deste jogo ainda.')).toBeInTheDocument();
  });

  it('spoiler fica escondido até mostrar; abrir mostra quem enviou e permite denunciar', async () => {
    const user = userEvent.setup();
    shelf.reportScreenshotAction.mockResolvedValue({ ok: true, alreadyReported: false });
    render(<GameScreenshots gameId={GAME} gameName="Celeste" initial={[shot(1), shot(2, { spoiler: true })]} next={null} />);
    expect(screen.getByText('Contém spoiler')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pessoa2/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Abrir imagem: Screenshot de Celeste enviada por @pessoa1' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: '@pessoa1' })).toHaveAttribute('href', '/perfil/pessoa1');
    await user.click(within(dialog).getByRole('button', { name: 'Denunciar' }));
    const report = await screen.findByRole('dialog', { name: 'Denunciar screenshot' });
    await user.selectOptions(within(report).getByRole('combobox'), 'spam');
    await user.click(within(report).getByRole('button', { name: 'Enviar denúncia' }));
    await waitFor(() => expect(shelf.reportScreenshotAction).toHaveBeenCalledWith(shot(1).entryId, 'spam', ''));
  });

  it('a própria screenshot não tem Denunciar', async () => {
    const user = userEvent.setup();
    render(<GameScreenshots gameId={GAME} gameName="Celeste" initial={[shot(1, { own: true })]} next={null} />);
    await user.click(screen.getByRole('button', { name: /Abrir imagem/ }));
    expect(within(await screen.findByRole('dialog')).queryByRole('button', { name: 'Denunciar' })).toBeNull();
  });

  it('Ver mais carrega a próxima página', async () => {
    const user = userEvent.setup();
    game.loadMoreScreenshotsAction.mockResolvedValue({ ok: true, screenshots: [shot(7)], next: null });
    render(<GameScreenshots gameId={GAME} gameName="Celeste" initial={[shot(1)]} next={6} />);
    await user.click(screen.getByRole('button', { name: 'Ver mais screenshots' }));
    expect(game.loadMoreScreenshotsAction).toHaveBeenCalledWith(GAME, 6);
    expect(await screen.findByRole('button', { name: /pessoa7/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver mais screenshots' })).toBeNull();
  });
});
