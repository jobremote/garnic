// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppFooter } from './AppFooter';

describe('rodapé das telas logadas', () => {
  it('mostra "Powered by IGDB" como link para o igdb.com, que abre em nova aba', () => {
    render(<AppFooter />);
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Powered by');
    const link = screen.getByRole('link', { name: /IGDB/ });
    expect(link).toHaveAttribute('href', 'https://www.igdb.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('tem Termos e Privacidade, e só eles (Segurança infantil e Suporte ainda não existem)', () => {
    render(<AppFooter />);
    const nav = screen.getByRole('navigation', { name: 'Links do rodapé' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Termos', '/termos'],
      ['Privacidade', '/privacidade'],
    ]);
  });
});
