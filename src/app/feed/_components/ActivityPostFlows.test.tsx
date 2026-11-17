// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostView } from '@/lib/feed/view';
import { PostCard } from './PostCard';

vi.mock('../actions', () => ({ deletePostAction: vi.fn(), updatePostAction: vi.fn() }));
vi.mock('../comment-actions', () => ({ setLikeAction: vi.fn() }));
vi.mock('../report-actions', () => ({ reportAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/app/perfil/shelf-actions', () => ({ searchGamesAction: vi.fn() }));
vi.mock('@/app/perfil/_components/upload-image', () => ({ uploadImage: vi.fn() }));

const activityPost = (over: Partial<PostView> = {}, activity: Partial<NonNullable<PostView['activity']>> = {}): PostView => ({
  id: 'p1',
  authorName: 'Marina Rocha',
  username: 'marina',
  time: 'há 2 h',
  edited: false,
  body: '',
  spoiler: false,
  games: [],
  likeCount: 3,
  liked: false,
  commentCount: 1,
  own: false,
  activity: { phrase: 'Zerou', gameName: 'Elden Ring', meta: '2022 · PC (Windows)', detail: '38 h · Nota 5 de 5', status: 'zerado', ...activity },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('post de atividade no feed', () => {
  it('mostra a frase, o card do jogo com selo de status e o que a pessoa informou (tempo e nota)', () => {
    render(<PostCard post={activityPost()} viewerId="v" uploadMode="local" />);
    expect(screen.getByRole('link', { name: 'Marina Rocha' })).toHaveAttribute('href', '/perfil/marina');
    expect(screen.getByText('Zerou')).toBeInTheDocument();
    expect(screen.getByText('Elden Ring')).toBeInTheDocument();
    expect(screen.getByText('2022 · PC (Windows)')).toBeInTheDocument();
    expect(screen.getByText('38 h · Nota 5 de 5')).toBeInTheDocument();
    expect(screen.getByText('Zerado')).toBeInTheDocument();
  });

  it('sem tempo nem nota, a linha de destaque não aparece', () => {
    render(<PostCard post={activityPost({}, { detail: undefined })} viewerId="v" uploadMode="local" />);
    expect(screen.queryByText(/Nota/)).toBeNull();
  });

  it('mostra o texto opcional da pessoa', () => {
    render(<PostCard post={activityPost({ body: 'Melhor jogo do ano.' })} viewerId="v" uploadMode="local" />);
    expect(screen.getByText('Melhor jogo do ano.')).toBeInTheDocument();
  });

  it('review mostra o trecho; screenshot mostra a imagem', () => {
    const { unmount } = render(<PostCard post={activityPost({}, { phrase: 'Escreveu uma review', excerpt: 'Um mundo aberto que respeita o seu tempo.' })} viewerId="v" uploadMode="local" />);
    expect(screen.getByText('Um mundo aberto que respeita o seu tempo.')).toBeInTheDocument();
    unmount();
    render(<PostCard post={activityPost({}, { phrase: 'Subiu uma screenshot', imageUrl: '/media/x.png' })} viewerId="v" uploadMode="local" />);
    expect(screen.getByRole('img', { name: 'Screenshot do jogo' })).toHaveAttribute('src', '/media/x.png');
  });

  it('com spoiler, o trecho da review fica atrás do aviso e a frase e o jogo seguem visíveis', () => {
    render(<PostCard post={activityPost({ spoiler: true }, { phrase: 'Escreveu uma review', excerpt: 'O vilão morre no final.' })} viewerId="v" uploadMode="local" />);
    expect(screen.getByText('Escreveu uma review')).toBeVisible();
    expect(screen.getByText('Elden Ring')).toBeVisible();
    expect(screen.getByRole('button', { name: /Mostrar/ })).toBeInTheDocument();
  });

  it('curtir e comentar continuam disponíveis, com os contadores', () => {
    render(<PostCard post={activityPost()} viewerId="v" uploadMode="local" />);
    expect(screen.getByRole('button', { name: 'Curtir' })).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comentar' })).toBeInTheDocument();
  });

  it('quem compartilhou só exclui (não edita); os outros só denunciam', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<PostCard post={activityPost({ own: true })} viewerId="marina" uploadMode="local" />);
    await user.click(screen.getByRole('button', { name: 'Mais opções' }));
    expect(screen.getByRole('menuitem', { name: 'Excluir' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Editar' })).toBeNull();
    unmount();
    render(<PostCard post={activityPost()} viewerId="v" uploadMode="local" />);
    await user.click(screen.getByRole('button', { name: 'Mais opções' }));
    expect(screen.getByRole('menuitem', { name: 'Denunciar' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Excluir' })).toBeNull();
  });
});
