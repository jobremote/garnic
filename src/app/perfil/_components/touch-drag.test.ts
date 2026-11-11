// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachTouchDrag, autoScrollStep, HOLD_MS } from './touch-drag';

describe('autoScrollStep', () => {
  it('no meio da área não rola; perto das bordas rola para o lado certo, mais rápido quanto mais perto', () => {
    expect(autoScrollStep(200, 0, 400)).toBe(0);
    expect(autoScrollStep(10, 0, 400)).toBeLessThan(0);
    expect(autoScrollStep(390, 0, 400)).toBeGreaterThan(0);
    expect(Math.abs(autoScrollStep(2, 0, 400))).toBeGreaterThan(Math.abs(autoScrollStep(50, 0, 400)));
  });

  it('o dedo fora da área (além da borda) usa a velocidade máxima', () => {
    expect(autoScrollStep(-50, 0, 400, 64, 18)).toBe(-18);
    expect(autoScrollStep(500, 0, 400, 64, 18)).toBe(18);
  });
});

function touch(type: string, target: Element, x: number, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const point = { clientX: x, clientY: y };
  Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [point] });
  Object.defineProperty(event, 'changedTouches', { value: [point] });
  target.dispatchEvent(event);
  return event;
}

describe('attachTouchDrag', () => {
  let container: HTMLElement;
  let card: HTMLElement;
  let calls: string[];
  let columnAt: (x: number, y: number) => string | null;
  let detach: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    document.body.innerHTML = `
      <div id="kanban">
        <section data-column="jogando">
          <div class="card" data-entry-id="e1" data-from="jogando"><button class="open">Celeste</button><div class="nds-menu"><button class="menu">⋯</button></div></div>
        </section>
        <section data-column="zerado"></section>
      </div>`;
    container = document.getElementById('kanban') as HTMLElement;
    card = container.querySelector('.card') as HTMLElement;
    calls = [];
    columnAt = () => 'zerado';
    detach = attachTouchDrag({
      container,
      cardSelector: '.card',
      columnAt: (x, y) => columnAt(x, y),
      onStart: (id, from) => calls.push(`start ${id} ${from}`),
      onOver: (column) => calls.push(`over ${column}`),
      onDrop: (id, from, to) => calls.push(`drop ${id} ${from}->${to}`),
      onEnd: () => calls.push('end'),
    });
  });

  afterEach(() => {
    detach();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('segurar o dedo no card começa o arrastar; soltar sobre outra coluna move', () => {
    touch('touchstart', card.querySelector('.open') as Element, 10, 10);
    expect(calls).toEqual([]); // ainda esperando
    vi.advanceTimersByTime(HOLD_MS + 1);
    expect(calls).toEqual(['start e1 jogando', 'over zerado']);
    expect(document.body.querySelectorAll('.card')).toHaveLength(2); // o "fantasma" que acompanha o dedo

    const move = touch('touchmove', container, 120, 60);
    expect(move.defaultPrevented).toBe(true); // a página não rola junto
    const end = touch('touchend', container, 120, 60);
    expect(end.defaultPrevented).toBe(true); // sem clique fantasma
    expect(calls).toEqual(['start e1 jogando', 'over zerado', 'drop e1 jogando->zerado', 'end']);
    expect(document.body.querySelectorAll('.card')).toHaveLength(1); // fantasma removido
  });

  it('deslizar o dedo antes do tempo é rolagem: não arrasta e não bloqueia a rolagem', () => {
    touch('touchstart', card.querySelector('.open') as Element, 10, 10);
    const move = touch('touchmove', container, 80, 12);
    expect(move.defaultPrevented).toBe(false);
    vi.advanceTimersByTime(HOLD_MS + 50);
    expect(calls).toEqual([]);
  });

  it('um toque rápido (soltar antes do tempo) não arrasta e deixa o clique passar', () => {
    touch('touchstart', card.querySelector('.open') as Element, 10, 10);
    const end = touch('touchend', container, 10, 10);
    expect(end.defaultPrevented).toBe(false);
    vi.advanceTimersByTime(HOLD_MS + 50);
    expect(calls).toEqual([]);
  });

  it('o menu do card não inicia o arrastar', () => {
    touch('touchstart', card.querySelector('.menu') as Element, 10, 10);
    vi.advanceTimersByTime(HOLD_MS + 50);
    expect(calls).toEqual([]);
  });

  it('soltar na coluna de origem ou fora de qualquer coluna não move', () => {
    columnAt = () => 'jogando';
    touch('touchstart', card.querySelector('.open') as Element, 10, 10);
    vi.advanceTimersByTime(HOLD_MS + 1);
    touch('touchend', container, 10, 10);
    expect(calls).toEqual(['start e1 jogando', 'over jogando', 'end']);

    calls.length = 0;
    columnAt = () => null;
    touch('touchstart', card.querySelector('.open') as Element, 10, 10);
    vi.advanceTimersByTime(HOLD_MS + 1);
    touch('touchend', container, 10, 10);
    expect(calls).toEqual(['start e1 jogando', 'end']);
  });

  it('cancelar o toque (o sistema tomou o gesto) não move nada e limpa tudo', () => {
    touch('touchstart', card.querySelector('.open') as Element, 10, 10);
    vi.advanceTimersByTime(HOLD_MS + 1);
    touch('touchcancel', container, 10, 10);
    expect(calls).toEqual(['start e1 jogando', 'over zerado', 'end']);
    expect(document.body.querySelectorAll('.card')).toHaveLength(1);
  });

  it('um segundo dedo cancela (é um gesto de zoom ou outro, não de arrastar)', () => {
    touch('touchstart', card.querySelector('.open') as Element, 10, 10);
    const second = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.defineProperty(second, 'touches', { value: [{ clientX: 1, clientY: 1 }, { clientX: 5, clientY: 5 }] });
    Object.defineProperty(second, 'changedTouches', { value: [{ clientX: 5, clientY: 5 }] });
    card.dispatchEvent(second);
    vi.advanceTimersByTime(HOLD_MS + 50);
    expect(calls).toEqual([]);
  });

  it('desligar remove os ouvintes', () => {
    detach();
    touch('touchstart', card.querySelector('.open') as Element, 10, 10);
    vi.advanceTimersByTime(HOLD_MS + 50);
    expect(calls).toEqual([]);
  });
});
