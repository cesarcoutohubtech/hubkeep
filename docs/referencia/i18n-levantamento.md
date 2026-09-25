> **Nota (25/09/2026):** levantamento escrito sobre a stack antiga (NestJS, Keycloak/Auth0). Vale como referência de produto. As decisões técnicas e as adaptações obrigatórias à stack atual estão no ADR-022 (`docs/03-decisoes-tecnicas.md`): sem trigger de fuso, sem `unaccent` nem função de busca, sem tabela global de idioma ou de feriado, e login no catálogo do próprio HubKeep.

# CSC — Plataforma multi-idioma desde o MVP: levantamento

Sep 25, 2026 · @Kaio

## Resumo e decisão

A plataforma nasce multi-idioma em quatro idiomas: português do Brasil (idioma-fonte), inglês, espanhol e francês. Traduzem-se só os textos fixos das telas e as mensagens padrão do sistema; datas, números e fuso horário são tratados desde o início.

- **Idiomas no lançamento:** pt-BR, en, es e fr. Português de Portugal e alemão saem do lançamento; como a arquitetura nasce preparada, entram depois com custo só de tradução.
- **O que se traduz:** rótulos de campos, menus, botões, títulos, textos de ajuda, validações, erros, confirmações, avisos, e status e prioridades padrão.
- **O que não se traduz por enquanto:** conteúdo cadastrado (categorias, modelos de ativo, checklists, planos) e as saídas do servidor (e-mail, push, PDF, exportações, etiquetas), que saem em pt-BR.
- **Formatos e fuso:** idioma e formato regional são escolhas separadas, para que quem usa espanhol veja datas e números no padrão do seu país; fuso IANA por hotel no SLA e na preventiva.
- **Prazo:** 5 a 7 semanas-dev; piloto em 20–27 semanas, contra 19–24 do plano aprovado. Se espanhol e francês não tiverem usuário no piloto, ficam prontos para o rollout e o piloto fica em 20–26.
- **Custo externo:** tradução inicial de R$ 8 mil a R$ 26 mil para três idiomas, como premissa.
- **Risco aceito:** sem glossário nem revisão por nativos do setor no início; termo técnico mal traduzido só aparece quando houver usuário real em espanhol ou francês.

## Impacto nas decisões registradas

No formato decidido, o impacto cai para prazo, escolha do provedor de login e idioma das notificações; a hospedagem e o posicionamento não mudam no MVP.

| Decisão registrada | Status | Impacto | Proposta |
| --- | --- | --- | --- |
| Prazo até o piloto de 19–24 semanas (23/09, mantido em 24/09) | Aprovada | +1 a +3 semanas | Piloto em 20–27 semanas, ou 20–26 com espanhol e francês só no rollout |
| Posicionamento: operação hoteleira brasileira (23/09) | Aprovada | Idiomas sem motivação comercial definida não mudam o posicionamento | Manter; revisar só com decisão de mercado |
| P6: hospedagem no Brasil, por LGPD | Premissa | Nenhum no escopo inicial | Manter |
| Stack NestJS + React e PWA (23/09) | Proposta | Entram bibliotecas de internacionalização | Nenhuma troca de stack |
| Identidade OIDC, Keycloak ou Auth0 | Proposta | O login precisa dos quatro idiomas | Vira critério de escolha |
| Notificações por e-mail e push no MVP (23/09) | Proposta | Saem em pt-BR para todos os usuários | Textos no catálogo desde já, para traduzir depois sem reescrever |
| Impressão de OS e exportação CSV (24/09) | Proposta | Saem em pt-BR | Mesmo tratamento das notificações |
| Conformidade legal no roadmap pós-MVP (25/09) | Aprovada | Interface traduzível; normas em português | País no hotel desde o MVP |
| Sete variantes de idioma (25/09, esta conversa) | Aprovada | Substituída pela decisão de quatro idiomas | Retirar do registro |

## Dois níveis: idioma na plataforma e operação fora do Brasil

"Multi-idioma" pode significar duas coisas de custo muito diferente, e a decisão de mercado define qual delas o produto persegue. O nível 1 entra inteiro no MVP; do nível 2 entram só as colunas que evitam migração depois.

|  | Nível 1: idioma na plataforma | Nível 2: operar fora do Brasil |
| --- | --- | --- |
| Para quem | Redes estrangeiras que operam no Brasil (Accor, Meliá, Pestana e Vila Galé, por exemplo), proprietários e matrizes no exterior, equipes com profissionais de outros países | Hotéis em Portugal, Espanha, América Latina, França e Alemanha |
| O que exige | Textos fixos e mensagens fora do código, formatação por formato regional, fuso por hotel, processo de tradução | Tudo do nível 1, mais proteção de dados local, hospedagem na região, conformidade por país, conectores de outros sistemas hoteleiros, moeda, faturamento, contratos e suporte locais |
| No MVP | Sim, a arquitetura inteira | Só país, subdivisão e moeda no modelo de dados |
| Esforço | 5 a 7 semanas-dev, mais tradução | Projeto próprio, estimado por país |

O nível 1 sozinho já tem valor comercial no Brasil: uma rede com matriz em Paris ou Madri pode ver a manutenção dos hotéis brasileiros no idioma da matriz, enquanto a equipe local trabalha em português.

## Idiomas e formato regional

São quatro catálogos de texto, um por idioma, e o formato regional (datas, números, moeda) é uma escolha separada do idioma. Assim um catálogo de espanhol serve a usuários de vários países sem duplicar tradução.

| Idioma | Catálogo | Base dos textos (a confirmar) | Formato regional padrão | Outros formatos na lista | Fallback |
| --- | --- | --- | --- | --- | --- |
| Português (Brasil) | pt-BR | Idioma-fonte | pt-BR | — | — |
| English | en | Inglês americano | en-US | en-GB | pt-BR |
| Español | es | Espanhol neutro, latino-americano | es-419 | es-ES, es-MX, es-AR, es-CO, es-CL | en |
| Français | fr | Francês da França | fr-FR | fr-CA, fr-BE, fr-CH | en |

**Por que separar idioma de formato.** O mesmo texto em inglês serve a americanos e britânicos, mas 09/10/2026 é 10 de setembro para um e 9 de outubro para o outro. No espanhol, o separador decimal muda de país para país. Traduzir por idioma e formatar por região resolve os dois casos com quatro catálogos.

**Termos que não se traduzem.** Siglas legais brasileiras como PMOC, AVCB, NR-13 e ART ficam no original. Nomes de marca, códigos de ativo e textos digitados pelo usuário também não passam pela tradução.

**Unidades.** A medição do checklist guarda o valor com a unidade (°C, bar, kW, BTU/h), sem conversão automática.

**Fora do escopo inicial.** Glossário do setor e revisão por nativos ficam de fora, como risco aceito. São os primeiros itens a retomar quando houver usuário real em espanhol ou francês.

## Arquitetura de internacionalização

Uma biblioteca de mensagens no padrão ICU atende web, PWA e servidor, com os catálogos num pacote compartilhado do monorepo. A stack aprovada (NestJS, React, Vite, PWA) não muda; entram bibliotecas e regras de código.

| Camada | Escolha proposta | Por quê |
| --- | --- | --- |
| Mensagens | FormatJS: react-intl na web e no PWA, @formatjs/intl no NestJS, sintaxe ICU | Plural, gênero e seleção corretos nos quatro idiomas, com a mesma sintaxe no front e no back |
| Catálogos | JSON por idioma num pacote do monorepo; chaves semânticas como `chamado.lista.titulo`; extração automática pelo CLI | Uma fonte só para telas, e-mails e PDFs |
| Datas e fusos | `Intl.DateTimeFormat` com o fuso do hotel; Luxon no servidor para o cálculo de SLA | Fuso IANA e horário de verão tratados pela biblioteca, não pelo time |
| Números e moeda | `Intl.NumberFormat` com moeda ISO 4217 | O formato regional define os separadores: 1.234,56 no Brasil, 1,234.56 nos EUA e no México |
| Carregamento | Catálogo do idioma sob demanda; o PWA leva o do usuário junto com o app | Trocar de idioma sem sinal fica fora do escopo inicial |
| API | Erros e validações devolvem código e parâmetros, nunca frase pronta | Quem exibe a mensagem é quem traduz |
| Login | Telas de login do Keycloak ou do Auth0 nos quatro idiomas | É a primeira tela que o usuário vê |
| Layout | Componentes sem largura fixa para rótulos; atributo `lang` no HTML; seletor de data por idioma | Francês e espanhol alongam rótulos em relação ao inglês e quebram botões estreitos no celular |

**Ordem de resolução do idioma**

1. Escolha do usuário no perfil.
2. Idioma padrão do hotel, para quem atua num hotel só.
3. Idioma padrão do tenant.
4. Idioma do navegador, antes do login.
5. pt-BR.

**Regras de código.** A revisão de código recusa texto visível fixo em componente, concatenação de frases e formatação manual de data ou número. Um linter (`eslint-plugin-formatjs`) e a pipeline fazem essa checagem automaticamente.

i18next com plugin ICU é alternativa equivalente ao FormatJS; a escolha fica na fase 0. ICU e catálogo compartilhado entre front e back não são negociáveis.

## Modelo de dados e SQL

O modelo ganha uma tabela global de idiomas e colunas de idioma, formato regional, país, fuso e moeda em tenant, hotel e usuário. Não há campo traduzível: conteúdo cadastrado fica no idioma em que foi escrito, e os textos fixos moram no catálogo do produto, fora do banco.

**Idiomas, formato regional, país, fuso e moeda**

```sql
-- idiomas do produto: global, só leitura para o usuário da aplicação
create table idioma (
  codigo text primary key,              -- catálogo de textos
  nome_nativo text not null,
  formato_padrao text not null,         -- formato regional padrão (BCP 47)
  fallback text references idioma,
  ativo boolean not null default false
);
insert into idioma (codigo, nome_nativo, formato_padrao, fallback, ativo) values
  ('pt-BR', 'Português (Brasil)', 'pt-BR',  null,    true),
  ('en',    'English',            'en-US',  'pt-BR', true),
  ('es',    'Español',            'es-419', 'en',    true),
  ('fr',    'Français',           'fr-FR',  'en',    true);

alter table tenant
  add column idioma_padrao text not null default 'pt-BR' references idioma,
  add column pais_sede char(2) not null default 'BR',
  add column moeda_padrao char(3) not null default 'BRL';

alter table hotel
  add column pais char(2) not null default 'BR',   -- ISO 3166-1
  add column subdivisao text,                       -- ISO 3166-2: BR-PR, BR-MT
  add column fuso_horario text not null,            -- IANA: America/Cuiaba; sem default de propósito
  add column idioma_padrao text references idioma,
  add column moeda char(3);

alter table usuario
  add column idioma text references idioma,         -- nulo: herda do hotel ou do tenant
  add column formato_regional text,                 -- nulo: formato_padrao do idioma
  add column fuso_horario text;                     -- nulo: fuso do hotel ou do tenant

create function valida_fuso() returns trigger language plpgsql as $$
begin
  if new.fuso_horario is not null
     and not exists (select 1 from pg_timezone_names where name = new.fuso_horario) then
    raise exception 'fuso horário inválido: %', new.fuso_horario;
  end if;
  return new;
end $$;
create trigger hotel_valida_fuso before insert or update of fuso_horario on hotel
  for each row execute function valida_fuso();
create trigger usuario_valida_fuso before insert or update of fuso_horario on usuario
  for each row execute function valida_fuso();
```

**Busca sem acento**

```sql
-- útil já em pt-BR: "manutencao" encontra "manutenção"
create extension if not exists unaccent;

create function sem_acento(txt text) returns text
language sql immutable set search_path = pg_catalog, public as $$
  select public.unaccent('public.unaccent'::regdictionary, coalesce(txt, ''))
$$;

alter table chamado add column busca tsvector generated always as
  (to_tsvector('simple'::regconfig, sem_acento(descricao))) stored;
create index chamado_busca_idx on chamado using gin (busca);
```

**Regras que a API garante.** O formato regional vem de uma lista fixa (pt-BR, en-US, en-GB, es-419, es-ES, es-MX, es-AR, es-CO, es-CL, fr-FR, fr-CA, fr-BE, fr-CH). Status, prioridade e tipo são gravados como código e traduzidos na exibição; a auditoria guarda códigos e valores, nunca frases. Dinheiro, quando chegar com custos na fase 2, sempre vem com `moeda char(3)` ao lado do valor.

## O que se traduz e o que não se traduz

Traduz-se o que está fixo no sistema: textos das telas e mensagens padrão. O que foi cadastrado ou digitado fica como foi escrito, e tudo o que sai do servidor segue em pt-BR por enquanto.

| Conteúdo | Tradução inicial | Observação |
| --- | --- | --- |
| Rótulos de campos, menus, botões, títulos e textos de ajuda | Sim, nos quatro idiomas | Catálogo ICU |
| Validações, erros, confirmações, avisos e estados vazios | Sim | A API devolve código; a tela traduz |
| Status, prioridades e tipos padrão | Sim | Código no banco, rótulo no catálogo; prioridade renomeada pela rede aparece como a rede escreveu |
| Telas de login do provedor de identidade | Sim | Tema do provedor |
| Conteúdo cadastrado: categorias, modelos de ativo, checklists, planos | Não | Fica no idioma em que foi escrito |
| Nomes de hotel, local, UH e ativo | Não | Nome próprio |
| Texto livre: chamados, comentários, observações da OS | Não | — |
| Anexos | Não | Arquivo original |
| E-mail e push | Não, saem em pt-BR | Textos já no catálogo, para traduzir depois sem reescrever os modelos |
| PDF da OS, exportações e etiquetas QR | Não, saem em pt-BR | Mesmo tratamento; datas no fuso do hotel |
| Termos de uso e política de privacidade | A definir | Pendência jurídica, se houver usuário em outro idioma |

O único cuidado que vale já para as saídas em pt-BR é escrever os textos no mesmo catálogo das telas. O custo agora é quase zero, e evita reescrever cada modelo de e-mail quando alguém pedir outro idioma.

## Fuso horário, calendário e SLA

SLA, horário de atendimento e geração de preventiva são calculados no fuso do hotel, e isso já é necessário no Brasil: hotéis em Cuiabá, Rondonópolis e Porto Velho estão uma hora atrás de Brasília. Na Europa entra o horário de verão, com dias de 23 e 25 horas duas vezes por ano.

- **Armazenamento:** todo instante em `timestamptz`, em UTC. O fuso IANA do hotel diz como mostrar e como calcular.
- **Horário de atendimento:** definido em hora local do hotel ("segunda a sexta, 8h às 18h"), nunca como deslocamento fixo em relação ao UTC.
- **SLA em horas úteis:** calculado percorrendo o calendário local do hotel com Luxon, com testes nas trocas de horário de verão de Lisboa, Madri, Paris e Berlim.
- **Preventiva:** "todo dia 1 às 8h" é 8h no relógio do hotel.
- **Visão consolidada:** a central vê cada registro na hora local do hotel, com o fuso indicado; "vence hoje" usa o dia local de cada hotel.
- **Formato de hora e semana:** 24 horas em todos os idiomas, exceto inglês americano, que usa 12; o primeiro dia da semana vem do idioma.

**Feriados.** O calendário de feriados é territorial, como a jurisdição da Conformidade: a EasyGov mantém os feriados nacionais e regionais por país, e cada hotel acrescenta os municipais e os próprios. A política de SLA (grupo → bandeira → hotel) diz apenas se feriado conta como dia útil.

```sql
-- global, mantida pela EasyGov
create table feriado (
  id uuid primary key default gen_random_uuid(),
  pais char(2) not null,
  subdivisao text,                 -- nulo: nacional
  data date not null,
  nome_i18n jsonb not null,
  unique nulls not distinct (pais, subdivisao, data)
);

-- do tenant, com RLS por hotel como as demais tabelas de negócio
create table hotel_feriado (
  tenant_id uuid not null,
  hotel_id uuid not null references hotel,
  data date not null,
  nome text not null,
  primary key (hotel_id, data)
);
```

## Processo de tradução e custos

Três idiomas são traduzidos a partir do pt-BR, num volume de 10 a 17 mil palavras de telas e mensagens. Com quatro idiomas, arquivos JSON no repositório bastam no início; uma ferramenta de tradução só se paga quando entrarem tradutores externos ou mais idiomas.

**Fluxo por versão**

1. O desenvolvedor cria a chave em pt-BR com contexto: onde aparece e limite de caracteres.
2. A tradução automática pré-preenche en, es e fr; alguém fluente do time revisa quando possível.
3. O build usa só chaves aprovadas; chave sem tradução em espanhol ou francês cai no inglês e entra no relatório de pendências.
4. **Definição de pronto:** pt-BR e inglês completos para ir a produção; espanhol e francês na mesma versão sempre que houver usuário ativo nesses idiomas.

| Item | Premissa | Ordem de grandeza |
| --- | --- | --- |
| Tradução profissional: en, es, fr | 10 a 17 mil palavras × 3 idiomas, R$ 0,25 a R$ 0,50 por palavra com pós-edição | R$ 8 mil a R$ 26 mil |
| Alternativa: tradução automática com revisão interna | Horas do time | Custo baixo, qualidade menor, dentro do risco aceito |
| Manutenção | 5% a 10% do volume por mês durante piloto e rollout | Recorrente |
| Ferramenta de tradução (Tolgee, Crowdin, Lokalise, Phrase) | Opcional no início | A cotar quando necessária |

Os valores são premissas para orçamento e precisam de cotação.

## Testes e qualidade

A pipeline barra texto fixo, chave faltando e mensagem ICU inválida; o resto se prova com pseudo-localização, testes de formato e testes de fuso. São sete verificações.

1. **Pseudo-localização em homologação:** idioma falso, com acentos e texto 35% mais longo, que denuncia texto fixo esquecido e quebra de layout.
2. **Barreiras na pipeline:** chave usada no código e ausente em pt-BR, mensagem ICU inválida, chave sem inglês e texto fixo apontado pelo linter reprovam o build.
3. **Formatação:** testes unitários de data, número e moeda em pt-BR, en-US, en-GB, es-419, es-MX e fr-FR, e de plural nos quatro idiomas.
4. **SLA com fuso:** hotéis em America/Cuiaba e America/Porto\_Velho; feriado municipal no meio do prazo; uma troca de horário de verão europeia, para quando houver hotel fora do Brasil.
5. **Teste visual:** telas principais e PWA em francês e espanhol, num celular de tela pequena.
6. **Fumaça por idioma:** login, abrir chamado e executar OS nos quatro idiomas.
7. **Busca:** "manutencao" encontra "manutenção".

## Pré-requisitos para vender fora do Brasil

Nenhum destes itens entra no MVP, mas todos precisam estar resolvidos antes do primeiro contrato com hotel fora do Brasil. Traduzir a interface não habilita a venda na Europa.

| Tema | O que exige | Observação |
| --- | --- | --- |
| Proteção de dados | Na União Europeia, GDPR: contrato de operador (art. 28), registro de atividades (art. 30), base legal para transferência internacional (capítulo V) e avaliação de representante na UE (art. 27). Na América Latina, a lei de cada país | O hotel é o controlador e a EasyGov, a operadora |
| Hospedagem | Região na UE para clientes europeus; cada tenant fixado numa região, sem consulta entre regiões | Muda a premissa P6 e a infraestrutura |
| Conformidade legal | Catálogo por país; jurisdição com país acima da subdivisão; curadoria local | Cada país é um projeto de conteúdo |
| Integração com sistemas hoteleiros | Adaptador para os sistemas usados em cada país; planilha como alternativa | O conector TOTVS CM atende o Brasil |
| Moeda, preço e faturamento | Preço em euro e em moedas locais; fatura de exportação de serviço; tributação do serviço prestado ao exterior | Pendência comercial e fiscal da EasyGov |
| Contratos e termos | Versão por idioma e lei aplicável definida | Jurídico |
| Suporte e implantação | Atendimento no idioma e no fuso do cliente; treinamento local | Custo operacional recorrente |
| Relações de trabalho | Na Alemanha, ferramenta capaz de monitorar desempenho de empregado depende de codecisão do conselho de empresa, onde houver; na França, de consulta prévia ao comitê social e econômico | O indicador por técnico desligado por padrão ajuda, mas não dispensa a negociação |
| IA de apoio (fase 2) | Avaliar o enquadramento no regulamento europeu de IA, Regulamento (UE) 2024/1689 | Antes de ligar IA para cliente europeu |

Os itens de proteção de dados e relações de trabalho pedem parecer jurídico local; o quadro acima é um mapa do que perguntar, não a resposta.

## Prazo e backlog

A engenharia custa 5 a 7 semanas-dev, das quais 1 a 1,5 de fuso e calendário que o Brasil já exige. Quatro idiomas em vez de dois quase não mudam a engenharia; o que muda é traduzir e verificar dois idiomas a mais antes de cada versão.

**Esforço de engenharia**

| Pacote de trabalho | Semanas-dev | Fase |
| --- | --- | --- |
| Fundação: bibliotecas, ICU, extração, pseudo-localização, barreiras na pipeline | 1 a 1,5 | 0 |
| Textos fixos e mensagens fora do código ao longo do desenvolvimento | 2 a 3 | 1a a 1c |
| Fuso e calendário por hotel no SLA e na preventiva | 1 a 1,5 | 1b e 1c |
| Formato regional, seletor de idioma, busca sem acento, login do provedor | 0,75 a 1 | 1a |

**Marcos, em semanas desde o início da fase 0**

| Marco | Plano aprovado | Quatro idiomas no piloto | Espanhol e francês só no rollout |
| --- | --- | --- | --- |
| Piloto começa | 19–24 | 20–27 | 20–26 |
| Idiomas ativos no piloto | 1 | 4 | 2 |
| Idiomas ativos no rollout | 1 | 4 | 4 |

**Backlog**

| ID | História | Critério de aceite | Fase |
| --- | --- | --- | --- |
| I18N-01 | Como usuário, escolho meu idioma no perfil | Quatro opções; troca sem sair da tela; vale na web e no PWA | 1a |
| I18N-02 | Como usuário, escolho meu formato regional | Padrão vem do idioma; lista fixa; datas e números mudam, textos não | 1a |
| I18N-03 | Como desenvolvedor, crio textos só por chave ICU | Pipeline reprova texto fixo, chave inexistente e ICU inválido | 0 |
| I18N-04 | Como QA, testo em pseudo-idioma | Homologação tem idioma falso com acentos e texto 35% mais longo | 0 |
| I18N-05 | Como usuário, vejo datas, números e moedas no meu formato | Intl em todas as telas; hora no fuso do hotel, com o fuso indicado quando for diferente do meu | 1a |
| I18N-06 | Como Admin do grupo, defino o fuso IANA de cada hotel | Fuso obrigatório e validado | 1a |
| I18N-07 | Como sistema, calculo SLA e preventiva no fuso local | Hotel em Cuiabá calcula uma hora atrás de Brasília; teste de horário de verão passa | 1c |
| I18N-08 | Como Admin do grupo, mantenho feriados por hotel | Feriados nacionais de fábrica; municipais e próprios pelo hotel | 1c |
| I18N-09 | Como usuário, vejo mensagens do sistema no meu idioma | A API devolve código; a tela traduz validações, erros e avisos | 0 |
| I18N-10 | Como usuário, vejo status e prioridades padrão no meu idioma | Rótulo pelo catálogo; nome personalizado pela rede aparece como foi escrito | 1a |
| I18N-11 | Como usuário, faço login no meu idioma | Telas do provedor de identidade nos quatro idiomas | 1a |
| I18N-12 | Como usuário, busco sem acento | "manutencao" encontra "manutenção" | 1a |
| I18N-13 | Como desenvolvedor, escrevo e-mails, push e PDFs pelo catálogo | Nenhum texto fixo em modelo de saída; tudo em pt-BR por enquanto | 1c |
| I18N-14 | Como produto, registro país, subdivisão e moeda | Colunas em tenant e hotel com valores padrão do Brasil; nenhum uso fora do Brasil no MVP | 0 |

## Riscos e pendências

No escopo decidido, os riscos são menores e quase todos já aceitos; o que mais pesa é o usuário em espanhol ou francês receber e-mail e PDF em português. A pendência que mais muda o plano é quem vai usar espanhol e francês no início.

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Termo técnico mal traduzido em espanhol ou francês | Usuário real não entende a OS | Risco aceito; glossário é o primeiro item a retomar |
| Usuário em outro idioma recebe e-mail, push e PDF em português | Estranheza; alerta de SLA ignorado | Textos já no catálogo; traduzir as saídas custa pouco quando houver pedido |
| SLA errado por fuso | Indicador perde credibilidade | Fuso IANA obrigatório; testes com hotéis em Cuiabá e Porto Velho |
| Tradução de três idiomas durante o piloto, sem usuário deles | Custo sem uso | Espanhol e francês prontos só para o rollout |
| Provedor de identidade sem os quatro idiomas | Login em inglês para o usuário francês | Critério de escolha na fase 0 |
| "Multi-idioma" entendido como operar fora do Brasil | Compromisso sem GDPR, hospedagem e suporte prontos | Pré-requisitos da seção de venda fora do Brasil |

**Pendências**

- [ ] Base dos textos: inglês americano, espanhol neutro latino-americano e francês da França (proposta).
- [ ] Quem usa espanhol e francês no início, e quando; define se entram no piloto ou só no rollout.
- [ ] Tradução profissional ou automática com revisão interna.
- [ ] Provedor de identidade (Keycloak ou Auth0) com os quatro idiomas.
- [ ] Termos de uso e política de privacidade: só pt-BR ou também nos outros idiomas.
- [ ] Objetivo de mercado: atender redes estrangeiras no Brasil, vender no exterior ou nenhum dos dois por enquanto.

## Registro de decisões

Este trecho substitui os dois anteriores sobre idiomas (as sete variantes e o escopo reduzido); cole só este. A numeração D-XX deve seguir a sequência do arquivo de contexto.

```markdown
| # | Data | Decisão | Motivo | Status |
|---|---|---|---|---|
| D-XX | 25/09/2026 | A plataforma nasce multi-idioma com quatro idiomas: pt-BR (idioma-fonte), inglês, espanhol e francês; português de Portugal e alemão ficam fora do lançamento e entram depois com custo só de tradução | Definição da EasyGov | Aprovada |
| D-XX | 25/09/2026 | Traduzir só textos fixos das telas e mensagens padrão do sistema; conteúdo cadastrado (categorias, modelos de ativo, checklists, planos) fica no idioma em que foi escrito | Reduzir custo mantendo o essencial | Aprovada |
| D-XX | 25/09/2026 | Datas, números e moeda formatados por idioma; fuso IANA por hotel, com SLA e preventiva calculados na hora local; calendário de feriados por hotel | Necessário já no Brasil (MT e RO) | Aprovada |
| D-XX | 25/09/2026 | Formato regional separado do idioma: quatro catálogos de texto e lista fixa de formatos (en-US, en-GB, es-419, es-ES, es-MX, fr-FR e outros), com padrão derivado do idioma | Evitar catálogos duplicados por país | Proposta |
| D-XX | 25/09/2026 | Fora do escopo inicial: e-mail, push, PDF, exportações e etiquetas (saem em pt-BR, com textos já no catálogo); glossário e revisão por nativos (risco aceito); troca de idioma sem sinal no PWA | Decisão de escopo | Aprovada |
| D-XX | 25/09/2026 | Internacionalização desde a fase 0: nenhum texto fixo no código, mensagens ICU (FormatJS ou i18next), catálogo compartilhado entre web, PWA e servidor, checagens na pipeline | Custo baixo agora, retrabalho alto depois | Proposta |
| D-XX | 25/09/2026 | Traduções mantidas pela EasyGov no catálogo do produto; o tradutor do navegador não faz parte da solução | Controle de qualidade e de formato | Proposta |
| D-XX | 25/09/2026 | Estimativa: 5 a 7 semanas-dev; piloto em 20–27 semanas com os quatro idiomas, ou 20–26 com espanhol e francês só no rollout; tradução inicial de R$ 8 mil a R$ 26 mil como premissa | Custo da decisão | Proposta — substitui o prazo de 19–24 semanas |
| D-XX | 25/09/2026 | País, subdivisão e moeda em tenant e hotel desde o MVP; operar fora do Brasil fica fora do MVP e é pré-requisito do primeiro contrato no exterior | Evitar migração sem antecipar escopo | Proposta |
| D-XX | 25/09/2026 | Suporte aos quatro idiomas vira critério de escolha do provedor de identidade | O login é a primeira tela | Proposta |
| D-XX | 25/09/2026 | Posicionamento de 23/09 mantido até a decisão de mercado | Não mudar decisão aprovada em silêncio | Proposta |
```
