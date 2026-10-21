# Proposta: SP3, limite de requisições (21/10/2026)

**Status:** proposta, para o portão do staging. Nada daqui foi implementado.

O Cesar decidiu em 21/10/2026 que a SP3 e a contratação do Vercel Pro ficam para o portão do staging, no fim da 1c. Até lá, só existe o dev, sem endereço publicado. Este desenho existe para a decisão ser rápida quando o portão chegar.

**De onde vem:** condição 4 do ADR-032, SP3 no `docs/05` e P1 no `docs/09`. A P1 já tem as superfícies, as chaves, os limites iniciais e os custos; isto aqui é o plano de implantação em cima dela.

**Aceite do `docs/05`:** a decisão registrada em ADR, com o custo, e o limite ativo nas rotas escolhidas, com o teste do 429.

## 1. Recomendação

É a da P1, em três camadas:

| Camada | Ferramenta | Onde | Custo no piloto |
|---|---|---|---|
| Borda | Vercel Firewall (regras de rate limit) | `/auth/*` e a ingestão, por IP | Pelo Vercel Pro, que o staging já exige |
| Aplicação | Upstash Redis (`@upstash/ratelimit`), região São Paulo | Na `rota()`, por usuário e tenant, depois do token verificado | Plano grátis no volume do piloto; ≈ US$ 20 por mês com 1.000 usuários ativos |
| Auth | Limites do Supabase e, se houver ataque, CAPTCHA (Turnstile) | Login com senha, por IP | Zero |

## 2. Na aplicação

- **Porta nova** (`packages/aplicacao`): `PortaLimite.consumir(chave, regra)` devolve `{ permitido, restante, reiniciaEm }`.
  - A implementação do Upstash fica no `apps/web/src/servidor`, perto da composição.
  - Os testes usam uma implementação em memória.
  - A aplicação não importa o cliente do Upstash.
- **As regras do domínio:** as faixas da P1 (escrita, leitura, sincronização, URL assinada, convites e ingestão) ficam numa tabela no código, por tipo de rota. A `rota()` declara o tipo dela, e o padrão é leitura para `GET` e escrita para os outros métodos.
- **A chave é por usuário e tenant, depois do token verificado** (por que, na P1). Na ingestão, é o prefixo da credencial, antes de ler o corpo.
- **A resposta acima do limite:**
  - 429 com o código `limite_de_pedidos` e os parâmetros `{ tentarEm }`, que já está previsto no IX2;
  - o cabeçalho `Retry-After`;
  - a mensagem no catálogo, nos quatro idiomas;
  - o PWA trata o 429 como "tentar depois" na fila, sem perder a operação.
- **Se o contador falhar** (Upstash fora do ar):
  - fora de `/auth/*`, a requisição passa e o log registra `limite_indisponivel` em `warn`, como a P1 decidiu;
  - em `/auth/*`, o limite é da borda e do Auth, não da aplicação.
- **Variáveis novas** no `.env.example`: `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`.
  - Sem elas, o limite fica desligado, com o aviso no log da subida.
  - No dev e na CI, o limite é a implementação em memória, ligada só nos testes.

## 3. Na borda e no Auth

São configuração, não código:
- **Vercel Firewall:** duas regras, `/auth/*` (10 por minuto por IP) e a ingestão (60 lotes por minuto por IP). Elas ficam registradas no `docs/01` com o caminho no painel. Quem configura é o Cesar.
- **Supabase Auth:** revisar os limites no painel do staging e da produção, e registrar os valores no `docs/06`. O Turnstile fica pronto para ligar, mas desligado.

## 4. Testes

- **Domínio:** a tabela de regras, com cada tipo de rota na faixa certa.
- **Rota:**
  - com a porta em memória, a requisição acima do limite recebe 429 com `limite_de_pedidos`, o `Retry-After` e a mensagem do catálogo;
  - a de outro usuário no mesmo tenant não é afetada;
  - com o contador fora, a requisição passa e o log registra.
- **PWA:** o 429 na sincronização deixa a operação na fila para tentar depois.
- **No staging, uma vez:** uma rajada contra uma rota de leitura com um usuário do kit, para conferir o 429 de ponta a ponta. A rajada contra `/auth/sessao` confere a regra da borda.

## 5. Como entra, no portão do staging

1. **O Cesar contrata** o Vercel Pro (já no plano do staging) e cria o Upstash pela integração da Vercel, na região São Paulo.
2. **ADR novo** com a escolha de fornecedor e o custo, na zona protegida. Ele pode ir no mesmo PR do `[remotes.staging]`.
3. **PR fora da zona:** a porta, a `rota()`, o 429 no catálogo, o PWA e os testes.
4. **Configuração** das regras da borda e conferência no staging.

## 6. Decisões do Cesar, no portão

1. **As três camadas da P1**, com o Upstash na aplicação? Proposta: sim.
2. **Os limites iniciais da tabela da P1**, revistos depois de duas semanas de piloto? Proposta: sim.
3. **Falha do contador deixa passar** fora de `/auth/*`? A P1 já propõe isso. Proposta: confirmar.
