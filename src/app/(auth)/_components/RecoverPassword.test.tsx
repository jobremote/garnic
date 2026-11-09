// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { messages } from '@/lib/auth/messages';
import type { RequestResetState } from '../state';
import { ExpiredLink } from './ExpiredLink';
import { RequestResetForm } from './RequestResetForm';
import { ResetPasswordForm } from './ResetPasswordForm';

const actions = vi.hoisted(() => ({ requestResetAction: vi.fn(), resetPasswordAction: vi.fn() }));
vi.mock('../recovery-actions', () => actions);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

/** Resposta de "enviado". O `nonce` muda a cada resposta do servidor, e é isso que reinicia a contagem do reenvio. */
const sent = (email = 'ana@email.com', resendInSeconds = 60, nonce = 1): RequestResetState => ({
  status: 'sent',
  email,
  resendInSeconds,
  nonce,
});

describe('RequestResetForm (Esqueci a senha)', () => {
  it('mostra o pedido de e-mail com os textos do protótipo', () => {
    render(<RequestResetForm />);
    expect(screen.getByRole('heading', { name: 'Recuperar senha' })).toBeInTheDocument();
    expect(screen.getByText('Informe seu e-mail e enviaremos um link para criar uma nova senha.')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('type', 'email');
    expect(screen.getByRole('button', { name: 'Enviar link' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Voltar para o login' })).toHaveAttribute('href', '/entrar');
  });

  it('depois do envio mostra "Verifique seu e-mail" com a resposta neutra, o aviso e o reenvio em espera', async () => {
    const user = userEvent.setup();
    actions.requestResetAction.mockResolvedValueOnce(sent());
    render(<RequestResetForm />);
    await user.type(screen.getByLabelText('E-mail'), 'ana@email.com');
    await user.click(screen.getByRole('button', { name: 'Enviar link' }));

    expect(await screen.findByRole('heading', { name: 'Verifique seu e-mail' })).toBeInTheDocument();
    // a mesma frase para qualquer e-mail: não diz se a conta existe
    expect(screen.getByText('Se existir uma conta para ana@email.com, enviamos um link para redefinir a senha.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Link enviado');
    expect(screen.getByRole('status')).toHaveTextContent('Confira também a caixa de spam.');
    expect(screen.getByRole('button', { name: 'Reenviar link em 1:00' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Voltar para o login' })).toHaveAttribute('href', '/entrar');
  });

  it('e-mail inválido: o erro aparece no campo e o formulário continua', async () => {
    const user = userEvent.setup();
    actions.requestResetAction.mockResolvedValueOnce({
      status: 'form',
      email: 'ana@email',
      error: messages.signup.emailInvalid,
      resendInSeconds: 0,
      nonce: 2,
    });
    render(<RequestResetForm />);
    await user.type(screen.getByLabelText('E-mail'), 'ana@email');
    await user.click(screen.getByRole('button', { name: 'Enviar link' }));

    expect(await screen.findByText(messages.signup.emailInvalid)).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@email');
  });

  it('o reenvio fica liberado quando a espera acaba e manda o mesmo e-mail', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      actions.requestResetAction.mockReset();
      actions.requestResetAction.mockResolvedValueOnce(sent('ana@email.com', 2)).mockResolvedValueOnce(sent('ana@email.com', 60, 2));
      render(<RequestResetForm />);
      await user.type(screen.getByLabelText('E-mail'), 'ana@email.com');
      await user.click(screen.getByRole('button', { name: 'Enviar link' }));
      await screen.findByRole('heading', { name: 'Verifique seu e-mail' });

      expect(screen.getByRole('button', { name: 'Reenviar link em 0:02' })).toBeDisabled();
      await act(() => vi.advanceTimersByTimeAsync(1000));
      await act(() => vi.advanceTimersByTimeAsync(1000));
      const resend = screen.getByRole('button', { name: 'Reenviar link' });
      expect(resend).toBeEnabled();

      await user.click(resend);
      expect(actions.requestResetAction).toHaveBeenCalledTimes(2);
      const data = actions.requestResetAction.mock.calls[1][1] as FormData;
      expect(data.get('email')).toBe('ana@email.com');
      expect(await screen.findByRole('button', { name: 'Reenviar link em 1:00' })).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ResetPasswordForm (Criar nova senha)', () => {
  const field = (label: string) => screen.getByLabelText(label);

  it('mostra os campos do protótipo e leva o link escondido no envio', async () => {
    const user = userEvent.setup();
    actions.resetPasswordAction.mockReset();
    actions.resetPasswordAction.mockResolvedValueOnce({ errors: {}, expired: false });
    render(<ResetPasswordForm token="token-do-link" />);
    expect(screen.getByRole('heading', { name: 'Criar nova senha' })).toBeInTheDocument();
    expect(screen.getByText('Escolha uma senha nova para sua conta.')).toBeInTheDocument();
    expect(field('Nova senha')).toHaveAccessibleDescription(messages.signup.passwordHint);

    await user.type(field('Nova senha'), 'Nova#Senha7x');
    await user.type(field('Repetir nova senha'), 'Nova#Senha7x');
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    const data = actions.resetPasswordAction.mock.calls[0][1] as FormData;
    expect(data.get('token')).toBe('token-do-link');
    expect(data.get('password')).toBe('Nova#Senha7x');
    expect(data.get('confirmPassword')).toBe('Nova#Senha7x');
  });

  it('erros ao sair do campo, e somem ao corrigir', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="t" />);
    await user.type(field('Nova senha'), 'abc12');
    expect(screen.queryByText(messages.signup.passwordWeak)).not.toBeInTheDocument();
    await user.tab(); // botão do olho
    await user.tab(); // sai do bloco do campo
    expect(screen.getByText(messages.signup.passwordWeak)).toBeInTheDocument();

    await user.click(field('Nova senha'));
    await user.clear(field('Nova senha'));
    await user.type(field('Nova senha'), 'Nova#Senha7x');
    expect(screen.queryByText(messages.signup.passwordWeak)).not.toBeInTheDocument();

    await user.type(field('Repetir nova senha'), 'Diferente#9z');
    await user.tab();
    await user.tab();
    expect(screen.getByText(messages.signup.confirmMismatch)).toBeInTheDocument();
  });

  it('mostra o erro devolvido pelo servidor (por exemplo, senha igual ao @usuário)', async () => {
    const user = userEvent.setup();
    actions.resetPasswordAction.mockResolvedValueOnce({
      errors: { password: messages.signup.passwordSameAsIdentity },
      expired: false,
    });
    render(<ResetPasswordForm token="t" />);
    await user.type(field('Nova senha'), 'Zeca.Silva_7');
    await user.type(field('Repetir nova senha'), 'Zeca.Silva_7');
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    expect(await screen.findByText(messages.signup.passwordSameAsIdentity)).toBeInTheDocument();
  });

  it('link que deixou de valer durante o preenchimento: troca para "Link expirado"', async () => {
    const user = userEvent.setup();
    actions.resetPasswordAction.mockResolvedValueOnce({ errors: {}, expired: true });
    render(<ResetPasswordForm token="t" />);
    await user.type(field('Nova senha'), 'Nova#Senha7x');
    await user.type(field('Repetir nova senha'), 'Nova#Senha7x');
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    expect(await screen.findByRole('heading', { name: 'Link expirado' })).toBeInTheDocument();
  });
});

describe('ExpiredLink (Link expirado)', () => {
  it('explica, oferece um novo link e volta para o login', () => {
    render(<ExpiredLink />);
    expect(screen.getByRole('heading', { name: 'Link expirado' })).toBeInTheDocument();
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Esse link não é mais válido');
    expect(banner).toHaveTextContent('Peça um novo link para criar sua nova senha.');
    expect(screen.getByRole('button', { name: 'Enviar novo link' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Voltar para o login' })).toHaveAttribute('href', '/entrar');
  });
});
