// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportDialog } from '@/app/feed/_components/ReportDialog';
import { EditProfile } from './EditProfile';

const actions = vi.hoisted(() => ({ updateProfileAction: vi.fn(), deleteAccountAction: vi.fn() }));
vi.mock('../actions', () => actions);
const reportActions = vi.hoisted(() => ({ reportAction: vi.fn() }));
vi.mock('@/app/feed/report-actions', () => reportActions);

const props = { name: 'Ana Souza', username: 'ana.souza', bio: '', coverPosition: 50, userId: 'u1', uploadMode: 'local' as const };

beforeEach(() => vi.clearAllMocks());

describe('excluir a conta', () => {
  it('fica no fim da edição do perfil e pede o @usuário antes de excluir', async () => {
    const user = userEvent.setup();
    actions.deleteAccountAction.mockResolvedValue({ ok: false, error: 'mismatch' });
    render(<EditProfile {...props} />);
    await user.click(screen.getByRole('button', { name: 'Editar perfil' }));
    await user.click(screen.getByRole('button', { name: 'Excluir minha conta' }));
    const dialog = await screen.findByRole('dialog', { name: 'Excluir sua conta?' });
    const confirm = within(dialog).getByRole('button', { name: 'Excluir conta' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Para confirmar, digite seu @usuário'), 'outra.pessoa');
    await user.click(confirm);
    expect(actions.deleteAccountAction).toHaveBeenCalledWith('outra.pessoa');
    expect(await within(dialog).findByText('O @usuário não confere. Digite exatamente o seu.')).toBeInTheDocument();
  });

  it('Cancelar fecha sem excluir', async () => {
    const user = userEvent.setup();
    render(<EditProfile {...props} />);
    await user.click(screen.getByRole('button', { name: 'Editar perfil' }));
    await user.click(screen.getByRole('button', { name: 'Excluir minha conta' }));
    const dialog = await screen.findByRole('dialog', { name: 'Excluir sua conta?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog', { name: 'Excluir sua conta?' })).toBeNull();
    expect(actions.deleteAccountAction).not.toHaveBeenCalled();
  });
});

describe('denúncia por idade', () => {
  it('"Parece ter menos de 16 anos" aparece só na denúncia de usuário', () => {
    const { unmount } = render(<ReportDialog kind="user" id="u2" onClose={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Parece ter menos de 16 anos' })).toBeInTheDocument();
    unmount();
    render(<ReportDialog kind="post" id="p1" onClose={() => {}} />);
    expect(screen.queryByRole('radio', { name: 'Parece ter menos de 16 anos' })).toBeNull();
  });
});
