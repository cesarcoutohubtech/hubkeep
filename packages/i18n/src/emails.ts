// E-mails montados a partir do catálogo (ADR-022). O convite (F0-09) serve a
// dois usos com o mesmo texto:
//   - o template único do Supabase (supabase/templates/convite.html), gerado
//     em pt-BR com as variáveis do Go ({{ .Data.nome }}), enquanto o envio for
//     pelo Supabase (test/templates.test.ts confere o arquivo);
//   - o adaptador SMTP próprio (fase 1c), no idioma de quem recebe.
import type { IdiomaDeExibicao } from './idiomas';
import { criarTradutor } from './tradutor';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
/** Escapa para HTML (texto e atributo). Nome e grupo vêm de quem cadastrou. */
export const escaparHtml = (texto: string) => texto.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

export interface DadosDoConvite {
  nome: string;
  tenant: string;
  /** Link de aceite, já completo. */
  link: string;
}

export interface Email {
  assunto: string;
  html: string;
}

// Marcadores da tag <b> do catálogo: sobrevivem ao escape e depois viram
// <strong>. Caracteres de controle são tirados dos valores antes.
const ABRE = '\u0001';
const FECHA = '\u0002';
const semControle = (v: string) =>
  [...v].filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127).join('');

export function emailDeConvite(idioma: IdiomaDeExibicao, dados: DadosDoConvite): Email {
  const { t, intl } = criarTradutor(idioma);
  // Texto do catálogo e valores entram crus no ICU; o resultado inteiro é
  // escapado, e só as tags do catálogo viram HTML.
  const texto = (chave: Parameters<typeof t>[0], valores?: Record<string, string>) =>
    escaparHtml(t(chave, valores));
  const acesso = escaparHtml(
    intl.formatMessage(
      { id: 'email.convite.acesso' },
      {
        tenant: semControle(dados.tenant),
        b: (dentro: string[]) => `${ABRE}${dentro.join('')}${FECHA}`,
      },
    ),
  )
    .replaceAll(ABRE, '<strong>')
    .replaceAll(FECHA, '</strong>');
  const html = [
    `<h2>${texto('email.convite.titulo')}</h2>`,
    `<p>${texto('email.convite.saudacao', { nome: semControle(dados.nome) })}</p>`,
    `<p>${acesso}</p>`,
    `<p><a href="${escaparHtml(dados.link)}">${texto('email.convite.acao')}</a></p>`,
    `<p>${texto('email.convite.depois')}</p>`,
    `<p>${texto('email.convite.ignorar')}</p>`,
    '',
  ].join('\n');
  return { assunto: t('email.convite.assunto'), html };
}

/** O aviso de SLA (1c, ADR-046): o e-mail com o texto puro ao lado do HTML. */
export interface EmailComTexto extends Email {
  texto: string;
}

export interface DadosDoAvisoDeSla {
  /** O tipo do alerta do monitor (ADR-043). */
  tipo: string;
  descricao: string;
  hotel: string;
  prazo: Date;
  /** O fuso do hotel, para o prazo na hora de lá. */
  fuso: string;
  /** O link do chamado, já completo. */
  link: string;
}

/** O aviso de SLA no idioma de quem recebe (C6), com o prazo no fuso do hotel. */
export function emailDeAvisoDeSla(
  idioma: IdiomaDeExibicao,
  dados: DadosDoAvisoDeSla,
): EmailComTexto {
  const { t, intl } = criarTradutor(idioma);
  const prazo = intl.formatDate(dados.prazo, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: dados.fuso,
  });
  const descricao = semControle(dados.descricao);
  const hotel = semControle(dados.hotel);
  const linhas = [
    t('email.sla.titulo', { tipo: dados.tipo }),
    t('email.sla.chamado', { descricao }),
    t('email.sla.onde', { hotel }),
    t('email.sla.prazo', { prazo }),
  ];
  const html = [
    `<h2>${escaparHtml(linhas[0] ?? '')}</h2>`,
    ...linhas.slice(1).map((l) => `<p>${escaparHtml(l)}</p>`),
    `<p><a href="${escaparHtml(dados.link)}">${escaparHtml(t('email.sla.acao'))}</a></p>`,
    `<p>${escaparHtml(t('email.sla.motivo'))}</p>`,
    '',
  ].join('\n');
  const texto = [
    ...linhas,
    '',
    `${t('email.sla.acao')}: ${dados.link}`,
    '',
    t('email.sla.motivo'),
    '',
  ].join('\n');
  return { assunto: semControle(t('email.sla.assunto', { tipo: dados.tipo, hotel })), html, texto };
}
