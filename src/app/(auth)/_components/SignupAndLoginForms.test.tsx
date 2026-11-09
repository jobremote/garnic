// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { messages } from '@/lib/auth/messages';
import { LoginForm } from './LoginForm';
import { PasswordField } from './PasswordField';
import { SignupForm } from './SignupForm';

const actions = vi.hoisted(() => ({ signupAction: vi.fn(), loginAction: vi.fn() }));
vi.mock('../actions', () => actions);

describe('PasswordField', () => {
  it('mostra e oculta a senha com um botão que tem nome acessível', async () => {
    const user = userEvent.setup();
    render(<PasswordField label="Senha" />);
    const input = screen.getByLabelText('Senha');
    expect(input).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(input).toHaveAttribute('type', 'password');
  });
});

describe('SignupForm', () => {
  it('traz todos os campos do protótipo, com os textos de ajuda', () => {
    render(<SignupForm />);
    for (const label of ['Nome completo', '@usuário', 'E-mail', 'Senha', 'Repetir senha']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByLabelText('@usuário')).toHaveAccessibleDescription(messages.signup.usernameHint);
    expect(screen.getByLabelText('Senha')).toHaveAccessibleDescription(messages.signup.passwordHint);
    expect(screen.getByRole('link', { name: 'Termos de uso' })).toHaveAttribute('href', '/termos');
    expect(screen.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute('href', '/privacidade');
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeEnabled();
  });

  it('não tem campo de telefone (regra de cadastro)', () => {
    render(<SignupForm />);
    expect(screen.queryByLabelText(/telefone/i)).not.toBeInTheDocument();
  });

  it('mostra o erro de cada campo devolvido pelo servidor e mantém o que foi digitado', async () => {
    const user = userEvent.setup();
    actions.signupAction.mockResolvedValueOnce({
      values: { name: 'Ana Souza', username: 'Ana Souza!', email: 'ana@email', terms: false },
      errors: {
        username: messages.signup.usernameFormat,
        email: messages.signup.emailInvalid,
        password: messages.signup.passwordWeak,
        confirmPassword: messages.signup.confirmMismatch,
        terms: messages.signup.termsRequired,
      },
    });
    render(<SignupForm />);
    await user.type(screen.getByLabelText('Nome completo'), 'Ana Souza');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText(messages.signup.usernameFormat)).toBeInTheDocument();
    expect(screen.getByLabelText('@usuário')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(messages.signup.emailInvalid)).toBeInTheDocument();
    expect(screen.getByText(messages.signup.confirmMismatch)).toBeInTheDocument();
    expect(screen.getByText(messages.signup.termsRequired)).toBeInTheDocument();
    expect(screen.getByLabelText('Nome completo')).toHaveValue('Ana Souza');
    expect(screen.getByLabelText('@usuário')).toHaveValue('Ana Souza!');
    // as senhas nunca voltam do servidor
    expect(screen.getByLabelText('Senha')).toHaveValue('');
  });

  it('envia o termo marcado como "on" para o servidor', async () => {
    const user = userEvent.setup();
    actions.signupAction.mockResolvedValueOnce({ values: { name: '', username: '', email: '', terms: true }, errors: {} });
    render(<SignupForm />);
    await user.click(screen.getByLabelText(/Li e aceito/));
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    const data = actions.signupAction.mock.calls.at(-1)![1] as FormData;
    expect(data.get('terms')).toBe('on');
  });
});

describe('LoginForm', () => {
  it('mostra e-mail, senha, link de cadastro e o Google desabilitado', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/cadastrar');
    expect(screen.getByRole('button', { name: 'Continuar com Google' })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('credenciais incorretas: banner único, sem dizer qual dado errou, e o e-mail continua preenchido', async () => {
    const user = userEvent.setup();
    actions.loginAction.mockResolvedValueOnce({ email: 'ana@email.com', failed: true, errors: {} });
    render(<LoginForm />);
    await user.type(screen.getByLabelText('E-mail'), 'ana@email.com');
    await user.type(screen.getByLabelText('Senha'), 'Senha#errada1');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('E-mail ou senha incorretos');
    expect(banner).toHaveTextContent('Confira os dados e tente de novo.');
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@email.com');
    expect(screen.getByLabelText('Senha')).toHaveValue('');
  });
});
