/**
 * Data de nascimento e idade mínima (decisão de 27/11/2026; `04_conteudo/legal/README.md`). O Garnic é, por enquanto,
 * para quem tem 16 anos ou mais: o ECA Digital (Lei nº 15.211/2025, art. 24) exige que contas de até 16 anos sejam
 * ligadas à conta de um responsável, e isso ainda não existe aqui.
 */

export const MIN_AGE = 16;
/** Datas mais antigas que isso são erro de digitação. */
const MAX_AGE = 120;

export type BirthDateProblem = 'required' | 'invalid' | 'under-age';

/** Lê "DD/MM/AAAA" (o que a pessoa digita) ou "AAAA-MM-DD" (o que o banco guarda). Devolve "AAAA-MM-DD" ou `null`. */
export function parseBirthDate(value: string): string | null {
  const text = value.trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const [year, month, day] = br ? [Number(br[3]), Number(br[2]), Number(br[1])] : iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [NaN, NaN, NaN];
  if (!Number.isInteger(year)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // 31/02 vira 03/03 no Date: confere se o dia e o mês continuam os mesmos.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Idade completa em `now` (no fuso de Brasília, onde está o Garnic). */
export function ageOn(birthDate: string, now: Date): number {
  const [year, month, day] = birthDate.split('-').map(Number);
  // Data de hoje em Brasília (UTC-3, sem horário de verão desde 2019).
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const [y, m, d] = [local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate()];
  return y - year - (m < month || (m === month && d < day) ? 1 : 0);
}

/** Confere a data digitada. `ok` traz a data no formato do banco. */
export function checkBirthDate(value: string, now = new Date()): { ok: true; birthDate: string } | { ok: false; problem: BirthDateProblem } {
  if (value.trim() === '') return { ok: false, problem: 'required' };
  const birthDate = parseBirthDate(value);
  if (!birthDate) return { ok: false, problem: 'invalid' };
  const age = ageOn(birthDate, now);
  if (age < 0 || age > MAX_AGE) return { ok: false, problem: 'invalid' };
  if (age < MIN_AGE) return { ok: false, problem: 'under-age' };
  return { ok: true, birthDate };
}
