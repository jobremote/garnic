// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostView } from '@/lib/feed/view';
import { Composer } from './Composer';
import { FeedList } from './FeedList';
import { FollowButton } from './FollowButton';
import { PostCard } from './PostCard';

const actions = vi.hoisted(() => ({
  createPostAction: vi.fn(),
  updatePostAction: vi.fn(),
  deletePostAction: vi.fn(),
  followAction: vi.fn(),
  loadMorePostsAction: vi.fn(),
}));
vi.mock('../actions', () => actions);

const shelfActions = vi.hoisted(() => ({ searchGamesAction: vi.fn() }));
vi.mock('@/app/perfil/shelf-actions', () => shelfActions);

const upload = vi.hoisted(() => ({ uploadImage: vi.fn() }));
vi.mock('@/app/perfil/_components/upload-image', () => upload);

const post = (over: Partial<PostView> = {}): PostView => ({
  id: 'p1',
  authorName: 'Marina Rocha',
  username: 'marina',
  time: 'há 2 h',
  edited: false,
  body: 'Finalmente zerei.',
  spoiler: false,
  own: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('post no feed', () => {
  it('mostra autor com link para o perfil, @usuário, tempo e texto', () => {
    render(<PostCard post={post()} viewerId="v" uploadMode="local" />);
    expect(screen.getByRole('link', { name: 'Marina Rocha' })).toHaveAttribute('href', '/perfil/marina');
    expect(screen.getByRole('link', { name: '@marina' })).toHaveAttribute('href', '/perfil/marina');
    expect(screen.getByText(/há 2 h/)).toBeInTheDocument();
    expect(screen.getByText('Finalmente zerei.')).toBeInTheDocument();
  });

  it('mostra "editado" só nos posts editados', () => {
    const { unmount } = render(<PostCard post={post()} viewerId="v" uploadMode="local" />);
    expect(screen.queryByText(/editado/)).toBeNull();
    unmount();
    render(<PostCard post={post({ edited: true })} viewerId="v" uploadMode="local" />);
    expect(screen.getByText(/· editado/)).toBeInTheDocument();
  });

  it('mostra o jogo marcado e, se o jogo está no Game Shelf de quem postou, o status', () => {
    const { unmount } = render(<PostCard post={post({ game: { name: 'Hollow Knight' } })} viewerId="v" uploadMode="local" />);
    expect(screen.getByText('Hollow Knight')).toBeInTheDocument();
    expect(screen.queryByText('Zerado')).toBeNull();
    unmount();
    render(<PostCard post={post({ game: { name: 'Hollow Knight' }, status: 'zerado' })} viewerId="v" uploadMode="local" />);
    expect(screen.getByText('Zerado')).toBeInTheDocument();
  });

  it('com spoiler, esconde o texto atrás de um aviso com botão Mostrar', async () => {
    const user = userEvent.setup();
    render(<PostCard post={post({ spoiler: true })} viewerId="v" uploadMode="local" />);
    expect(screen.getByText('Contém spoiler')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mostrar' }));
    expect(screen.queryByText('Contém spoiler')).toBeNull();
    expect(screen.getByText('Finalmente zerei.')).toBeInTheDocument();
  });

  it('só quem postou tem o menu de editar e excluir', () => {
    const { unmount } = render(<PostCard post={post()} viewerId="v" uploadMode="local" />);
    expect(screen.queryByRole('button', { name: 'Mais opções' })).toBeNull();
    unmount();
    render(<PostCard post={post({ own: true, edit: { imageRef: null, gameIgdbId: null } })} viewerId="v" uploadMode="local" />);
    expect(screen.getByRole('button', { name: 'Mais opções' })).toBeInTheDocument();
  });

  it('excluir pede confirmação e só chama o servidor depois dela', async () => {
    const user = userEvent.setup();
    actions.deletePostAction.mockResolvedValue({ ok: true });
    render(<PostCard post={post({ own: true, edit: { imageRef: null, gameIgdbId: null } })} viewerId="v" uploadMode="local" />);
    await user.click(screen.getByRole('button', { name: 'Mais opções' }));
    await user.click(screen.getByRole('menuitem', { name: 'Excluir' }));
    const dialog = await screen.findByRole('dialog', { name: 'Excluir este post?' });
    expect(actions.deletePostAction).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    expect(actions.deletePostAction).toHaveBeenCalledWith('p1');
  });

  it('editar abre a janela com o texto atual e salva só o que mudou', async () => {
    const user = userEvent.setup();
    actions.updatePostAction.mockResolvedValue({ ok: true });
    render(<PostCard post={post({ own: true, edit: { imageRef: null, gameIgdbId: null } })} viewerId="v" uploadMode="local" />);
    await user.click(screen.getByRole('button', { name: 'Mais opções' }));
    await user.click(screen.getByRole('menuitem', { name: 'Editar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar post' });
    const field = within(dialog).getByRole('textbox', { name: 'Escrever um post' });
    expect(field).toHaveValue('Finalmente zerei.');
    await user.type(field, ' Muito bom.');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    // Sem `imageRef` e sem `igdbId`: o servidor mantém a imagem e o jogo como estão.
    expect(actions.updatePostAction).toHaveBeenCalledWith('p1', { body: 'Finalmente zerei. Muito bom.', spoiler: false });
  });

  it('a janela de edição mostra o erro do servidor e continua aberta', async () => {
    const user = userEvent.setup();
    actions.updatePostAction.mockResolvedValue({ ok: false, error: 'not-found' });
    render(<PostCard post={post({ own: true, edit: { imageRef: null, gameIgdbId: null } })} viewerId="v" uploadMode="local" />);
    await user.click(screen.getByRole('button', { name: 'Mais opções' }));
    await user.click(screen.getByRole('menuitem', { name: 'Editar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar post' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Escrever um post' }), '!');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Não encontramos esse post');
  });
});

describe('criar post', () => {
  const composer = () => <Composer userId="u1" name="Ana Souza" uploadMode="local" />;
  const publish = () => screen.getByRole('button', { name: 'Publicar' });

  it('Publicar só habilita com texto ou imagem; marcar o jogo sozinho não basta', async () => {
    const user = userEvent.setup();
    shelfActions.searchGamesAction.mockResolvedValue({ ok: true, results: [{ igdbId: 7, name: 'Celeste', detail: '2018 · PC' }] });
    render(composer());
    expect(publish()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Marcar jogo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Marcar um jogo' });
    await user.type(within(dialog).getByRole('searchbox', { name: 'Buscar jogo' }), 'cel');
    await user.click(await within(dialog).findByRole('button', { name: 'Marcar Celeste' }, { timeout: 3000 }));
    expect(screen.getByText('Celeste')).toBeInTheDocument();
    expect(publish()).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: 'Escrever um post' }), 'Joguei hoje');
    expect(publish()).toBeEnabled();
  });

  it('publica com texto, jogo e spoiler e limpa o campo', async () => {
    const user = userEvent.setup();
    actions.createPostAction.mockResolvedValue({ ok: true });
    shelfActions.searchGamesAction.mockResolvedValue({ ok: true, results: [{ igdbId: 7, name: 'Celeste', detail: '2018 · PC' }] });
    render(composer());
    const field = screen.getByRole('textbox', { name: 'Escrever um post' });
    await user.type(field, 'Que jogo!');
    await user.click(screen.getByRole('button', { name: 'Marcar jogo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Marcar um jogo' });
    await user.type(within(dialog).getByRole('searchbox', { name: 'Buscar jogo' }), 'cel');
    await user.click(await within(dialog).findByRole('button', { name: 'Marcar Celeste' }, { timeout: 3000 }));
    await user.click(screen.getByRole('switch', { name: 'Contém spoiler' }));
    await user.click(publish());
    expect(actions.createPostAction).toHaveBeenCalledWith({ body: 'Que jogo!', imageRef: null, spoiler: true, igdbId: 7 });
    await waitFor(() => expect(field).toHaveValue(''));
    expect(await screen.findByText('Post publicado.')).toBeInTheDocument();
    expect(screen.queryByText('Celeste')).toBeNull();
  });

  it('só com imagem também publica (texto ou imagem)', async () => {
    const user = userEvent.setup();
    actions.createPostAction.mockResolvedValue({ ok: true });
    upload.uploadImage.mockResolvedValue('posts/abc.png');
    const { container } = render(composer());
    const file = new File(['x'], 'foto.png', { type: 'image/png' });
    await user.upload(container.querySelector('input[type=file]') as HTMLInputElement, file);
    await waitFor(() => expect(publish()).toBeEnabled());
    expect(upload.uploadImage).toHaveBeenCalledWith('local', 'post', file, 'u1');
    await user.click(publish());
    expect(actions.createPostAction).toHaveBeenCalledWith({ body: '', imageRef: 'posts/abc.png', spoiler: false, igdbId: null });
  });

  it('recusa arquivo que não é imagem e arquivo pesado, sem enviar', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { container } = render(composer());
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'nota.txt', { type: 'text/plain' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('JPG, PNG ou WebP');
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'grande.png', { type: 'image/png' });
    await user.upload(input, big);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('passou de 5 MB'));
    expect(upload.uploadImage).not.toHaveBeenCalled();
  });

  it('mostra o erro do servidor e mantém o que a pessoa escreveu', async () => {
    const user = userEvent.setup();
    actions.createPostAction.mockResolvedValue({ ok: false, error: 'game-unavailable' });
    render(composer());
    const field = screen.getByRole('textbox', { name: 'Escrever um post' });
    await user.type(field, 'Meu texto');
    await user.click(publish());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(field).toHaveValue('Meu texto');
  });

  it('o contador mostra o limite de 1.500 caracteres', () => {
    render(composer());
    expect(screen.getByText('0/1500')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Escrever um post' })).toHaveAttribute('maxlength', '1500');
  });
});

describe('seguir', () => {
  it('segue na hora e volta atrás se o servidor falhar', async () => {
    const user = userEvent.setup();
    actions.followAction.mockResolvedValueOnce({ ok: false });
    render(<FollowButton userId="u2" name="Marina" initialFollowing={false} />);
    await user.click(screen.getByRole('button', { name: 'Seguir: Marina' }));
    expect(actions.followAction).toHaveBeenCalledWith('u2', true);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seguir: Marina' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('alterna entre Seguir e Seguindo', async () => {
    const user = userEvent.setup();
    actions.followAction.mockResolvedValue({ ok: true });
    render(<FollowButton userId="u2" name="Marina" initialFollowing={false} />);
    await user.click(screen.getByRole('button', { name: 'Seguir: Marina' }));
    const following = await screen.findByRole('button', { name: 'Deixar de seguir: Marina' });
    expect(following).toHaveTextContent('Seguindo');
    expect(following).toHaveAttribute('aria-pressed', 'true');
    await user.click(following);
    expect(actions.followAction).toHaveBeenLastCalledWith('u2', false);
    expect(await screen.findByRole('button', { name: 'Seguir: Marina' })).toBeInTheDocument();
  });
});

describe('lista do feed', () => {
  const scope = { kind: 'following' } as const;

  it('"Ver mais" acrescenta a próxima página sem repetir posts e some no fim', async () => {
    const user = userEvent.setup();
    actions.loadMorePostsAction.mockResolvedValue({ ok: true, posts: [post({ id: 'p2', body: 'Mais antigo' }), post({ id: 'p1' })], next: null });
    render(<FeedList initial={[post()]} next="cursor-1" scope={scope} viewerId="v" uploadMode="local" label="Seguindo" />);
    await user.click(screen.getByRole('button', { name: 'Ver mais' }));
    expect(actions.loadMorePostsAction).toHaveBeenCalledWith(scope, 'cursor-1');
    expect(await screen.findByText('Mais antigo')).toBeInTheDocument();
    expect(screen.getAllByText('Finalmente zerei.')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Ver mais' })).toBeNull();
  });

  it('sem próxima página não mostra "Ver mais"; com falha avisa e permite tentar de novo', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<FeedList initial={[post()]} next={null} scope={scope} viewerId="v" uploadMode="local" label="Seguindo" />);
    expect(screen.queryByRole('button', { name: 'Ver mais' })).toBeNull();
    unmount();
    actions.loadMorePostsAction.mockResolvedValue({ ok: false });
    render(<FeedList initial={[post()]} next="c" scope={scope} viewerId="v" uploadMode="local" label="Seguindo" />);
    await user.click(screen.getByRole('button', { name: 'Ver mais' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar mais posts');
    expect(screen.getByRole('button', { name: 'Ver mais' })).toBeEnabled();
  });
});
