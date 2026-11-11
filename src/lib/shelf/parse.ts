import type { EntryInput, MonthYear } from './entry';

/**
 * Entrada de uma ação de servidor vira `EntryInput`. O que chega do navegador não é confiável: só passam os campos
 * conhecidos, com o tipo certo. Campo ausente continua ausente (mantém o valor); tipo errado vira valor inválido, que
 * as regras recusam, em vez de ser ignorado em silêncio.
 */
export function parseEntryInput(raw: unknown): EntryInput {
  const input: EntryInput = {};
  if (typeof raw !== 'object' || raw === null) return input;
  const data = raw as Record<string, unknown>;

  if ('status' in data) input.status = data.status;
  if ('rating' in data) input.rating = data.rating === null ? null : typeof data.rating === 'number' ? data.rating : Number.NaN;
  if ('platform' in data) input.platform = data.platform === null ? null : typeof data.platform === 'string' ? data.platform : '\u0000';
  if ('review' in data) input.review = data.review === null ? null : typeof data.review === 'string' ? data.review : '';
  if ('reviewSpoiler' in data) input.reviewSpoiler = data.reviewSpoiler === true;
  if ('started' in data) input.started = parseMonthYear(data.started);
  if ('ended' in data) input.ended = parseMonthYear(data.ended);
  if ('playMinutes' in data) input.playMinutes = data.playMinutes === null ? null : typeof data.playMinutes === 'number' ? data.playMinutes : Number.NaN;
  return input;
}

function parseMonthYear(raw: unknown): MonthYear {
  if (typeof raw !== 'object' || raw === null) return { month: Number.NaN, year: Number.NaN };
  const { month, year } = raw as Record<string, unknown>;
  const part = (value: unknown) => (value === null ? null : typeof value === 'number' ? value : Number.NaN);
  return { month: part(month), year: part(year) };
}
