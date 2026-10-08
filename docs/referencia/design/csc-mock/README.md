# Central de Manutenção (CSC) — mock de apresentação

Protótipo navegável da Central de Manutenção do EasyGov. É um site estático, sem backend. Os dados são fictícios, gerados no navegador por `seed.js`, com datas relativas ao dia em que a demo é aberta.

## Publicar no Netlify

**Mais rápido (sem conta de Git):** abra https://app.netlify.com/drop e arraste a pasta `csc-mock` (ou o arquivo `.zip`). Em segundos o Netlify devolve um link público.

**Pela linha de comando:**

```bash
npm install -g netlify-cli
cd csc-mock
netlify deploy --prod --dir .
```

O `netlify.toml` já marca o site como `noindex`, para ele não aparecer em buscadores.

## Temas

O sistema abre no tema escuro, de sala de controle. O botão **Tema claro** no topo alterna, e a escolha fica salva no navegador. Para abrir direto em um tema, use `?tema=claro` ou `?tema=escuro` no link.

## Personalizar

- Nome do cliente, produto e aviso: `DEMO_CONFIG` no topo de `seed.js`.
- Para gerar outro conjunto de dados, troque `semente` em `DEMO_CONFIG`.
- Hotéis, bandeiras, categorias, planos e políticas de SLA também estão em `seed.js`.

## Durante a apresentação

- As alterações (chamados abertos, atribuições, OS concluídas, SLA alterado) ficam salvas no navegador.
- **Restaurar dados da demo**, no rodapé do menu, volta tudo ao estado inicial. Faça isso antes de cada apresentação.
- O seletor **Ver como**, no topo, troca o perfil e mostra o isolamento de dados por escopo.

## Demonstração guiada (vídeo interativo)

O próprio sistema se opera sozinho, com cursor animado, destaque nos cliques, legendas e narração em voz feminina, em 10 capítulos (cerca de 6 minutos).

- Abra pelo botão **Assistir demonstração guiada**, no rodapé do menu, ou pelo link `seu-site.netlify.app/?tour`.
- `?tour=auto` começa direto, sem a tela inicial. Útil para deixar rodando em um telão.
- Controles na barra inferior: pausar e continuar, capítulo anterior e próximo, velocidade (1x, 1,5x, 2x) e sair. Clique em qualquer trecho da barra para pular para um capítulo.
- Atalhos: espaço pausa, setas trocam de capítulo, Esc sai.
- A narração toca junto e acompanha pausa e velocidade. O botão **Narração ligada** desliga a voz e mantém as legendas.
- As falas estão em `narracao/` (um MP3 por legenda) e em `narracao/manifest.js`. A voz é sintetizada; para trocar por uma locução gravada, substitua os MP3 mantendo os nomes e ajuste a duração (`ms`) no manifesto.
- Pausado, dá para clicar e explorar o sistema. Ao continuar, o capítulo recomeça do início se algo tiver mudado.
- A demonstração usa dados próprios e devolve os seus dados ao sair.

O vídeo `demonstracao-central-manutencao.mp4` (entregue à parte, fora do site) é a mesma demonstração gravada, para enviar ou projetar sem internet.

## Roteiro sugerido para apresentar ao vivo (cerca de 10 minutos)

1. **Painel como Marina (gestora do CSC).** Os quatro indicadores e o quadro da rede com os 14 hotéis. Clique em um hotel com chamado fora do prazo.
2. **Chamado crítico.** Abra "Elevador social 2 parado no 9º andar": prazo de 2 h pela regra do grupo, técnico atribuído e histórico.
3. **Abrir chamado.** Em Chamados, abra um chamado no Suítes Balneário Camboriú informando só o local, o problema e uma foto. Na triagem, classifique como hidráulica e prioridade Alta: o prazo vira 4 h, herdado da Linha Suítes. Atribua um técnico e inicie o atendimento.
4. **Políticas de SLA.** Mostre a herança grupo, bandeira e hotel. Crie uma exceção para um hotel e mostre o registro em Auditoria. Mensagem: exigência do cliente vira configuração, não código.
5. **Implantação de ativos.** Carregue a planilha de exemplo, importe as linhas válidas, aprove um cadastro feito pelo celular e imprima etiquetas em lote.
6. **App do técnico.** Fila do dia do Paulo. Clique em "Simular sem sinal", conclua uma preventiva marcando o checklist e reconecte: as ações são enviadas. Em "Abrir chamado", leia a etiqueta QR de um ativo.
7. **Isolamento por escopo.** Troque para Juliana (gerente de hotel): só o Hotel Curitiba Batel. Troque para Helena (proprietária): só as 3 UHs dela, sem edição.
8. **Integração TOTVS CM.** Somente leitura: views, idade dos dados e a tabela do que a Central faz e não faz.
9. **Intelligence (prévia, dados fictícios).** Em "Intelligence", o painel de investigação com os ativos em atenção, os possíveis problemas sistêmicos e as intervenções avaliadas. Abra o Elevador social 2 do Hotel São Paulo Paulista (por que está em alta atenção, componentes e pesos, reincidência, custo informado) e o Chiller principal do Hotel Florianópolis Centro (antes e depois de uma intervenção). Troque para Juliana (gerente) e veja que o insight de rede some: só aparece a quem lê todos os hotéis dele.
10. **Próximas fases.** O que é MVP, o que vem depois do piloto e o que ainda está em estudo.

## Intelligence no mock

A tela fica em `intelligence.js` e entra no menu como "Intelligence" para a gestora do CSC, os coordenadores de bandeira e os gerentes. É uma **prévia comercial**: os ativos, os chamados, os custos e as intervenções são inventados, e a tela diz isso no topo. O que segue o produto é a regra do Intelligence 1.0 (`packages/inteligencia`): os pesos e as faixas dos scores, o limite de 70 para sugerir insight, as frases de "Por que estou vendo isso?" e o antes e depois em janelas iguais, que mostra variação observada e nunca causa. O cálculo está repetido em JavaScript só para os números baterem. O módulo ainda está em desenvolvimento; nada disso existe no produto real.

## Limites do mock

- Não há login real nem banco de dados. O filtro de escopo é simulado no navegador; no produto, ele fica no banco (RLS).
- Fotos, QR codes e leitura de câmera são ilustrativos.
- A integração com o TOTVS CM é simulada; nenhuma conexão real é feita.
