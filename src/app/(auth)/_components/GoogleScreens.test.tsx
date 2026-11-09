// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { messages } from '@/lib/auth/messages';
import { GoogleButton } from './GoogleButton';
import { GoogleSignupForm } from './GoogleSignupForm';
import { LinkGoogleForm } from './LinkGoogleForm';

const googleActions = vi.hoisted(() => ({ completeGoogleSignupAction: vi.fn(), linkGoogleAction: vi.fn() }));
const mainActions = vi.hoisted(() => ({ checkUsernameTakenAction: vi.fn(async () => false) }));
vi.mock('../google-actions', () => googleActions);
vi.mock('../actions', () => mainActions);

describe('GoogleButton', () => {
  it('é um botão comum, com o logo do Google e o texto recebido, e está habilitado', () => {
    render(<GoogleButton>Continuar com Google</GoogleButton>);
    const button = screen.getByRole('button', { name: 'Continuar com Google' });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('type', 'button'); // não envia o formulário em volta (que tem a senha)
    expect(button.querySelectorAll('svg path')).toHaveLength(4); // G colorido
  });
});

describe('GoogleSignupForm (Escolha seu @usuário)', () => {
  const setup = () => render(<GoogleSignupForm name="Ana Souza" email="ana@email.com" />);
  const field = (label: string) => screen.getByLabelText(label);

  it('mostra nome e e-mail do Google sem poder editar, e o resto do protótipo', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Escolha seu @usuário' })).toBeInTheDocument();
    expect(screen.getByText('Você entrou com o Google. Falta só escolher como você aparece no Garnic.')).toBeInTheDocument();
    expect(field('Nome completo')).toHaveValue('Ana Souza');
    expect(field('Nome completo')).toBeDisabled();
    expect(field('E-mail')).toHaveValue('ana@email.com');
    expect(field('E-mail')).toBeDisabled();
    expect(field('@usuário')).toHaveAccessibleDescription(messages.signup.usernameHint);
    expect(screen.getByRole('link', { name: 'Termos de uso' })).toHaveAttribute('href', '/termos');
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeEnabled();
  });

  it('@usuário inválido: erro ao sair do campo, sem consultar o servidor; some ao corrigir', async () => {
    const user = userEvent.setup();
    mainActions.checkUsernameTakenAction.mockClear();
    setup();
    await user.type(field('@usuário'), 'Ana Souza!');
    expect(screen.queryByText(messages.signup.usernameFormat)).not.toBeInTheDocument();
    await user.tab();
    expect(screen.getByText(messages.signup.usernameFormat)).toBeInTheDocument();
    expect(mainActions.checkUsernameTakenAction).not.toHaveBeenCalled();

    await user.clear(field('@usuário'));
    await user.type(field('@usuário'), 'ana.souza');
    expect(screen.queryByText(messages.signup.usernameFormat)).not.toBeInTheDocument();
  });

  it('@usuário válido e já em uso: avisa ao sair do campo (consulta o servidor)', async () => {
    const user = userEvent.setup();
    mainActions.checkUsernameTakenAction.mockClear();
    mainActions.checkUsernameTakenAction.mockResolvedValueOnce(true);
    setup();
    await user.type(field('@usuário'), 'ana.souza');
    await user.tab();
    expect(await screen.findByText(messages.signup.usernameTaken)).toBeInTheDocument();
    expect(mainActions.checkUsernameTakenAction).toHaveBeenCalledWith('ana.souza');
  });

  it('termos: erro ao sair do campo sem marcar e some ao marcar', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByLabelText(/Li e aceito/));
    await user.click(screen.getByLabelText(/Li e aceito/)); // marca e desmarca
    await user.tab();
    expect(screen.getByText(messages.signup.termsRequired)).toBeInTheDocument();
    await user.click(screen.getByLabelText(/Li e aceito/));
    expect(screen.queryByText(messages.signup.termsRequired)).not.toBeInTheDocument();
  });

  it('envia @usuário e termos e mostra o erro devolvido pelo servidor', async () => {
    const user = userEvent.setup();
    googleActions.completeGoogleSignupAction.mockResolvedValueOnce({
      username: 'ana.souza',
      terms: true,
      errors: { username: messages.signup.usernameTaken },
    });
    setup();
    await user.type(field('@usuário'), 'ana.souza');
    await user.click(screen.getByLabelText(/Li e aceito/));
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    const data = googleActions.completeGoogleSignupAction.mock.calls[0][1] as FormData;
    expect(data.get('username')).toBe('ana.souza');
    expect(data.get('terms')).toBe('on');
    expect(await screen.findByText(messages.signup.usernameTaken)).toBeInTheDocument();
  });
});

describe('LinkGoogleForm (Já existe uma conta com esse e-mail)', () => {
  it('pede a senha da conta, com o e-mail travado, Esqueci a senha e Cancelar', () => {
    render(<LinkGoogleForm email="ana@email.com" />);
    expect(screen.getByRole('heading', { name: 'Já existe uma conta com esse e-mail' })).toBeInTheDocument();
    expect(screen.getByText('Confirme a senha da conta para vincular com o Google.')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@email.com');
    expect(screen.getByLabelText('E-mail')).toBeDisabled();
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('link', { name: 'Esqueci a senha' })).toHaveAttribute('href', '/recuperar-senha');
    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute('href', '/entrar');
    expect(screen.getByRole('button', { name: 'Vincular conta' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('senha incorreta: banner do protótipo e o campo com borda de erro', async () => {
    const user = userEvent.setup();
    googleActions.linkGoogleAction.mockResolvedValueOnce({ failed: true });
    const { container } = render(<LinkGoogleForm email="ana@email.com" />);
    await user.type(screen.getByLabelText('Senha'), 'Senha#errada1');
    await user.click(screen.getByRole('button', { name: 'Vincular conta' }));

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('Senha incorreta');
    expect(banner).toHaveTextContent('Confira a senha da sua conta e tente de novo.');
    expect(container.querySelector('.nds-text-field--invalid')).not.toBeNull();
    const data = googleActions.linkGoogleAction.mock.calls[0][1] as FormData;
    expect(data.get('password')).toBe('Senha#errada1');
  });
});
