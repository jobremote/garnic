// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommentView } from '@/lib/feed/comment-view';
import { CommentThread } from './CommentThread';

const actions = vi.hoisted(() => ({
  createCommentAction: vi.fn(),
  editCommentAction: vi.fn(),
  deleteCommentAction: vi.fn(),
  hideCommentAction: vi.fn(),
  loadCommentsAction: vi.fn(),
  setLikeAction: vi.fn(),
}));
vi.mock('../comment-actions', () => actions);

const reportActions = vi.hoisted(() => ({ reportAction: vi.fn() }));
vi.mock('../report-actions', () => reportActions);

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

const comment = (over: Partial<CommentView> = {}): CommentView => ({
  id: 'c1',
  authorName: 'Rafael Lima',
  username: 'rafa',
  time: 'há 1 h',
  edited: false,
  status: 'default',
  body: 'Boa dica!',
  likeCount: 0,
  liked: false,
  own: false,
  canModerate: false,
  replies: [],
  ...over,
});

const thread = (comments: CommentView[], next: string | null = null, total = comments.length) => (
  <CommentThread postId="p1" initial={comments} next={next} total={total} />
);

beforeEach(() => {
  vi.clearAllMocks();
  actions.loadCommentsAction.mockResolvedValue({ ok: true, comments: [], next: null });
});

describe('comentários da página do post', () => {
  it('mostra o título com o total, o campo e a lista; sem comentários, convida a comentar', () => {
    const { unmount } = render(thread([comment()], null, 1));
    expect(screen.getByRole('heading', { name: 'Comentários · 1' })).toBeInTheDocument();
    expect(screen.getByLabelText('Escrever um comentário')).toBeInTheDocument();
    expect(screen.getByText('Boa dica!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rafael Lima' })).toHaveAttribute('href', '/perfil/rafa');
    unmount();
    render(thread([], null, 0));
    expect(screen.getByText(/Ainda não há comentários/)).toBeInTheDocument();
  });

  it('Comentar só habilita com texto, e o texto não passa de 500 caracteres', async () => {
    const user = userEvent.setup();
    render(thread([]));
    const publish = screen.getByRole('button', { name: 'Comentar' });
    expect(publish).toBeDisabled();
    await user.type(screen.getByLabelText('Escrever um comentário'), 'Oi');
    expect(publish).toBeEnabled();
    expect(screen.getByText('2/500')).toBeInTheDocument();
  });

  it('publica, limpa o campo e recarrega a lista e os contadores', async () => {
    const user = userEvent.setup();
    actions.createCommentAction.mockResolvedValue({ ok: true });
    actions.loadCommentsAction.mockResolvedValue({ ok: true, comments: [comment({ id: 'c2', body: 'Novo' })], next: null });
    render(thread([]));
    await user.type(screen.getByLabelText('Escrever um comentário'), 'Novo');
    await user.click(screen.getByRole('button', { name: 'Comentar' }));
    await waitFor(() => expect(screen.getByText('Novo', { selector: 'p' })).toBeInTheDocument());
    expect(actions.createCommentAction).toHaveBeenCalledWith('p1', 'Novo');
    expect(screen.getByLabelText('Escrever um comentário')).toHaveValue('');
    expect(navigation.refresh).toHaveBeenCalled();
  });

  it('mostra o erro do servidor e mantém o texto', async () => {
    const user = userEvent.setup();
    actions.createCommentAction.mockResolvedValue({ ok: false, error: 'not-found' });
    render(thread([]));
    await user.type(screen.getByLabelText('Escrever um comentário'), 'Oi');
    await user.click(screen.getByRole('button', { name: 'Comentar' }));
    expect(await screen.findByText(/Não encontramos esse comentário/)).toBeInTheDocument();
    expect(screen.getByLabelText('Escrever um comentário')).toHaveValue('Oi');
  });

  it('só o comentário de 1º nível tem "Responder"; a resposta fica recuada e responde ao comentário', async () => {
    const user = userEvent.setup();
    actions.createCommentAction.mockResolvedValue({ ok: true });
    render(thread([comment({ replies: [comment({ id: 'r1', body: 'Resposta', authorName: 'Ana' })] })]));
    expect(screen.getAllByRole('button', { name: 'Responder' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Responder' }));
    await user.type(screen.getByLabelText('Escrever uma resposta'), 'Concordo');
    await user.click(screen.getAllByRole('button', { name: 'Responder' }).at(-1)!);
    await waitFor(() => expect(actions.createCommentAction).toHaveBeenCalledWith('p1', 'Concordo', 'c1'));
  });

  it('comentário oculto mostra só o aviso, sem texto nem curtir', () => {
    render(thread([comment({ status: 'hidden', body: null })]));
    expect(screen.getByText('Comentário oculto pelo autor do post.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Curtir' })).toBeNull();
  });

  it('excluído mostra "Comentário excluído." e as respostas continuam', () => {
    render(thread([comment({ status: 'deleted', body: null, replies: [comment({ id: 'r1', body: 'Ficou a resposta' })] })]));
    expect(screen.getByText('Comentário excluído.')).toBeInTheDocument();
    expect(screen.getByText('Ficou a resposta')).toBeInTheDocument();
  });

  it('o dono do post oculta pelo menu e mostra de novo pelo botão', async () => {
    const user = userEvent.setup();
    actions.hideCommentAction.mockResolvedValue({ ok: true });
    const { unmount } = render(thread([comment({ canModerate: true })]));
    await user.click(screen.getByRole('button', { name: 'Mais opções do comentário' }));
    await user.click(screen.getByRole('menuitem', { name: 'Ocultar' }));
    await waitFor(() => expect(actions.hideCommentAction).toHaveBeenCalledWith('c1', true));
    unmount();

    render(thread([comment({ canModerate: true, status: 'hidden-owner' })]));
    expect(screen.getByText(/Oculto para os outros leitores/)).toBeInTheDocument();
    expect(screen.getByText('Boa dica!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mostrar de novo' }));
    await waitFor(() => expect(actions.hideCommentAction).toHaveBeenLastCalledWith('c1', false));
  });

  it('o autor do comentário oculto lê o texto, mas não tem "Mostrar de novo" nem "Ocultar"', async () => {
    const user = userEvent.setup();
    render(thread([comment({ own: true, status: 'hidden-owner' })]));
    expect(screen.getByText('Boa dica!')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mostrar de novo' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Mais opções do comentário' }));
    expect(screen.queryByRole('menuitem', { name: 'Ocultar' })).toBeNull();
  });

  it('quem não é autor nem dono do post só tem Denunciar no menu', async () => {
    const user = userEvent.setup();
    render(thread([comment()]));
    await user.click(screen.getByRole('button', { name: 'Mais opções do comentário' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Denunciar']);
  });

  it('o autor edita pelo menu e salva o texto novo', async () => {
    const user = userEvent.setup();
    actions.editCommentAction.mockResolvedValue({ ok: true });
    render(thread([comment({ own: true })]));
    await user.click(screen.getByRole('button', { name: 'Mais opções do comentário' }));
    await user.click(screen.getByRole('menuitem', { name: 'Editar' }));
    const field = screen.getByLabelText('Editar comentário');
    expect(field).toHaveValue('Boa dica!');
    await user.clear(field);
    await user.type(field, 'Dica melhor');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(actions.editCommentAction).toHaveBeenCalledWith('c1', 'Dica melhor'));
  });

  it('excluir pede confirmação e só chama o servidor depois dela', async () => {
    const user = userEvent.setup();
    actions.deleteCommentAction.mockResolvedValue({ ok: true });
    render(thread([comment({ own: true })]));
    await user.click(screen.getByRole('button', { name: 'Mais opções do comentário' }));
    await user.click(screen.getByRole('menuitem', { name: 'Excluir' }));
    expect(actions.deleteCommentAction).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(actions.deleteCommentAction).toHaveBeenCalledWith('c1'));
  });

  it('mostra "editado" ao lado do horário', () => {
    render(thread([comment({ edited: true })]));
    expect(screen.getByText(/há 1 h · editado/)).toBeInTheDocument();
  });

  it('curtir o comentário chama o servidor com o comentário e atualiza o contador', async () => {
    const user = userEvent.setup();
    actions.setLikeAction.mockResolvedValue({ ok: true, liked: true, count: 4 });
    render(thread([comment({ likeCount: 3 })]));
    await user.click(screen.getByRole('button', { name: 'Curtir' }));
    await waitFor(() => expect(screen.getByText('4')).toBeInTheDocument());
    expect(actions.setLikeAction).toHaveBeenCalledWith('comment', 'c1', true);
    expect(screen.getByRole('button', { name: 'Curtir' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('"Ver mais comentários" acrescenta a próxima página sem repetir e some no fim', async () => {
    const user = userEvent.setup();
    actions.loadCommentsAction.mockResolvedValue({ ok: true, comments: [comment({ id: 'c1' }), comment({ id: 'c2', body: 'Segunda página' })], next: null });
    render(thread([comment({ id: 'c1' })], 'cursor'));
    await user.click(screen.getByRole('button', { name: 'Ver mais comentários' }));
    await waitFor(() => expect(screen.getByText('Segunda página')).toBeInTheDocument());
    expect(actions.loadCommentsAction).toHaveBeenCalledWith('p1', 'cursor');
    expect(screen.getAllByText('Boa dica!')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Ver mais comentários' })).toBeNull();
  });
});

describe('denunciar comentário', () => {
  it('quem não é o autor vê Denunciar no menu; o autor não', async () => {
    const user = userEvent.setup();
    const { unmount } = render(thread([comment()]));
    await user.click(screen.getByRole('button', { name: 'Mais opções do comentário' }));
    expect(screen.getByRole('menuitem', { name: 'Denunciar' })).toBeInTheDocument();
    unmount();
    render(thread([comment({ own: true })]));
    await user.click(screen.getByRole('button', { name: 'Mais opções do comentário' }));
    expect(screen.queryByRole('menuitem', { name: 'Denunciar' })).toBeNull();
  });

  it('o dono do post tem Ocultar e Denunciar; comentário oculto ou excluído não tem Denunciar para quem não lê', async () => {
    const user = userEvent.setup();
    const { unmount } = render(thread([comment({ canModerate: true })]));
    await user.click(screen.getByRole('button', { name: 'Mais opções do comentário' }));
    expect(screen.getByRole('menuitem', { name: 'Ocultar' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Denunciar' })).toBeInTheDocument();
    unmount();
    render(thread([comment({ status: 'deleted', body: null }), comment({ id: 'c2', status: 'hidden', body: null })]));
    expect(screen.queryByRole('button', { name: 'Mais opções do comentário' })).toBeNull();
  });

  it('abre a denúncia do comentário e envia o motivo', async () => {
    const user = userEvent.setup();
    reportActions.reportAction.mockResolvedValue({ ok: true, alreadyReported: false });
    render(thread([comment()]));
    await user.click(screen.getByRole('button', { name: 'Mais opções do comentário' }));
    await user.click(screen.getByRole('menuitem', { name: 'Denunciar' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Denunciar comentário')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'Conteúdo inadequado' }));
    await user.click(within(dialog).getByRole('button', { name: 'Enviar denúncia' }));
    await waitFor(() => expect(reportActions.reportAction).toHaveBeenCalledWith('comment', 'c1', 'inappropriate', ''));
    expect(await screen.findByText('Denúncia enviada. Obrigado, vamos analisar.')).toBeInTheDocument();
  });
});
