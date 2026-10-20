# Termos dos catálogos

Versão 1, de 19/10/2026 (fase 1c, item 10). É o glossário de termos que o `docs/referencia/i18n-levantamento.md` deixou como "o primeiro item a retomar". Diz como cada conceito do HubKeep se escreve em cada idioma. Serve a quem cria uma chave nova e, depois, à tradução profissional, que pode trocar um termo aqui; o teste segue a troca.

O teste `packages/i18n/test/termos.test.ts` reprova as variantes da última coluna nos catálogos. As chaves `inteligencia.*` ficam de fora: os textos do Intelligence são do Kaio (ADR-033), e o pedido para alinhá-los está no diário da 1c.

| Conceito (pt-BR) | en | es | fr | Variantes barradas |
| --- | --- | --- | --- | --- |
| Chamado | request | solicitud | demande | en "ticket"; es "ticket"; fr "ticket" |
| Ordem de serviço (OS) | work order | orden de trabajo (OT) | ordre de travail (OT) | es "orden de servicio" e "OS"; fr "ordre de service" e "OS" |
| UH | room | habitación | chambre | — |
| Bandeira | brand | marca | enseigne | — |
| Fornecedor | supplier | proveedor | fournisseur | fr "prestataire" |
| Locador (arrendado) | lessor | arrendador | bailleur | en "landlord" |
| Arrendatária | lessee | arrendataria | preneur | en "tenant operator" |
| Ativo | asset | activo | équipement | — |
| Aceite | acceptance | aceptación | acceptation | — |

**Escolha do termo:** o que a maioria das telas já usava em 19/10/2026. As exceções:
- **"lessor" e "lessee":** formam o par jurídico do arrendamento. "Tenant" também é o nome técnico do grupo no produto, e "tenant operator" confundia.
- **"OT" em espanhol e francês:** a sigla segue o termo por extenso da maioria ("orden de trabajo", "ordre de travail").

**Volume para a cotação da tradução profissional** (pt-BR, 19/10/2026): 1.557 chaves e cerca de 9.400 palavras. São 7.000 do núcleo e 2.400 do Intelligence. A estimativa do levantamento era de 10 a 17 mil palavras.
