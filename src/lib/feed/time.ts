const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const dateFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' });

/** Tempo desde a publicação, como o Figma mostra: "agora", "há 5 min", "há 2 h", "há 3 d" e, depois de uma semana, a data. */
export function timeAgo(date: Date, now: Date): string {
  const diff = Math.max(0, now.getTime() - date.getTime());
  if (diff < MINUTE) return 'agora';
  if (diff < HOUR) return `há ${Math.floor(diff / MINUTE)} min`;
  if (diff < DAY) return `há ${Math.floor(diff / HOUR)} h`;
  if (diff < 7 * DAY) return `há ${Math.floor(diff / DAY)} d`;
  return dateFormat.format(date);
}
