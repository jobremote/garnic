// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { VerifyState } from '../state';
import { VerifyForm } from './VerifyForm';

// A ação de servidor é trocada por um dublê: aqui só se testa o que a tela mostra.
const verifyAction = vi.hoisted(() => vi.fn());
vi.mock('../actions', () => ({ verifyAction }));

const base: VerifyState = { mode: 'normal', limitReached: false, resendInSeconds: 0, sent: false, nonce: 1 };
const setup = (state: Partial<VerifyState> = {}) => render(<VerifyForm email="ana@email.com" initialState={{ ...base, ...state }} />);

describe('VerifyForm', () => {
  it('mostra o e-mail e o prazo do código (texto do protótipo)', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Valide seu e-mail' })).toBeInTheDocument();
    expect(screen.getByText('Enviamos um código de 6 dígitos para ana@email.com. Ele vale por 10 minutos.')).toBeInTheDocument();
  });

  it('só habilita "Validar e-mail" com os 6 dígitos', async () => {
    const user = userEvent.setup();
    setup();
    const validate = screen.getByRole('button', { name: 'Validar e-mail' });
    expect(validate).toBeDisabled();
    await user.click(screen.getAllByRole('textbox')[0]);
    await user.paste('482915');
    expect(validate).toBeEnabled();
  });

  it('segura o reenvio por 60 segundos e mostra a contagem', () => {
    setup({ resendInSeconds: 42 });
    expect(screen.getByRole('button', { name: 'Reenviar código em 0:42' })).toBeDisabled();
  });

  it('libera o reenvio quando a espera acaba', () => {
    setup({ resendInSeconds: 0 });
    expect(screen.getByRole('button', { name: 'Reenviar código' })).toBeEnabled();
  });

  it('conta regressiva sai do reenvio em espera ao longo do tempo', async () => {
    vi.useFakeTimers();
    try {
      setup({ resendInSeconds: 2 });
      expect(screen.getByRole('button', { name: 'Reenviar código em 0:02' })).toBeDisabled();
      // Cada segundo é um novo estado do React: avança um por vez, dentro de act.
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(screen.getByRole('button', { name: 'Reenviar código em 0:01' })).toBeDisabled();
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(screen.getByRole('button', { name: 'Reenviar código' })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('código vencido: mostra o aviso no campo e oferece enviar um novo', () => {
    setup({ mode: 'expired' });
    expect(screen.getByText('Esse código expirou. Peça um novo para continuar.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Validar e-mail' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enviar novo código' })).toBeEnabled();
  });

  it('5 tentativas erradas: banner, campo bloqueado e só o botão de novo código', () => {
    setup({ mode: 'invalidated' });
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Código invalidado');
    expect(banner).toHaveTextContent('Você errou o código 5 vezes. Peça um novo código para continuar.');
    expect(screen.queryByRole('button', { name: 'Validar e-mail' })).not.toBeInTheDocument();
    for (const box of screen.getAllByRole('textbox')) expect(box).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enviar novo código' })).toBeEnabled();
  });

  it('limite de 5 códigos por hora: banner e reenvio bloqueado', () => {
    setup({ limitReached: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Limite de reenvios atingido');
    expect(screen.getByRole('alert')).toHaveTextContent('Você pode pedir até 5 códigos por hora. Tente de novo mais tarde.');
    expect(screen.getByRole('button', { name: 'Reenviar código' })).toBeDisabled();
  });

  it('avisa quando um código novo acabou de ser enviado', () => {
    setup({ sent: true, resendInSeconds: 60 });
    expect(screen.getByRole('status')).toHaveTextContent('Enviamos um novo código');
  });

  it('mostra as tentativas restantes devolvidas pelo servidor e reinicia o campo', async () => {
    const user = userEvent.setup();
    verifyAction.mockResolvedValueOnce({
      ...base,
      codeError: 'Código incorreto. Você ainda tem 3 tentativas.',
      nonce: 2,
    });
    setup();
    await user.click(screen.getAllByRole('textbox')[0]);
    await user.paste('111111');
    await user.click(screen.getByRole('button', { name: 'Validar e-mail' }));

    expect(await screen.findByText('Código incorreto. Você ainda tem 3 tentativas.')).toBeInTheDocument();
    expect(verifyAction).toHaveBeenCalledTimes(1);
    const formData = verifyAction.mock.calls[0][1] as FormData;
    expect(formData.get('code')).toBe('111111');
    expect(formData.get('intent')).toBe('verify');
    // o campo reinicia e o botão volta a ficar desabilitado até digitar de novo
    expect(screen.getByRole('button', { name: 'Validar e-mail' })).toBeDisabled();
  });
});
