# HubKeep — mock de apresentação

Protótipo navegável do HubKeep, a operação de manutenção para redes hoteleiras oferecida pela EasyGov. É um site estático, sem backend. Os dados são fictícios, gerados no navegador por `seed.js`, com datas relativas ao dia em que a demo é aberta. "CSC" designa a equipe central de manutenção do cliente, não o produto.

Conteúdo alinhado ao Documento do projeto de 07/10/2026.

## Publicar no Netlify

**Mais rápido (sem Git):** abra https://app.netlify.com/drop e arraste a pasta `csc-mock`. Em segundos o Netlify devolve um link público. Para atualizar, abra o site no painel do Netlify, vá em **Deploys** e arraste a pasta de novo na área de deploy manual: o link continua o mesmo.

**Pela linha de comando:**

```bash
npm install -g netlify-cli
cd csc-mock
netlify deploy --prod --dir .
```

O `netlify.toml` já cuida de:

- `noindex`, para o site não aparecer em buscadores;
- cabeçalhos de segurança (CSP restrita ao próprio site, sem recursos externos);
- cache de um ano para narração e fontes, que têm o conteúdo no nome do arquivo, e revalidação imediata de HTML, JS e CSS, para que uma nova publicação apareça na hora;
- atalhos: `seu-site.netlify.app/tour` abre a demonstração guiada e `seu-site.netlify.app/telao` começa direto, sem a tela inicial;
- a pasta `ferramentas/` e este README não ficam acessíveis no site publicado.

O site não carrega nada de fora (as fontes Barlow estão em `fontes/`), então funciona em rede corporativa restrita e também aberto direto do disco, com um servidor local simples (`npx serve .`).

## Temas

O sistema abre no tema escuro, de sala de controle. O botão **Tema claro** no topo alterna, e a escolha fica salva no navegador. Para abrir direto em um tema, use `?tema=claro` ou `?tema=escuro`.

## Personalizar

- Nome do cliente, produto e aviso: `DEMO_CONFIG` no topo de `seed.js`.
- Para gerar outro conjunto de dados, troque `semente` em `DEMO_CONFIG`.
- Hotéis, modelos contratuais, bandeiras, categorias, planos, fornecedores e políticas também estão em `seed.js`.

## Durante a apresentação

- As alterações ficam salvas no navegador. **Restaurar dados da demo**, no rodapé do menu, volta tudo ao estado inicial. Faça isso antes de cada apresentação.
- O seletor **Ver como**, no topo, troca o perfil e mostra o isolamento por escopo: Admin do grupo e Gestora do CSC, Gestor CSC da bandeira, gerente de hotel, técnico, proprietária (administrado) e locador (arrendado).

## Demonstração guiada (vídeo interativo)

O próprio sistema se opera sozinho, com cursor animado, destaque nos cliques, legendas e narração em voz feminina, em 13 capítulos (cerca de 8 minutos).

- Abra pelo botão **Assistir demonstração guiada**, no rodapé do menu, ou por `/tour`. `/telao` (ou `?tour=auto`) começa direto, útil para deixar rodando em um telão.
- Controles na barra inferior: pausar e continuar, capítulo anterior e próximo, velocidade (1x, 1,25x, 1,5x), narração e sair. Clique em qualquer trecho da barra para pular para um capítulo.
- Atalhos: espaço pausa, setas trocam de capítulo, Esc sai.
- A narração é baixada inteira na tela inicial (cerca de 4 MB), então não atrasa pela rede. O roteiro espera cada fala terminar de verdade, e o som acompanha pausa e velocidade sem mudar o tom da voz.
- Se o navegador bloquear o som (comum no modo telão, que começa sem clique), aparece o botão **Clique para ativar a narração**; a demonstração segue com legendas até lá.
- Pausado, dá para clicar e explorar o sistema. Ao continuar, o capítulo recomeça do início se algo tiver mudado.
- A demonstração usa dados próprios e devolve os seus dados ao sair.

### Regerar a narração

As falas ficam em `tour.js` (`a.say`, `a.voice` e `cardVoice`). Depois de mudar um texto, rode `python ferramentas/gerar_narracao.py --modelos <pasta dos modelos>`. As instruções estão no topo do script. Ele usa a mesma voz (Kokoro, `pf_dora`), corrige a pronúncia de siglas só no texto enviado à síntese (por exemplo, "UHs" era lido como "us" e "PMS" precisa sair como "pê ême ésse"), trata o som (graves, presença, sibilância e compressão leve), iguala o volume em -16 LUFS e grava cada fala com o hash no nome do arquivo.

### Narração com a ElevenLabs

O script `ferramentas/gerar_narracao_elevenlabs.py` gera as mesmas 68 falas com uma voz da ElevenLabs, muito mais natural. Precisa de Python 3.9 ou mais novo e do ffmpeg (no Windows: `winget install Gyan.FFmpeg`). No PowerShell, dentro da pasta `csc-mock`:

```powershell
$env:ELEVENLABS_API_KEY = "sua-chave"
python ferramentas\gerar_narracao_elevenlabs.py --voz ID_DA_VOZ --teste 3
python ferramentas\gerar_narracao_elevenlabs.py --voz ID_DA_VOZ
```

O primeiro comando gera só 3 falas em `narracao-teste/`, para ouvir e escolher a voz sem gastar o roteiro inteiro. O segundo gera tudo e atualiza `narracao/manifest.js`. O roteiro inteiro tem cerca de 6.300 caracteres.

- Cada fala fica guardada em `ferramentas/.cache-elevenlabs`; rodar de novo só pede à ElevenLabs as falas novas ou alteradas.
- Para refazer uma fala que saiu ruim: `--apenas 12 --refazer`.
- Ajustes de voz: `--estabilidade` (0,4 a 0,6 costuma soar natural), `--estilo` (até 0,3), `--velocidade` (0,9 a 1,1) e `--modelo eleven_multilingual_v2` como alternativa ao `eleven_v4`.
- O plano gratuito da ElevenLabs não permite uso comercial. Para apresentar a cliente, gere a versão final com um plano pago ativo.

Para trocar por uma locução gravada, substitua os MP3 e ajuste `ms` em `narracao/manifest.js`.

## Roteiro sugerido para apresentar ao vivo (cerca de 12 minutos)

1. **Painel como Marina (Admin do grupo e gestora do CSC).** Os indicadores e a situação dos 14 hotéis. Clique em um hotel com chamado fora do prazo.
2. **Chamado crítico.** "Elevador social 2 parado no 9º andar": prazo de 2 h pela regra do grupo, origem, quem executa, equipamento parado e histórico.
3. **Abrir chamado e triagem.** No Suítes Balneário Camboriú, só local, problema e foto. Na triagem, hidráulica e prioridade Alta: o prazo vira 4 h, herdado da Linha Suítes.
4. **Aceite com assinatura.** Em Chamados, filtre "Aguardando aceite". Registre quem executou, o custo e os códigos, e colha a assinatura. Mostre que o técnico que executou não consegue aceitar. Imprima a OS.
5. **Políticas.** Herança grupo, bandeira e hotel; relógio por categoria (pintura em horário comercial); códigos obrigatórios por política.
6. **Implantação.** Planilha de exemplo, aprovação do cadastro pelo celular, etiquetas em lote e o pacote da bandeira aplicado ao Hotel Palmas.
7. **App do técnico.** "Simular sem sinal", preventiva com checklist tipado, reconexão e leitura do QR.
8. **Indicadores.** UH-dias perdidos, razão preventiva/corretiva, comparação na mesma bandeira e exportação CSV.
9. **Modelos e escopo.** Em Hotéis, a matriz de modelos e a matriz de responsabilidade do arrendado. Troque para Juliana, Helena e o locador.
10. **Integração PMS.** Somente leitura, ficha de conexão por hotel com limite de 5 minutos e o que a Central faz e não faz.
11. **HubKeep Intelligence (prévia, dados fictícios).** A tela avisa no topo que os dados são inventados. Abra o Elevador social 2 do Hotel São Paulo Paulista em "Por que estou vendo isso?": nove componentes, o peso de cada um e a redistribuição do peso do que está sem dado. Em "Efetividade", o antes e o depois de 90 dias, que fala em variação observada e nunca em causa. Em "Padrão sistêmico", os possíveis problemas entre hotéis: só o mesmo modelo vem ligado por padrão, com 3 hotéis, 6 chamados em 90 dias, 5 ativos e a taxa de chamados por ativo contra a dos outros modelos da mesma categoria; as outras quatro regras ficam desligadas pela política.
12. **Próximas fases.** MVP, 1d de conformidade, EasyGov e status da UH, fases 2 e 3, e os critérios de aceite do piloto.

## Limites do mock

- Não há login real nem banco de dados. O filtro de escopo é simulado no navegador; no produto, ele fica no banco (RLS).
- Fotos, QR codes e leitura de câmera são ilustrativos. A assinatura é real, mas fica só no navegador.
- A integração com o PMS é simulada; nenhuma conexão real é feita.
- As fórmulas da Intelligence seguem o 1.0 aprovado em 08/10/2026 (atenção v2, reincidência v1, efetividade v2 e padrão sistêmico v2), com pesos, limiares e mínimos como política, sobre dados fictícios plantados para a demonstração. O cálculo é repetido em JavaScript só para os números baterem; o módulo ainda está em desenvolvimento e nada disso existe no produto real.
- A interface do mock está só em português; o produto sai em pt-BR, inglês, espanhol e francês.
