# Proposta: ponto de extensão nas políticas do núcleo

**Situação:** proposta de 06/10/2026, escrita pelo agente do Kaio para o Cesar. Nada foi aplicado. É ADR do núcleo: o texto do ADR, o código e o PR são do agente do núcleo, se o Cesar aprovar.

## Problema

O Intelligence tem cinco políticas, cada uma com formato, padrão e validação em `packages/inteligencia/src/politicas.ts` (ADR-035):
- `inteligencia.reincidencia`;
- `inteligencia.atencao_ativo`;
- `inteligencia.efetividade`;
- `inteligencia.sistemico`;
- `inteligencia.substituicao`.

O núcleo não aceita essas chaves:
- `validarPolitica` recusa a chave que não está em `POLITICAS` (`politica_desconhecida`). A tela de configuração e o `gravarPolitica` passam por ele.
- O núcleo não pode importar `@hubkeep/inteligencia` (ADR-037, lint de fronteiras), então não dá para pôr as chaves no `POLITICAS`.
- A resolução do núcleo vai do hotel para o grupo, sem passar pela bandeira. O ADR-035 pede hotel → bandeira → grupo.

## Proposta

1. **Registro de extensões no domínio do núcleo,** sem conhecer chave nenhuma de módulo:

   ```ts
   // packages/dominio/src/politicas.ts (núcleo)
   export interface ExtensaoDePolitica {
     /** Prefixo reservado ao módulo, com o ponto: 'inteligencia.'. */
     prefixo: string;
     chaves: readonly string[];
     padrao(chave: string): unknown;
     valido(chave: string, valor: unknown): boolean;
   }
   export interface RegistroDePoliticas {
     ehChave(chave: string): boolean;
     validar(chave: string, valor: unknown): unknown;
     resolver(chave: string, niveis: { hotel?: unknown; bandeira?: unknown; grupo?: unknown }): unknown;
     chaves(): readonly string[];
   }
   export function registroDePoliticas(extensoes: readonly ExtensaoDePolitica[]): RegistroDePoliticas;
   ```

   - As chaves do núcleo continuam em `POLITICAS`, tipadas como hoje.
   - Uma extensão só registra chave que comece com o prefixo dela.
   - O prefixo não pode coincidir com o de uma chave do núcleo (`os.`, `chamado.`, `ativo.`) nem com outro prefixo.
   - Registro inválido lança na partida do servidor, nunca em request.
   - Os códigos de erro continuam `politica_desconhecida` e `politica_valor_invalido`, que já estão nos catálogos.
2. **Os casos de uso de configuração recebem o registro como dependência** (`deps.politicas`), no lugar de ler `POLITICAS` direto. Sem extensão, o registro tem só as chaves do núcleo e o comportamento não muda.
3. **A composição do web monta o registro.** No servidor, junta as chaves do núcleo com a extensão que o `packages/inteligencia` exporta (`EXTENSAO_DE_POLITICAS_DO_INTELLIGENCE`, montada a partir de `PADROES_DO_INTELLIGENCE` e `valorValidoDoIntelligence`). O tenant sem o Intelligence contratado não vê nem grava essas chaves: o filtro fica no caso de uso, pela configuração do tenant.
4. **A resolução passa a ler a bandeira:** hotel → bandeira → grupo → padrão, como o ADR-026 já prevê e a tabela `app.politica` já comporta (`bandeira_id`). A mudança vale para as chaves do núcleo também. As duas que existem hoje não têm valor de bandeira gravado, então nada muda para elas.
5. **Quem grava:** continua só o Admin do grupo (`podeGerirPoliticas`), para todas as chaves, como o ADR-035 decidiu.
6. **Contrato da API:** o schema Zod da política passa a aceitar chave de extensão como texto com prefixo registrado. O formato do valor é conferido pelo registro no caso de uso, não pelo Zod. O teste `tests/contratos-dominio.test.ts`, que compara os dois, fica só para as chaves do núcleo.

## Sem migração

`app.politica.chave` é texto e já aceita qualquer chave. Não há função nem trigger novos.

## Pré-requisito comum: a liberação no lint

A proposta depende de a composição do web importar `@hubkeep/inteligencia`. O caso de uso do job diário também depende disso, porque a ligação com o `packages/db` fica no servidor do web. Hoje o lint recusa, inclusive no `apps/web/src/servidor`:

```
O núcleo não importa @hubkeep/inteligencia: o módulo depende do núcleo, nunca o contrário  boundaries/dependencies
```

O `eslint.config.mjs` já anuncia a saída: "A rota do próprio Intelligence, quando existir, ganha uma liberação explícita". A proposta é uma liberação estreita:
- um elemento novo, por exemplo `web-modulo-inteligencia`, com o padrão `apps/web/src/servidor/modulos/inteligencia`;
- só ele importa `@hubkeep/inteligencia`, junto com o que o `web-servidor` já importa;
- o resto do servidor, as rotas e os pacotes do núcleo continuam proibidos de importar o módulo;
- o servidor chega ao módulo por uma única função de montagem, que devolve o registro de políticas e o caso de uso do job.

Desligar o módulo continua sendo tirar essa pasta da composição: nenhum outro arquivo do núcleo depende dele.

O `eslint.config.mjs` é zona protegida, então a liberação é decisão do Cesar e PR do agente do núcleo. Pode ir no mesmo PR do ponto de extensão.

## A decidir pelo Cesar

1. Aprovar o ponto de extensão como ADR do núcleo.
2. Aprovar a liberação estreita do lint, ou outro caminho para o servidor chegar ao módulo.
3. Quando a resolução pela bandeira entra: junto com o ponto de extensão, ou na 1c com o SLA, como o comentário de `politicas.ts` prevê.
