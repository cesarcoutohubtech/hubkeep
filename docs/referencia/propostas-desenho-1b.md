# Propostas de desenho dos itens novos da 1b

**Situação:** proposta de 08/10/2026, do agente do núcleo, para a aprovação do Cesar. Nada disto está implementado. Os itens vêm da revisão de 07/10/2026 (`docs/referencia/documento-projeto.md`) e entram na etapa I e na etapa PB do `docs/12`. Cada item termina com as perguntas que pedem a sua decisão.

Valem para todos: regra 7 (exigência vira política), tabela nova com o modelo do `docs/02` e os seis casos de isolamento, texto pelo catálogo nos quatro idiomas, gravação pela unit of work com auditoria, e operação do técnico pela fila offline.

## 1. Modelo contratual do hotel e edificação do local (I2)

- **Modelo contratual:** coluna `app.hotel.modelo_contratual`, anulável, com `check` em `proprio`, `administrado`, `arrendado` e `afiliado`. Os valores canônicos ficam no domínio, com teste de paridade.
  - **Nulo quer dizer "não informado".** Os hotéis existentes ficam nulos, e o painel de implantação mostra a pendência. Um padrão como "próprio" esconderia o erro.
  - **Quem grava:** o Admin do grupo, na configuração do hotel. O conector não mexe na coluna.
  - **No MVP, só rótulo e filtro.** O comportamento por modelo (a matriz do arrendado) vem na 1c. O afiliado é aceito como valor, sem comportamento.
- **Edificação:** coluna `app.local.edificacao`, texto opcional de até 60 caracteres, como o `andar`.
  - Vale para UH e área comum. Na UH que vem do sistema hoteleiro, a edificação é editável no HubKeep, porque o CM não a tem, e o conector não a sobrescreve.
  - A tela sugere as edificações que já existem no hotel, para evitar "Torre A" e "torre a". Entra na busca do local.

**Decisões:**
1. Nulo como "não informado", sem padrão? (proposta: sim)
2. Edificação em texto com sugestão, ou uma tabela de edificações por hotel? (proposta: texto)

## 2. Fornecedor mínimo (I3)

- **Tabela `app.fornecedor`,** do grupo, e não do hotel: nome, CNPJ opcional (único no grupo quando informado, com o dígito conferido no domínio), contato (nome, telefone e e-mail, todos opcionais) e desativação lógica.
- **Leitura:** quem lê algum hotel do grupo, exceto o proprietário.
- **Cadastro:** o Admin do grupo, o Gestor CSC e o Gerente do hotel. O Gerente cadastra o fornecedor local, que fica visível para o grupo.
- **Fora do MVP:** portal, contrato, avaliação, custos e alçadas (fase 2).
- O contato é dado pessoal mínimo. Entra na auditoria como qualquer cadastro.

**Decisões:**
3. Fornecedor do grupo, com cadastro também pelo Gerente do hotel? (proposta: sim)

## 3. UH indisponível e UH-dias perdidos (parte nova da I4)

- **Mesmo modelo da parada do ativo (C5):** tabela `app.uh_indisponivel`, com a UH (`local_id` de tipo UH), o chamado, o início e o fim. A gravação é só de inserção e de encerramento.
  - Vários períodos por UH são aceitos, e o sobreposto conta uma vez.
  - O chamado de área comum não tem período.
- **Início:** a pergunta "a UH ficou indisponível?" na abertura, no web e no PWA, com a hora da abertura como padrão. A triagem pode marcar depois.
- **Fim:** "UH liberada", marcado por quem conclui a OS (no PWA, na conclusão) ou pela gestão do hotel, a qualquer momento. O fechamento da OS não fecha o período sozinho: a UH pode voltar antes ou depois.
- **Chamado cancelado:** o período aberto é encerrado no cancelamento e não conta nos UH-dias (o mesmo que o agente do Kaio propôs).
- **UH-dias perdidos:** função pura no `packages/dominio`, usada no indicador da 1c e lida pelo Intelligence. A medida do Kaio (`uhDiasPerdidos`) passa para o núcleo, porque o núcleo nunca importa o módulo.
- **Sistema hoteleiro:** nada é escrito. O bloqueio da UH no PMS só com mecanismo homologado. A reconciliação vem com o EasyGov, depois do MVP.

**Decisões:**
4. Fim do período marcado por quem conclui ou pela gestão, e não automático na conclusão? (proposta: sim)
5. Chamado cancelado fora dos UH-dias? (proposta: sim)

## 4. Foto antes ou depois e assinatura no aceite (I8)

- **Foto:** coluna `app.anexo.momento`, anulável, com `check` em `antes` e `depois`, só para anexo de OS.
  - No PWA, a foto tirada com a OS não iniciada sugere "antes"; em execução ou concluída, "depois". O técnico pode trocar.
  - As fotos existentes ficam sem momento.
- **Política `os.foto_depois_obrigatoria`,** por hotel, desligada por padrão. Ligada, a conclusão pede ao menos uma foto "depois". A conclusão sem rede continua possível, e a foto vai pela fila.
- **Assinatura:** desenhada na tela, no aceite (web), por quem aceita, que é o usuário logado.
  - Gravada como anexo da OS do tipo `assinatura`, imutável, com o nome e a hora de quem aceitou.
  - O aceite guarda o id da assinatura.
  - É evidência do aceite, e não assinatura digital com valor jurídico (ICP-Brasil).
- **Política `os.assinatura_no_aceite`,** por hotel, desligada por padrão.

**Decisões:**
6. Assinatura só no aceite, e não na conclusão do técnico? (proposta: só no aceite, como no documento)
7. As duas exigências como políticas desligadas por padrão? (proposta: sim)

## 5. Pacote da bandeira (PB1)

- **Depende de** modelos por categoria (M1), checklist (P1) e planos preventivos (P2). Por isso vai depois deles, e não antes da M1 como estava no plano. Ver a decisão 9.
- **Sem tabela de "pacote":** modelos de ativo, checklists e planos por categoria ganham `bandeira_id` opcional. Nulo quer dizer que o item vale para o grupo inteiro.
- **"Aplicar o pacote ao hotel":**
  - modelos e checklists são do tenant e só ficam filtrados pela bandeira do hotel, sem cópia;
  - os planos preventivos por categoria são copiados para o hotel, já que o plano é do hotel. A cópia segue o ADR-026: mudar o pacote não altera o hotel já implantado;
  - reaplicar só acrescenta o que falta e nunca sobrescreve;
  - os planos copiados nascem pausados, como na M1, e a gestão do hotel ativa quando os ativos estiverem cadastrados.
- **Quem faz:** o Admin do grupo mantém o pacote; o Implantador aplica, pelo painel de implantação, que mostra a pendência "pacote aplicado".
- **Meta de 1 dia:** o painel registra quando o hotel entrou em implantação e quando ficou pronto, para medir o critério do piloto. O levantamento de ativos não conta.
- As políticas por bandeira já estão na 1c (nível bandeira) e não fazem parte da cópia.

**Decisões:**
8. Pacote como itens marcados com a bandeira, sem tabela própria? (proposta: sim)
9. A etapa PB vai depois da M1, e não antes da etapa M? (proposta: sim; o `docs/12` muda junto com a aprovação)
