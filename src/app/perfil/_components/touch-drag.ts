/**
 * Arrastar um card entre as colunas do kanban no celular (toque).
 *
 * O arrastar nativo do navegador (HTML5) não funciona bem com o dedo e não rola a lista sozinho. Aqui o card é
 * arrastado **depois de segurar um instante** (como nos apps de tarefas): quem só desliza o dedo continua rolando as
 * colunas normalmente. Com o card em movimento, a lista rola sozinha quando o dedo chega perto da borda.
 *
 * Usa eventos de toque nativos (e não os do React) porque precisa chamar `preventDefault` em `touchmove` para a página
 * não rolar junto, e o React registra esse evento como passivo.
 */

export const HOLD_MS = 350;
/** Quanto o dedo pode se mexer durante a espera antes de a gente entender que é rolagem, e não arrastar. */
export const HOLD_TOLERANCE_PX = 10;
const EDGE_PX = 64;
const MAX_SPEED = 18;

/**
 * Velocidade da rolagem automática: negativa (para o início), positiva (para o fim) ou zero. Cresce quanto mais perto
 * da borda o dedo está.
 */
export function autoScrollStep(position: number, start: number, end: number, edge = EDGE_PX, max = MAX_SPEED): number {
  if (position < start + edge) return -Math.ceil(max * Math.min(1, (start + edge - position) / edge));
  if (position > end - edge) return Math.ceil(max * Math.min(1, (position - (end - edge)) / edge));
  return 0;
}

/**
 * Posição de soltura numa coluna: quantos cards (sem contar o que está sendo arrastado) ficam **acima** do ponto `y`.
 * Vale 0 no topo e o total no fim; serve para o arrastar do mouse e o do dedo.
 */
export function dropIndexAt(column: Element | null, y: number, excludeEntryId: string): number {
  if (!column) return 0;
  const cards = [...column.querySelectorAll<HTMLElement>('[data-entry-id]')].filter((card) => card.dataset.entryId !== excludeEntryId);
  for (let index = 0; index < cards.length; index += 1) {
    const rect = cards[index].getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return index;
  }
  return cards.length;
}

export interface TouchDragOptions {
  /** A área que rola de lado (o kanban). */
  container: HTMLElement;
  /** Quem pode ser arrastado: tem `data-entry-id` e `data-from` (a coluna de origem). */
  cardSelector: string;
  /** Qual coluna está sob o dedo (padrão: a que tem `data-column` no ponto). Trocável nos testes. */
  columnAt?: (x: number, y: number) => string | null;
  onStart: (entryId: string, from: string) => void;
  /** Coluna sob o dedo e a posição de soltura nela (0 = topo). */
  onOver: (column: string | null, index: number) => void;
  onDrop: (entryId: string, from: string, to: string, index: number) => void;
  onEnd: () => void;
  /** Posição de soltura na coluna (padrão: pelos cards no DOM). Trocável nos testes. */
  indexAt?: (column: string, y: number, entryId: string) => number;
  holdMs?: number;
}

const defaultColumnAt = (x: number, y: number): string | null => {
  const element = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null;
  return (element?.closest('[data-column]') as HTMLElement | null)?.dataset.column ?? null;
};

/** Liga o arrastar por toque ao `container`. Devolve a função que desliga. */
export function attachTouchDrag(options: TouchDragOptions): () => void {
  const { container, cardSelector, onStart, onOver, onDrop, onEnd, holdMs = HOLD_MS } = options;
  const columnAt = options.columnAt ?? defaultColumnAt;
  const indexAt =
    options.indexAt ?? ((column: string, y: number, entryId: string) => dropIndexAt(container.querySelector('[data-column="' + column + '"]'), y, entryId));

  let timer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  let origin: { x: number; y: number } | null = null;
  let card: HTMLElement | null = null;
  let active: { entryId: string; from: string; ghost: HTMLElement; offsetX: number; offsetY: number } | null = null;
  let finger = { x: 0, y: 0 };
  let over: string | null = null;
  let overIndex = 0;

  const point = (event: TouchEvent) => {
    const touch = event.touches[0] ?? event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const stopTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  const moveGhost = () => {
    if (active) active.ghost.style.transform = `translate(${finger.x - active.offsetX}px, ${finger.y - active.offsetY}px)`;
  };

  const updateOver = () => {
    const column = columnAt(finger.x, finger.y);
    const index = column && active ? indexAt(column, finger.y, active.entryId) : 0;
    if (column !== over || index !== overIndex) {
      over = column;
      overIndex = index;
      onOver(column, index);
    }
  };

  // Rolagem automática enquanto o dedo está perto da borda: a lista anda e a coluna sob o dedo muda.
  const tick = () => {
    if (!active) return;
    const rect = container.getBoundingClientRect();
    const horizontal = autoScrollStep(finger.x, rect.left, rect.right);
    if (horizontal !== 0) {
      container.scrollLeft += horizontal;
      updateOver();
    }
    // A lista da coluna sob o dedo rola quando o dedo chega perto do topo ou do fim dela.
    const scroller = over ? container.querySelector('[data-column="' + over + '"] .nds-board-column__scroll') : null;
    if (scroller) {
      const box = scroller.getBoundingClientRect();
      const inside = autoScrollStep(finger.y, box.top, box.bottom, 56, 14);
      if (inside !== 0) {
        scroller.scrollTop += inside;
        updateOver();
      }
    }
    const vertical = autoScrollStep(finger.y, 0, window.innerHeight, 80, 14);
    if (vertical !== 0) window.scrollBy(0, vertical);
    frame = requestAnimationFrame(tick);
  };

  const finish = (drop: boolean) => {
    stopTimer();
    cancelAnimationFrame(frame);
    if (active) {
      const { entryId, from, ghost } = active;
      ghost.remove();
      active = null;
      if (drop && over) onDrop(entryId, from, over, overIndex);
      over = null;
      overIndex = 0;
      onEnd();
    }
    origin = null;
    card = null;
  };

  const begin = () => {
    if (!card || !origin) return;
    const entryId = card.dataset.entryId;
    const from = card.dataset.from;
    if (!entryId || !from) return;
    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('id');
    Object.assign(ghost.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: `${rect.width}px`,
      margin: '0',
      opacity: '0.92',
      pointerEvents: 'none',
      zIndex: '40',
      transition: 'none',
    });
    document.body.appendChild(ghost);
    active = { entryId, from, ghost, offsetX: origin.x - rect.left, offsetY: origin.y - rect.top };
    finger = { ...origin };
    moveGhost();
    navigator.vibrate?.(12);
    onStart(entryId, from);
    updateOver();
    frame = requestAnimationFrame(tick);
  };

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) return finish(false);
    const target = event.target as HTMLElement | null;
    // O menu do card e os botões de dentro do card (que não são a área do card) não iniciam arrastar.
    if (target?.closest('.nds-menu')) return;
    const found = target?.closest(cardSelector) as HTMLElement | null;
    const start = point(event);
    if (!found || !start) return;
    card = found;
    origin = start;
    timer = setTimeout(begin, holdMs);
  };

  const onTouchMove = (event: TouchEvent) => {
    const next = point(event);
    if (!next) return;
    if (active) {
      event.preventDefault(); // a página não rola junto com o card
      finger = next;
      moveGhost();
      updateOver();
      return;
    }
    // Ainda esperando: se o dedo andou, é rolagem (não arrastar).
    if (origin && Math.hypot(next.x - origin.x, next.y - origin.y) > HOLD_TOLERANCE_PX) finish(false);
  };

  const onTouchEnd = (event: TouchEvent) => {
    if (active) event.preventDefault(); // evita o "clique" fantasma que abriria a entrada
    finish(true);
  };
  const onTouchCancel = () => finish(false);
  // Segurar o dedo num card abre o menu de contexto do sistema; durante o arrastar, não.
  const onContextMenu = (event: Event) => {
    if (timer || active) event.preventDefault();
  };

  container.addEventListener('touchstart', onTouchStart, { passive: true });
  container.addEventListener('touchmove', onTouchMove, { passive: false });
  container.addEventListener('touchend', onTouchEnd, { passive: false });
  container.addEventListener('touchcancel', onTouchCancel);
  container.addEventListener('contextmenu', onContextMenu);

  return () => {
    finish(false);
    container.removeEventListener('touchstart', onTouchStart);
    container.removeEventListener('touchmove', onTouchMove);
    container.removeEventListener('touchend', onTouchEnd);
    container.removeEventListener('touchcancel', onTouchCancel);
    container.removeEventListener('contextmenu', onContextMenu);
  };
}
