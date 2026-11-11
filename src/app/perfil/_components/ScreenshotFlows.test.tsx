// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  createTagAction: vi.fn(),
  updateTagAction: vi.fn(),
  deleteTagAction: vi.fn(),
  discardScreenshotAction: vi.fn(),
  viewEntryAction: vi.fn(),
  reportScreenshotAction: vi.fn(),
}));
vi.mock('../shelf-actions', () => actions);
const upload = vi.hoisted(() => ({ uploadImage: vi.fn() }));
vi.mock('./upload-image', () => upload);

const ID = '11111111-1111-4111-8111-111111111111';
const columns = (): ShelfData => ({
  'quero-jogar': [],
  parado: [],
  jogando: [{ entryId: ID, name: 'Celeste', detail: '2018', tags: [] }],
  zerado: [],
});

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
  screenshotUrl: undefined,
  screenshotSpoiler: false,
  gameName: 'Celeste',
  year: '2018',
  platforms: [],
  ...over,
});

const pub = (over: Record<string, unknown> = {}) => ({
  entryId: ID,
  own: false,
  gameName: 'Celeste',
  year: '2018',
  status: 'zerado',
  platform: 'Nintendo Switch',
  rating: 5,
  review: 'O final é lindo.',
  reviewSpoiler: true,
  started: { month: 1, year: 2026 },
  ended: { month: 3, year: 2026 },
  playMinutes: 750,
  screenshotUrl: 'https://abc.public.blob.vercel-storage.com/screenshots/u/shot.png',
  screenshotSpoiler: true,
  tags: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Top da vida', color: 'wine' }],
  reportedByViewer: false,
  ...over,
});

type User = ReturnType<typeof userEvent.setup>;
const png = (size = 10) => new File([new Uint8Array(size)], 'print.png', { type: 'image/png' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('screenshot na edição da entrada', () => {
  const openEdit = async (user: User) => {
    await user.click(screen.getByRole('button', { name: 'Ações de Celeste' }));
    await user.click(screen.getByRole('menuitem', { name: 'Editar entrada' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar entrada' });
    await within(dialog).findByText('Celeste');
    await user.click(within(dialog).getByRole('tab', { name: /Review/ }));
    return dialog;
  };
  const shelf = () => <GameShelf columns={columns()} own title="Game Shelf" tags={[]} uploadMode="blob" userId="u1" />;

  it('envia a imagem ao escolher e manda a referência ao salvar, com o spoiler', async () => {
    actions.openEntryAction.mockResolvedValue({ ok: true, entry: entry(), timeToBeat: null });
    actions.saveEntryAction.mockResolvedValue({ ok: true, gameName: 'Celeste', status: 'jogando', statusChanged: false });
    upload.uploadImage.mockResolvedValue('https://abc.public.blob.vercel-storage.com/screenshots/u1/screenshot-Ab12.png');
    const user = userEvent.setup();
    render(shelf());
    const dialog = await openEdit(user);

    fireEvent.change(within(dialog).getByTestId('screenshot-input'), { target: { files: [png()] } });
    await waitFor(() => expect(upload.uploadImage).toHaveBeenCalledWith('blob', 'screenshot', expect.any(File), 'u1'));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Remover imagem' })).toBeInTheDocument());
    await user.click(within(dialog).getByRole('checkbox', { name: 'A screenshot contém spoiler' }));
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(actions.saveEntryAction).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({ screenshot: 'https://abc.public.blob.vercel-storage.com/screenshots/u1/screenshot-Ab12.png', screenshotSpoiler: true }),
    );
  });

  it('imagem acima de 5 MB ou de outro tipo é recusada na hora, sem enviar', async () => {
    actions.openEntryAction.mockResolvedValue({ ok: true, entry: entry(), timeToBeat: null });
    const user = userEvent.setup();
    render(shelf());
    const dialog = await openEdit(user);
    const input = within(dialog).getByTestId('screenshot-input');

    fireEvent.change(input, { target: { files: [png(5 * 1024 * 1024 + 1)] } });
    expect(await within(dialog).findByText('A imagem pode ter até 5 MB.')).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] } });
    expect(await within(dialog).findByText('Use uma imagem JPG, PNG ou WebP.')).toBeInTheDocument();
    expect(upload.uploadImage).not.toHaveBeenCalled();
  });

  it('remover a screenshot salva só vale ao Salvar (envia screenshot: null)', async () => {
    actions.openEntryAction.mockResolvedValue({ ok: true, entry: entry({ screenshotUrl: 'https://abc.public.blob.vercel-storage.com/screenshots/u1/old.png' }), timeToBeat: null });
    actions.saveEntryAction.mockResolvedValue({ ok: true, gameName: 'Celeste', status: 'jogando', statusChanged: false });
    const user = userEvent.setup();
    render(shelf());
    const dialog = await openEdit(user);
    await user.click(within(dialog).getByRole('button', { name: 'Remover imagem' }));
    expect(actions.saveEntryAction).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(actions.saveEntryAction).toHaveBeenCalledWith(ID, expect.objectContaining({ screenshot: null }));
  });

  it('cancelar a edição apaga a imagem enviada e ainda não salva', async () => {
    actions.openEntryAction.mockResolvedValue({ ok: true, entry: entry(), timeToBeat: null });
    upload.uploadImage.mockResolvedValue('https://abc.public.blob.vercel-storage.com/screenshots/u1/novo.png');
    const user = userEvent.setup();
    render(shelf());
    const dialog = await openEdit(user);
    fireEvent.change(within(dialog).getByTestId('screenshot-input'), { target: { files: [png()] } });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Remover imagem' })).toBeInTheDocument());
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(actions.discardScreenshotAction).toHaveBeenCalledWith('https://abc.public.blob.vercel-storage.com/screenshots/u1/novo.png');
  });

  it('falha no envio mostra o erro e não muda a entrada', async () => {
    actions.openEntryAction.mockResolvedValue({ ok: true, entry: entry(), timeToBeat: null });
    upload.uploadImage.mockRejectedValue(new Error('falhou'));
    const user = userEvent.setup();
    render(shelf());
    const dialog = await openEdit(user);
    fireEvent.change(within(dialog).getByTestId('screenshot-input'), { target: { files: [png()] } });
    expect(await within(dialog).findByText('Não foi possível enviar a imagem. Tente de novo.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Remover imagem' })).toBeNull();
  });
});

describe('ver a entrada', () => {
  const open = async (user: User, own = false) => {
    render(<GameShelf columns={columns()} own={own} title="Game Shelf" tags={[]} uploadMode="blob" userId="u1" />);
    await user.click(screen.getByRole('button', { name: 'Ver entrada: Celeste' }));
    const dialog = await screen.findByRole('dialog', { name: 'Entrada' });
    await within(dialog).findByText('Nintendo Switch');
    return dialog;
  };

  it('mostra os detalhes; review e screenshot com spoiler ficam atrás do aviso até clicar em Mostrar', async () => {
    actions.viewEntryAction.mockResolvedValue({ ok: true, entry: pub() });
    const user = userEvent.setup();
    const dialog = await open(user);
    expect(within(dialog).getByText('Março de 2026')).toBeInTheDocument();
    expect(within(dialog).getByText('12 h 30 min')).toBeInTheDocument();
    expect(within(dialog).getByText('Top da vida')).toBeInTheDocument();
    // Dois avisos: da screenshot e da review. O texto fica fora do alcance até mostrar.
    const reveal = within(dialog).getAllByRole('button', { name: 'Mostrar' });
    expect(reveal).toHaveLength(2);
    expect(within(dialog).queryByText('O final é lindo.', { selector: '[aria-hidden="true"] *' })).not.toBeNull();
    await user.click(reveal[1]);
    expect(within(dialog).getAllByRole('button', { name: 'Mostrar' })).toHaveLength(1);
  });

  it('sem spoiler, review e screenshot aparecem direto', async () => {
    actions.viewEntryAction.mockResolvedValue({ ok: true, entry: pub({ reviewSpoiler: false, screenshotSpoiler: false }) });
    const user = userEvent.setup();
    const dialog = await open(user);
    expect(within(dialog).queryByRole('button', { name: 'Mostrar' })).toBeNull();
    expect(within(dialog).getByRole('img', { name: 'Screenshot de Celeste' })).toBeInTheDocument();
  });

  it('a dona vê "Editar entrada", e não vê "Denunciar"', async () => {
    actions.viewEntryAction.mockResolvedValue({ ok: true, entry: pub({ own: true }) });
    const user = userEvent.setup();
    const dialog = await open(user, true);
    expect(within(dialog).getByRole('button', { name: 'Editar entrada' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Denunciar screenshot' })).toBeNull();
  });

  it('entrada sem screenshot não tem denúncia', async () => {
    actions.viewEntryAction.mockResolvedValue({ ok: true, entry: pub({ screenshotUrl: undefined }) });
    const user = userEvent.setup();
    const dialog = await open(user);
    expect(within(dialog).queryByRole('button', { name: 'Denunciar screenshot' })).toBeNull();
  });
});

describe('denunciar screenshot', () => {
  const openReport = async (user: User) => {
    actions.viewEntryAction.mockResolvedValue({ ok: true, entry: pub() });
    render(<GameShelf columns={columns()} own={false} title="Game Shelf" tags={[]} uploadMode="blob" userId="u1" />);
    await user.click(screen.getByRole('button', { name: 'Ver entrada: Celeste' }));
    const dialog = await screen.findByRole('dialog', { name: 'Entrada' });
    await user.click(await within(dialog).findByRole('button', { name: 'Denunciar screenshot' }));
    return screen.findByRole('dialog', { name: 'Denunciar screenshot' });
  };

  it('envia o motivo e os detalhes e avisa que foi registrada', async () => {
    actions.reportScreenshotAction.mockResolvedValue({ ok: true, alreadyReported: false });
    const user = userEvent.setup();
    const dialog = await openReport(user);
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Motivo' }), 'Spoiler sem aviso');
    await user.type(within(dialog).getByRole('textbox', { name: /Detalhes/ }), 'Entrega o final');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar denúncia' }));
    expect(actions.reportScreenshotAction).toHaveBeenCalledWith(ID, 'spoiler', 'Entrega o final');
    expect(await screen.findByText('Denúncia enviada')).toBeInTheDocument();
  });

  it('sem motivo, o erro do servidor aparece no campo', async () => {
    actions.reportScreenshotAction.mockResolvedValue({ ok: false, error: 'invalid', errors: { reason: 'Escolha um motivo.' } });
    const user = userEvent.setup();
    const dialog = await openReport(user);
    await user.click(within(dialog).getByRole('button', { name: 'Enviar denúncia' }));
    expect(await within(dialog).findByText('Escolha um motivo.')).toBeInTheDocument();
  });

  it('cancelar não envia nada', async () => {
    const user = userEvent.setup();
    const dialog = await openReport(user);
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(actions.reportScreenshotAction).not.toHaveBeenCalled();
  });
});
