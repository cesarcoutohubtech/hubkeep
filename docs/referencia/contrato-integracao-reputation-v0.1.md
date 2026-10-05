# Contrato de integração HubKeep ↔ Reputation

> **Descontinuado** (Cesar, 30/09/2026; marcado em 05/10/2026). O Reputation deixou de ser um produto separado, e este contrato fica arquivado como estava, sem valor de acordo. O feedback do hóspede entra pelo HubKeep Intelligence (`docs/referencia/prd-hubkeep-intelligence-v1.md`, versão 1.5). As tarefas IX1 a IX3 do `docs/05` continuam valendo para o EasyTools e para a entrada futura de feedback externo.

**Versão:** 0.1 (proposta)
**Data:** 30/09/2026
**Produtos:** HubKeep (manutenção) e Reputation, da Suíte SCS
**Responsáveis:** Cesar Couto (HubKeep) e Kaio Cesar (Reputation)
**Onde fica:** uma cópia idêntica em `docs/referencia/` de cada repositório. Mudanças exigem aprovação dos dois responsáveis e atualização das duas cópias no mesmo dia.

---

## 1. Princípios

1. Cada produto funciona sozinho. A integração só acrescenta capacidade.
2. Nenhum produto lê ou grava no banco do outro. Toda troca passa por API e eventos.
3. O Reputation é dono do feedback, do caso e da resposta. O HubKeep é dono do chamado, da OS, da execução e das evidências técnicas.
4. O HubKeep decide prioridade, prazo e atribuição do chamado pelas políticas dele. O Reputation só sugere severidade e categoria.
5. Nenhum dado pessoal de hóspede ou autor de avaliação trafega entre os produtos.
6. Toda mensagem é idempotente, assinada e versionada.

---

## 2. Pareamento entre tenants e unidades

Os produtos têm bancos e identificadores próprios. A correlação é explícita:

1. O Admin do Reputation gera uma **solicitação de pareamento** para o tenant do HubKeep.
2. O Admin do grupo no HubKeep aprova a solicitação. Isso cria, do lado do HubKeep, uma **credencial de integração** do tenant, com o segredo exibido uma única vez e guardado só como hash, no mesmo modelo da credencial do agente conector.
3. O Reputation registra, do lado dele, o **segredo de assinatura dos webhooks** recebidos do HubKeep.
4. O Admin do Reputation vincula cada unidade a um hotel do HubKeep. O vínculo fica **só no Reputation** (`unidade_id` ↔ `hubkeep_hotel_id`).
5. Desfazer o pareamento revoga a credencial e para a entrega de eventos. Nada é apagado.

---

## 3. Reputation → HubKeep: pedido de chamado

### 3.1 Rota do HubKeep

```text
POST /api/v1/integracoes/chamados
Authorization: Integracao hk_int_<tenant>_<segredo>
Idempotency-Key: <uuid do pedido>
```

A credencial de integração só permite duas ações: criar chamado com origem externa e ler a situação dos chamados que ela mesma criou.

### 3.2 Corpo

```json
{
  "versaoContrato": "0.1",
  "hotelId": "uuid do hotel no HubKeep",
  "localReferencia": "1204",
  "ativoId": null,
  "categoriaSugerida": "CLIMATIZACAO",
  "severidadeSugerida": "ALTA",
  "descricao": "Hóspede relata ar-condicionado ruidoso na UH 1204.",
  "origem": {
    "sistema": "REPUTATION",
    "casoId": "uuid do caso no Reputation",
    "fonte": "GOOGLE"
  }
}
```

- `localReferencia` é o número da UH ou o nome da área, quando conhecido. O HubKeep tenta associar a um local; se não conseguir, abre o chamado no hotel, sem local, para a triagem resolver.
- `ativoId` só é enviado quando o Reputation tiver um identificador de ativo obtido do próprio HubKeep.
- `descricao` é um resumo do problema. **Nunca** leva o nome do autor, o texto integral da avaliação, dados de reserva nem outro dado pessoal.

### 3.3 Resposta

```json
{ "chamadoId": "uuid", "situacao": "ABERTO", "criadoEm": "2026-09-30T14:02:11Z" }
```

Erros no formato padrão do HubKeep: `{ "erro": { "codigo": "...", "parametros": {...}, "requestId": "..." } }`. Códigos esperados: `credencial_invalida` (401), `hotel_nao_pareado` (403), `entrada_invalida` (422), `limite_de_pedidos` (429).

O mesmo `Idempotency-Key` devolve o mesmo chamado, sem criar outro.

---

## 4. HubKeep → Reputation: eventos de andamento

### 4.1 Entrega

```text
POST https://<endereço do Reputation>/api/v1/integracoes/hubkeep/eventos
X-HubKeep-Assinatura: <HMAC-SHA256 do corpo com o segredo do pareamento>
X-HubKeep-Evento-Id: <uuid>
```

- Enviado pela fila de eventos do HubKeep, depois da gravação (outbox).
- Nova tentativa com espera crescente enquanto a resposta não for 2xx.
- O Reputation descarta eventos repetidos pelo `X-HubKeep-Evento-Id`.
- Eventos podem chegar fora de ordem. O Reputation usa o campo `versao` do chamado para ignorar um estado mais antigo que o que já conhece.

### 4.2 Eventos

| Evento | Quando |
|---|---|
| `hubkeep.chamado.criado` | Chamado criado a partir do pedido |
| `hubkeep.chamado.triado` | Triagem confirmou ou ajustou a prioridade |
| `hubkeep.os.atribuida` | OS atribuída a técnico ou equipe |
| `hubkeep.os.em_execucao` | Execução iniciada |
| `hubkeep.os.concluida` | Técnico concluiu; aguarda aceite |
| `hubkeep.chamado.aceito` | Aceite registrado: o problema está resolvido |
| `hubkeep.chamado.reaberto` | Aceite recusado; a OS voltou |
| `hubkeep.chamado.cancelado` | Chamado cancelado, com motivo |

### 4.3 Corpo

```json
{
  "versaoContrato": "0.1",
  "evento": "hubkeep.chamado.aceito",
  "eventoId": "uuid",
  "ocorridoEm": "2026-10-02T16:40:00Z",
  "tenantHubKeep": "uuid",
  "chamado": {
    "id": "uuid",
    "versao": 7,
    "situacao": "CONCLUIDO",
    "prioridade": "ALTA",
    "prazoEm": "2026-10-02T18:00:00Z",
    "origemCasoId": "uuid do caso no Reputation"
  },
  "resumo": "Filtro trocado e ruído eliminado.",
  "equipamentoParadoMinutos": 43
}
```

`resumo` é um texto operacional curto, escrito por quem executou, sem dado pessoal. Só o evento `hubkeep.chamado.aceito` autoriza o Reputation a tratar o problema como resolvido numa resposta ao cliente.

---

## 5. Versionamento e ambientes

- Toda mensagem leva `versaoContrato`. Mudança que quebra a compatibilidade gera uma versão nova, e as duas versões convivem durante a transição.
- Cada ambiente pareia com o ambiente equivalente do outro produto: dev com dev, staging com staging, produção com produção. Nunca produção com dev.
- Cada célula regional pareia só com a mesma célula.

---

## 6. Testes de contrato

- **Simulador do HubKeep**, no repositório do Reputation: recebe o pedido de chamado e emite a sequência de eventos, inclusive repetidos e fora de ordem.
- **Simulador do Reputation**, no repositório do HubKeep: envia pedidos válidos, inválidos e repetidos, e confere a assinatura e a reentrega dos eventos.
- Os dois simuladores usam os mesmos exemplos deste documento. Mudança no contrato exige mudança nos dois simuladores no mesmo par de PRs.

---

## 7. Cronograma

| Etapa | Onde | Quando |
|---|---|---|
| Aprovação do contrato por Cesar e Kaio | Os dois repositórios | Pendente |
| Simulador do HubKeep | Reputation | Na P1 do Reputation |
| Credencial de integração, rota de entrada e entrega de eventos | HubKeep | Depois do piloto do HubKeep |
| Teste integrado entre os dois dev | Os dois | Quando os dois lados estiverem prontos |

---

## 8. Pendências do contrato

- Limite de pedidos por tenant e por minuto.
- Se o Reputation poderá, no futuro, pedir chamado para áreas comuns identificadas só pelo nome, e como tratar a ambiguidade.
- Se um chamado pode receber mais de um caso de origem (várias avaliações sobre o mesmo problema).
- Rota futura para o Reputation consultar a lista de hotéis, locais e ativos do tenant pareado, para facilitar o vínculo de unidades.
