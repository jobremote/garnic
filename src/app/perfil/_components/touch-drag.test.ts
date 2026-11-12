// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachTouchDrag, autoScrollStep, dropIndexAt, HOLD_MS } from './touch-drag';

describe('dropIndexAt', () => {
  const rect = (top: number, height: number) => ({ top, height, bottom: top + height, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
  it('conta os cards acima do ponto, sem contar o arrastado', () => {
    document.body.innerHTML = '<section id="c"><div data-entry-id="a"></div><div data-entry-id="b"></div><div data-entry-id="c"></div></section>';
    const column = document.getElementById('c') as HTMLElement;
    column.querySelectorAll('[data-entry-id]').forEach((el, i) => {
      el.getBoundingClientRect = () => rect(i * 100, 80);
    });
    expect(dropIndexAt(column, 10, 'zzz')).toBe(0); // acima do meio do primeiro
    expect(dropIndexAt(column, 150, 'zzz')).toBe(2); // depois do meio do segundo
    expect(dropIndexAt(column, 999, 'zzz')).toBe(3); // no fim
    expect(dropIndexAt(column, 999, 'a')).toBe(2); // o arrastado não conta
    expect(dropIndexAt(null, 10, 'a')).toBe(0);
  });
});

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
      onOver: (column, index) => calls.push(`over ${column}@${index}`),
      onDrop: (id, from, to, index) => calls.push(`drop ${id} ${from}->${to}@${index}`),
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
    expect(calls).toEqual(['start e1 jogando', 'over zerado@0']);
    expect(document.body.querySelectorAll('.card')).toHaveLength(2); // o "fantasma" que acompanha o dedo

    const move = touch('touchmove', container, 120, 60);
    expect(move.defaultPrevented).toBe(true); // a página não rola junto
    const end = touch('touchend', container, 120, 60);
    expect(end.defaultPrevented).toBe(true); // sem clique fantasma
    expect(calls).toEqual(['start e1 jogando', 'over zerado@0', 'drop e1 jogando->zerado@0', 'end']);
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

  it('soltar na coluna de origem reordena (mesma coluna); fora de qualquer coluna não faz nada', () => {
    columnAt = () => 'jogando';
    touch('touchstart', card.querySelector('.open') as Element, 10, 10);
    vi.advanceTimersByTime(HOLD_MS + 1);
    touch('touchend', container, 10, 10);
    expect(calls).toEqual(['start e1 jogando', 'over jogando@0', 'drop e1 jogando->jogando@0', 'end']);

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
    expect(calls).toEqual(['start e1 jogando', 'over zerado@0', 'end']);
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
