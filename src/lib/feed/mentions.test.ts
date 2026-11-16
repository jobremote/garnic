import { describe, expect, it } from 'vitest';
import { groupByStatus } from './groups';
import { findMentionTrigger, insertMention, mentionToken, MENTION_QUERY_MAX, syncMarkedGames, withoutMentions } from './mentions';

describe('findMentionTrigger', () => {
  it('acha o "@" em edição antes do cursor, no começo do texto ou depois de um espaço', () => {
    expect(findMentionTrigger('@Hol', 4)).toEqual({ start: 0, query: 'Hol' });
    expect(findMentionTrigger('Zerei o @Hollow Kn', 18)).toEqual({ start: 8, query: 'Hollow Kn' });
    expect(findMentionTrigger('linha\n@Ha', 9)).toEqual({ start: 6, query: 'Ha' });
    expect(findMentionTrigger('@', 1)).toEqual({ start: 0, query: '' });
  });

  it('ignora "@" colado em outra palavra (e-mail), sem "@" ou com quebra de linha depois dele', () => {
    expect(findMentionTrigger('fale@email', 10)).toBeNull();
    expect(findMentionTrigger('sem arroba', 10)).toBeNull();
    expect(findMentionTrigger('@Ha\nrdes', 8)).toBeNull();
  });

  it('para de acompanhar depois do limite de caracteres', () => {
    const query = 'a'.repeat(MENTION_QUERY_MAX + 1);
    expect(findMentionTrigger(`@${query}`, query.length + 1)).toBeNull();
    expect(findMentionTrigger(`@${'a'.repeat(MENTION_QUERY_MAX)}`, MENTION_QUERY_MAX + 1)).not.toBeNull();
  });

  it('só olha até o cursor: com o cursor antes do "@", não há busca', () => {
    expect(findMentionTrigger('texto @Hol', 3)).toBeNull();
  });

  it('um "@" que já virou menção de um jogo marcado não reabre a busca ao continuar escrevendo', () => {
    const marked = [{ name: 'Hollow Knight' }];
    const text = 'Zerei o @Hollow Knight e';
    expect(findMentionTrigger(text, text.length, marked)).toBeNull();
    // Mas um "@" novo depois dela abre.
    const next = `${text} e @Cel`;
    expect(findMentionTrigger(next, next.length, marked)).toEqual({ start: next.length - 4, query: 'Cel' });
    // E com o cursor dentro do nome, a busca acompanha (a pessoa está mexendo na menção).
    expect(findMentionTrigger(text, 12, marked)).toEqual({ start: 8, query: 'Hol' });
  });
});

describe('insertMention', () => {
  it('troca o "@consulta" por "@Nome " e põe o cursor depois do espaço', () => {
    expect(insertMention('Zerei o @Hol', 'Hollow Knight', { start: 8, end: 12 })).toEqual({ text: 'Zerei o @Hollow Knight ', caret: 23 });
  });

  it('pelo botão (sem "@" digitado), insere no cursor e põe um espaço antes se estiver colado numa palavra', () => {
    expect(insertMention('Zerei', 'Celeste', { start: 5, end: 5 })).toEqual({ text: 'Zerei @Celeste ', caret: 15 });
    expect(insertMention('', 'Celeste', { start: 0, end: 0 })).toEqual({ text: '@Celeste ', caret: 9 });
  });

  it('no meio do texto, não duplica espaços', () => {
    expect(insertMention('antes depois', 'Hades', { start: 6, end: 6 })).toEqual({ text: 'antes @Hades depois', caret: 13 });
    expect(insertMention('antes @Ha depois', 'Hades', { start: 6, end: 9 })).toEqual({ text: 'antes @Hades depois', caret: 12 });
  });
});

describe('syncMarkedGames', () => {
  const games = [{ name: 'Hollow Knight' }, { name: 'Celeste' }, { name: 'Hades' }];

  it('mantém só os jogos cujo "@Nome" ainda está no texto, na mesma ordem', () => {
    const text = `Zerei ${mentionToken('Hollow Knight')} e ${mentionToken('Hades')}`;
    expect(syncMarkedGames(text, games).map((game) => game.name)).toEqual(['Hollow Knight', 'Hades']);
  });

  it('apagar a menção tira o jogo; sem menções, a lista fica vazia', () => {
    expect(syncMarkedGames('Zerei @Hollow Knig', games)).toEqual([]);
    expect(syncMarkedGames('', games)).toEqual([]);
  });
});

describe('withoutMentions', () => {
  const games = [{ name: 'Hollow Knight' }, { name: 'Celeste' }];

  it('tira as menções dos jogos marcados e apara; sobra vazio quando só havia menções', () => {
    expect(withoutMentions('@Hollow Knight @Celeste ', games)).toBe('');
    expect(withoutMentions('@Hollow Knight que jogo', games)).toBe('que jogo');
  });

  it('não mexe em "@" que não é de um jogo marcado', () => {
    expect(withoutMentions('oi @alguem', games)).toBe('oi @alguem');
  });
});

describe('groupByStatus', () => {
  it('agrupa na ordem Zerado, Jogando, Quero jogar, Parado e, por último, sem status', () => {
    const list = [
      { name: 'a', status: 'quero-jogar' as const },
      { name: 'b', status: null },
      { name: 'c', status: 'zerado' as const },
      { name: 'd', status: 'parado' as const },
      { name: 'e', status: 'jogando' as const },
      { name: 'f', status: 'zerado' as const },
      { name: 'g' },
    ];
    const groups = groupByStatus(list);
    expect(groups.map((group) => group.status)).toEqual(['zerado', 'jogando', 'quero-jogar', 'parado', null]);
    expect(groups[0].items.map((item) => item.name)).toEqual(['c', 'f']);
    expect(groups[4].items.map((item) => item.name)).toEqual(['b', 'g']);
  });

  it('não cria grupos vazios', () => {
    expect(groupByStatus([{ status: 'jogando' as const }]).map((group) => group.status)).toEqual(['jogando']);
    expect(groupByStatus([])).toEqual([]);
  });
});
