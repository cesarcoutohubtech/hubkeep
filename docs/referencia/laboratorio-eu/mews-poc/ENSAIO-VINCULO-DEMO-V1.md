# Mews Demo → HubKeep-dev — ensaio pré-vínculo, sem gravação

**Estado (18/10/2026): implementação de preparação, não ativação.** Autorização do Cesar nesta conversa: **preparar código e testes** para uma integração Mews Demo e um hotel fictício de HubKeep-dev. Não autoriza gravação no HubKeep-dev, criação de vínculo persistido, chamada real à Mews, uso de tokens reais, cron nem sincronização automática.

## Evidências da fase anterior

- HubKeep-dev: migrações Mews 0054/0055/0056 presentes, pré-voo corrigido **32/32 OK**, verificado pelo operador.
- Painel admin `/admin/mews`: acesso administrativo exibiu corretamente **nenhum vínculo Mews ativo**; sessão de Gerente exibiu **sem permissão**, observado na validação visual.
- Laboratório Mews Demo: `configuration/get`, `resources/getAll`, `resourceBlocks/getAll` já tiveram primeiras páginas HTTP 200 em ensaio separado no Windows; isso **não comprova vínculo ou sincronização end-to-end**.

## O que este PR realmente implementa

`ensaio-vinculo-demo.mjs` compõe o cliente injetável e a projeção isolada `sincronizacao-preview.mjs` com `prepararLote` do contrato de checkpoint (somente memória). O fluxo, quando invocado em **teste offline**:

1. Exige tenant e hotel UUID, propriedade explícita, instante UTC e uma porta de verificação `consultarEscopo`.
2. **Antes de qualquer chamada à Mews**, essa porta precisa confirmar, para o mesmo tenant/hotel, hotel ativo, vínculo proposto revisado por Admin e não revogado, origem `mews-demo` e ausência de associação conflitante.
3. Exige que `configuration/get` retorne exatamente o **EnterpriseId autorizado**. Não depende de `enterprises/getAll` e não associa propriedade por nome.
4. Lê recursos/bloqueios por portas injetadas, normaliza apenas `Space` e bloqueios `OutOfOrder`/`InternalUse`, rejeita registros fora da propriedade, valida lote/digest canônico **sem fazer commit**.
5. Devolve **somente contagens agregadas e checkpoint candidato**, sem tenant/hotel/EnterpriseId/ResourceId/BlockId, nomes, hóspedes, Notes, credenciais ou payload bruto. Não exibe plano transacional e não possui porta de persistência.
6. Uma instância permite **apenas um ensaio bem-sucedido**, nega segunda chamada simultânea e não faz retries automáticos de rede.

A porta `consultarEscopo` está **deliberadamente sem implementação de banco**. Nos testes é um stub sintético, não uma prova de autorização. Para vincular um hotel real/fictício no dev, uma futura implementação deve executar a validação de escopo no servidor, por papel e RLS, e gravar apenas após outra autorização humana específica. A existência de `conferidoPorAdmin: true` na resposta de um stub não substitui a autenticação do HubKeep.

### Testes

```powershell
node --test docs/referencia/laboratorio-eu/mews-poc/ensaio-vinculo-demo.test.mjs
```

Doze casos offline: projeção sanitizada; Space/OutOfOrder/InternalUse; hotel inativo; ausência de validação/revogação; vínculo conflitante; tenant/hotel divergente; EnterpriseId divergente; resource fora do escopo; bloqueio sem recurso; data inválida; concorrência/reexecução/falha de rede; tombstones. O teste raiz `tests/mews-ensaio-demo.test.ts` executa esta suíte na CI geral, sem Docker, banco ou API externa.

## Próximos gates — NÃO executados neste PR

- [ ] Identificar um **hotel fictício de destino** do HubKeep-dev e comprovar vínculo ao tenant correto por consulta somente leitura.
- [ ] Confirmar com o Cesar a propriedade **Mews Gross Demo** e seu EnterpriseId retornado por `configuration/get` e a correspondência manual com o hotel fictício.
- [ ] Definir referência de cofre, acesso restrito, rotação e revogação. Nunca copiar tokens Mews ao banco, logs ou PR.
- [ ] Validar que a porta servidor `consultarEscopo` não aceita confirmação de vínculo vinda do navegador e exige autorização real do Admin do grupo.
- [ ] Planejar rollback e retenção dos metadados técnicos, além da revisão GDPR, antes de qualquer persistência.
- [ ] Solicitar autorização **separada e explícita** antes de criar `app.mews_vinculo` no DEV, gravar checkpoints/recurso/bloqueio ou executar a primeira consulta real.
- [ ] A implementação futura com o driver transacional deve rodar em processo controlado, sem rota pública nem cron, e não pode criar OS, alterar UH, status/licença nem escrever na Mews.

**Não executar `supabase db push`**, criar dados/fixtures no dev ou tentar fazer este PR aparecer no painel: é preparação e teste offline, não ativação de integração.
