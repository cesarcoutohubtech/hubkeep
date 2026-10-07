# Proposta: UH indisponível no Intelligence

**Situação:** proposta de 07/10/2026, do agente do Kaio, **para aprovação**. Nenhum score a usa. Só a medida (`uhDiasPerdidos`, em `packages/inteligencia/src/uh.ts`) está escrita, pura e testada, e o `calcularDia` não a chama.

**Decisão de 07/10/2026 (aprovada por Kaio, aguardando Cesar):** os UH-dias perdidos são **componente da atenção do ativo**, e não sinal próprio. O **peso fica 0** até existir a origem do dado de UH indisponível (o período no chamado, 1b); com peso 0 a fórmula e a versão dela não mudam. Quando o dado existir e o peso passar de 0, a atenção ganha a versão seguinte da fórmula, com os pesos redistribuídos (ADR-034 e ADR-036). A recomendação de sinal próprio, abaixo, **não foi adotada**; o texto fica como registro das objeções (a UH sem ativo, e a conta em dobro com a parada e o impacto no hóspede), que a versão nova da fórmula precisa tratar.

**De onde vem o pedido:** a revisão do escopo de 07/10/2026 (`docs/referencia/HubKeep — Documento do projeto.md`) põe no MVP o período de UH indisponível no chamado e os UH-dias perdidos por manutenção. A pergunta ao Intelligence: esses UH-dias entram na atenção por ativo, ou num sinal próprio?

## Recomendação: sinal próprio, e não componente da atenção

Por quê:
1. **O dado é da UH, e não do ativo.** O chamado pode deixar a UH indisponível sem ativo nenhum (o chamado da tomada, sem ativo cadastrado), e uma UH parada pode envolver vários ativos ao longo do período. Atribuir tudo ao ativo do chamado deixa parte dos UH-dias sem dono e a outra parte inflada.
2. **Conta duas vezes o que a atenção já tem.** A atenção tem a parada do ativo (15%) e o impacto no hóspede (20%). A UH fora do ar porque o ar-condicionado parou já aparece nos dois. Um terceiro componente em cima do mesmo fato distorce o ranking.
3. **Mudar a atenção é mudar a fórmula.** Os pesos são os do PRD, aprovados no ADR-034. Um componente novo é a versão 2 da fórmula, com os pesos redistribuídos e as linhas já gravadas na versão 1 (e a leitura de duas versões lado a lado).
4. **O valor está em outro nível.** UH-dias perdidos serve a quem olha o hotel, a bandeira e a rede (onde a manutenção custa quarto vendável), e não a quem escolhe qual ativo investigar primeiro.
5. **A cobertura do dado é irregular.** Até o hábito de preencher o período pegar, muitos chamados vão ficar sem ele. Dado ausente não vira zero (ADR-034): num componente, o peso vai para os outros, e o ranking muda conforme quem preencheu. Num indicador separado, a ausência aparece como ausência.

## Como entraria

1. **A medida** (feita): `uhDiasPerdidos(periodos, de, ate, agora)`.
   - Soma, por UH, o tempo indisponível dentro do intervalo, dividido por 24 horas.
   - Períodos sobrepostos na mesma UH contam uma vez, e o período aberto conta até `agora`.
   - Quem chama filtra os períodos pelo escopo: um ativo, um hotel, uma bandeira ou a rede.
2. **No detalhe do ativo e do hotel:** o indicador aparece como fato, ao lado do score, na janela da reincidência do hotel (90 dias no padrão). Calculado na leitura, a partir da origem. Nada novo na tabela diária.
3. **Na visão de rede:** o `ResumoMensalDoHotel` ganha `uhDiasPerdidos`, gravado pelo job no fechamento do mês, junto com os outros resumos. É um campo novo da tabela do resumo mensal, que ainda não tem rascunho.
4. **Sem insight próprio no 1.0.** O ADR-033 aprovou dois tipos (atenção do ativo e sistêmico). Um terceiro, "UH indisponível acima do limite", seria revisão do ADR-033, com a política `inteligencia.uh_indisponivel` (limite de UH-dias em 30 dias por hotel) e a aprovação dos dois. Não proponho agora.

## A alternativa: componente da atenção

Se o Cesar e o Kaio preferirem o componente, o desenho é este:
- sétimo componente `uh_indisponivel`: `uhDias` do ativo na janela, dividido por um limite (por exemplo, 5 UH-dias em 90 dias) e limitado a 1;
- peso de 10%, tirado dos demais na proporção, e `VERSAO_ATENCAO = 2`;
- campo novo na `inteligencia.atencao_ativo` (`limiteUhDias`) e nos pesos;
- o chamado sem ativo fica de fora do componente (e só aparece no hotel).

Custo: versão 2 da fórmula, política nova, ADR-034 e ADR-035 revisados, e o risco da dupla contagem acima.

## O que precisa ser decidido

1. **Sinal próprio** (recomendado) ou **componente da atenção**.
2. **A janela** do indicador: a da reincidência do hotel (90 dias no padrão) ou uma própria.
3. **O fim do período:** o documento diz que a UH volta para inspeção quando a OS fecha. O fim do período é o fechamento da OS, o retorno da UH à operação, ou o que o hotel informa? Isso é desenho do agente do núcleo, e a medida usa o `fim` como vier.
4. **Chamado cancelado:** o período de um chamado cancelado conta? A proposta é que não.
5. **A integração com o EasyGov** (primeira entrega depois do MVP) vai reconciliar o status da UH. Quando ela vier, o período passa a ter outra fonte, e a medida não muda.

## Nomes

Os nomes das colunas do período no chamado vêm das propostas de desenho do agente do núcleo. `PeriodoDeUhIndisponivel` é a forma mínima que o motor lê (UH, chamado, ativo opcional, início e fim); a camada que lê o banco a monta.
