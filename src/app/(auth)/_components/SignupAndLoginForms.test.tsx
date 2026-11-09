// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { messages } from '@/lib/auth/messages';
import { LoginForm } from './LoginForm';
import { PasswordField } from './PasswordField';
import { SignupForm } from './SignupForm';

const actions = vi.hoisted(() => ({
  signupAction: vi.fn(),
  loginAction: vi.fn(),
  checkUsernameTakenAction: vi.fn(async () => false),
}));
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

describe('SignupForm: erros ao sair do campo', () => {
  const field = (label: string) => screen.getByLabelText(label);

  it('não mostra erro enquanto a pessoa ainda está no campo, só depois que o cursor sai', async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    await user.type(field('Nome completo'), 'Ana');
    expect(screen.queryByText(messages.signup.nameNames)).not.toBeInTheDocument();

    await user.tab();
    expect(screen.getByText(messages.signup.nameNames)).toBeInTheDocument();
    expect(field('Nome completo')).toHaveAttribute('aria-invalid', 'true');
  });

  it('o erro some na hora em que a regra passa a ser cumprida', async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    await user.type(field('Nome completo'), 'Ana');
    await user.tab();
    expect(screen.getByText(messages.signup.nameNames)).toBeInTheDocument();

    await user.click(field('Nome completo'));
    await user.keyboard(' Souza');
    expect(screen.queryByText(messages.signup.nameNames)).not.toBeInTheDocument();
    expect(field('Nome completo')).not.toHaveAttribute('aria-invalid');
  });

  it('cada regra do nome tem a sua mensagem', async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    const name = field('Nome completo');
    for (const [typed, message] of [
      ['Ana L', messages.signup.nameShort],
      ['Ana Souza!', messages.signup.nameChars],
      ['', messages.signup.nameRequired],
    ] as const) {
      await user.clear(name);
      if (typed) await user.type(name, typed);
      await user.tab();
      expect(screen.getByText(message)).toBeInTheDocument();
      await user.click(name);
    }
  });

  it('mostra o erro de e-mail, senha e repetir senha ao sair de cada campo', async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    await user.type(field('E-mail'), 'ana@email');
    await user.tab();
    expect(screen.getByText(messages.signup.emailInvalid)).toBeInTheDocument();

    await user.type(field('Senha'), 'abc123');
    await user.tab(); // vai para o botão de mostrar senha, que não conta como sair do campo
    expect(screen.queryByText(messages.signup.passwordWeak)).not.toBeInTheDocument();
    await user.tab(); // agora sim sai do campo de senha
    expect(screen.getByText(messages.signup.passwordWeak)).toBeInTheDocument();

    await user.type(field('Repetir senha'), 'diferente');
    await user.tab();
    await user.tab();
    // a senha ainda é fraca: a diferença só é apontada quando a senha em si é válida
    expect(screen.queryByText(messages.signup.confirmMismatch)).not.toBeInTheDocument();
  });

  it('atualiza "repetir senha" quando a senha muda depois de visitada', async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    await user.type(field('Senha'), 'Zk9#mPq2vL');
    await user.tab();
    await user.tab();
    await user.type(field('Repetir senha'), 'Outra#senha9');
    await user.tab();
    await user.tab();
    expect(screen.getByText(messages.signup.confirmMismatch)).toBeInTheDocument();

    await user.clear(field('Repetir senha'));
    await user.type(field('Repetir senha'), 'Zk9#mPq2vL');
    expect(screen.queryByText(messages.signup.confirmMismatch)).not.toBeInTheDocument();
  });

  it('clicar no botão de mostrar senha não dispara o erro da senha', async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    await user.type(field('Senha'), 'abc');
    await user.click(screen.getAllByRole('button', { name: 'Mostrar senha' })[0]);
    expect(screen.queryByText(messages.signup.passwordWeak)).not.toBeInTheDocument();
  });

  it('@usuário com formato errado: erro na hora, sem consultar o servidor', async () => {
    const user = userEvent.setup();
    actions.checkUsernameTakenAction.mockClear();
    render(<SignupForm />);
    await user.type(field('@usuário'), 'Ana Souza!');
    await user.tab();
    expect(screen.getByText(messages.signup.usernameFormat)).toBeInTheDocument();
    expect(actions.checkUsernameTakenAction).not.toHaveBeenCalled();
  });

  it('@usuário válido: consulta o servidor e avisa quando já está em uso', async () => {
    const user = userEvent.setup();
    actions.checkUsernameTakenAction.mockClear();
    actions.checkUsernameTakenAction.mockResolvedValueOnce(true);
    render(<SignupForm />);
    await user.type(field('@usuário'), 'ana.souza');
    await user.tab();

    expect(await screen.findByText(messages.signup.usernameTaken)).toBeInTheDocument();
    expect(actions.checkUsernameTakenAction).toHaveBeenCalledWith('ana.souza');

    // trocar por outro @usuário tira o aviso
    await user.click(field('@usuário'));
    await user.keyboard('2');
    expect(screen.queryByText(messages.signup.usernameTaken)).not.toBeInTheDocument();
  });

  it('o e-mail em uso só é apontado no envio: sair do campo não consulta o servidor', async () => {
    const user = userEvent.setup();
    actions.checkUsernameTakenAction.mockClear();
    render(<SignupForm />);
    await user.type(field('E-mail'), 'ana@email.com');
    await user.tab();
    expect(screen.queryByText(messages.signup.emailTaken)).not.toBeInTheDocument();
    expect(actions.checkUsernameTakenAction).not.toHaveBeenCalled();
  });

  it('termos: erro ao sair do campo sem marcar, e some ao marcar', async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    await user.click(screen.getByLabelText(/Li e aceito/));
    await user.click(screen.getByLabelText(/Li e aceito/)); // marca e desmarca
    await user.tab();
    expect(screen.getByText(messages.signup.termsRequired)).toBeInTheDocument();
    await user.click(screen.getByLabelText(/Li e aceito/));
    expect(screen.queryByText(messages.signup.termsRequired)).not.toBeInTheDocument();
  });

  it('erro devolvido pelo servidor continua até a pessoa corrigir o campo', async () => {
    const user = userEvent.setup();
    actions.signupAction.mockResolvedValueOnce({
      values: { name: 'Ana Souza', username: 'ana.souza', email: 'ana@email.com', terms: true },
      errors: { email: messages.signup.emailTaken },
    });
    render(<SignupForm />);
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText(messages.signup.emailTaken)).toBeInTheDocument();

    // entrar e sair do campo sem mudar nada mantém o aviso
    await user.click(field('E-mail'));
    await user.tab();
    expect(screen.getByText(messages.signup.emailTaken)).toBeInTheDocument();

    // corrigir tira o aviso na hora
    await user.click(field('E-mail'));
    await user.keyboard('x');
    expect(screen.queryByText(messages.signup.emailTaken)).not.toBeInTheDocument();
  });
});

describe('LoginForm', () => {
  it('mostra e-mail, senha, link de cadastro e o botão do Google', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/cadastrar');
    expect(screen.getByRole('link', { name: 'Esqueci a senha' })).toHaveAttribute('href', '/recuperar-senha');
    expect(screen.getByRole('button', { name: 'Continuar com Google' })).toBeEnabled();
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
