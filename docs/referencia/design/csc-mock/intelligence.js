/* HubKeep Intelligence 1.0 no mock da Central de Manutenção.
   PRÉVIA COMERCIAL COM DADOS FICTÍCIOS: os ativos, chamados, custos e intervenções abaixo são inventados.
   O que é real aqui é a regra: os pesos, as faixas, o limite de 70 para sugerir insight, as frases do
   "Por que estou vendo isso?" e o antes e depois seguem packages/inteligencia (versão 1 das fórmulas,
   ADR-033 a 036). O cálculo abaixo repete as fórmulas do motor em JavaScript só para os números baterem.
   Os nomes dos ativos e dos hotéis vêm do seed do mock; os números do Intelligence estão neste arquivo. */

const IA = (() => {
  const LIMITE_INSIGHT = 70, MAX_CRIT = 5;
  const FAIXAS = [[85, "critico", "Crítico", "b-red"], [70, "alta_atencao", "Alta atenção", "b-red"], [50, "atencao", "Atenção", "b-amber"], [30, "observar", "Observar", "b-blue"], [0, "normal", "Normal", "b-green"]];
  const faixaDe = v => v == null ? ["dados_insuficientes", "Dados insuficientes", "b-grey"] : FAIXAS.find(f => v >= f[0]).slice(1);
  const razao = (x, lim) => Math.max(0, Math.min(1, x / lim));
  const brl = v => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const n1 = v => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

  /* Os mesmos pesos e limites do PADRAO_REINCIDENCIA e do PADRAO_ATENCAO. */
  const PESOS_REINC = { corretivas: .3, intervalo: .15, reaberturas: .15, mesma_falha: .15, apos_corretiva: .15, apos_preventiva: .1 };
  const PESOS_ATENC = { criticidade: .2, reincidencia: .2, parada: .15, custo: .15, impacto_hospede: .2, preventiva_ou_compliance: .1 };
  const NOME_ATENC = { criticidade: "Criticidade", reincidencia: "Reincidência de falhas", parada: "Parada do ativo", custo: "Custo informado", impacto_hospede: "Impacto em hóspedes", preventiva_ou_compliance: "Preventiva ou compliance" };
  const NOME_REINC = { corretivas: "Corretivas na janela", intervalo: "Intervalo entre as falhas", reaberturas: "Reaberturas", mesma_falha: "A mesma falha", apos_corretiva: "Falha que volta após a corretiva", apos_preventiva: "Falha logo após preventiva" };

  function combinar(partes) {
    const presentes = partes.filter(p => p.valor !== null && p.peso > 0), soma = presentes.reduce((s, p) => s + p.peso, 0);
    const comps = partes.map(p => { const ef = p.valor !== null && soma > 0 ? p.peso / soma : 0, v = p.valor === null ? null : Math.max(0, Math.min(1, p.valor)); return { ...p, valor: v, pesoEfetivo: ef, pontos: (v ?? 0) * ef * 100 }; });
    return { valor: soma > 0 ? Math.round(comps.reduce((s, c) => s + c.pontos, 0)) : null, comps, ausentes: partes.filter(p => p.valor === null).map(p => p.chave) };
  }
  function reincidencia(r) {
    return combinar([
      { chave: "corretivas", peso: PESOS_REINC.corretivas, valor: razao(r.n, 5), ev: { quantidade: r.n, janelaDias: 90 } },
      { chave: "intervalo", peso: PESOS_REINC.intervalo, valor: r.intervalo == null ? 0 : 1 - razao(r.intervalo, 30), ev: { intervaloMedioDias: r.intervalo } },
      { chave: "reaberturas", peso: PESOS_REINC.reaberturas, valor: razao(r.reaberturas, 3), ev: { quantidade: r.reaberturas } },
      { chave: "mesma_falha", peso: PESOS_REINC.mesma_falha, valor: r.comCodigo === 0 ? null : r.vezes >= 2 ? r.vezes / r.comCodigo : 0, ev: { quantidade: r.vezes, comCodigo: r.comCodigo, falha: r.falha } },
      { chave: "apos_corretiva", peso: PESOS_REINC.apos_corretiva, valor: razao(r.voltas, Math.max(r.n - 1, 1)), ev: { quantidade: r.voltas, diasAposCorretiva: 30 } },
      { chave: "apos_preventiva", peso: PESOS_REINC.apos_preventiva, valor: null, ev: {} } /* sem dado até a etapa P da 1b */
    ]);
  }
  function atencao(a, reinc) {
    return combinar([
      { chave: "criticidade", peso: PESOS_ATENC.criticidade, valor: razao(a.criticidade, MAX_CRIT), ev: { nivel: a.criticidade, maximo: MAX_CRIT } },
      { chave: "reincidencia", peso: PESOS_ATENC.reincidencia, valor: reinc.valor / 100, ev: { score: reinc.valor } },
      { chave: "parada", peso: PESOS_ATENC.parada, valor: razao(a.horasParadas, 48), ev: { horas: a.horasParadas, limite: 48 } },
      { chave: "custo", peso: PESOS_ATENC.custo, valor: razao(a.custo12m, 10000), ev: { valor12m: a.custo12m, limite: 10000 } },
      { chave: "impacto_hospede", peso: PESOS_ATENC.impacto_hospede, valor: razao(a.impacto, 100), ev: { score: a.impacto } },
      { chave: "preventiva_ou_compliance", peso: PESOS_ATENC.preventiva_ou_compliance, valor: null, ev: {} } /* sem dado até a etapa P da 1b */
    ]);
  }

  /* Frases do "Por que estou vendo isso?" (catálogo pt-BR, chaves inteligencia.motivo.*). */
  const plural = (n, um, varios) => n === 1 ? um : varios;
  const FRASE = {
    criticidade: c => `Criticidade ${c.ev.nivel} de ${c.ev.maximo}`,
    reincidencia: c => `Reincidência de falhas em ${c.ev.score}`,
    parada: c => `${n1(c.ev.horas)} horas parado na janela`,
    custo: c => `Custo informado de ${brl(c.ev.valor12m)} em 12 meses`,
    impacto_hospede: c => `${n1(c.ev.score)}% dos chamados afetaram hóspedes`,
    preventiva_ou_compliance: () => "Preventiva vencida ou compliance em aberto",
    corretivas: c => `${c.ev.quantidade} ${plural(c.ev.quantidade, "corretiva", "corretivas")} nos últimos ${c.ev.janelaDias} dias`,
    intervalo: c => `Intervalo médio de ${n1(c.ev.intervaloMedioDias)} dias entre as falhas`,
    reaberturas: c => `${c.ev.quantidade} ${plural(c.ev.quantidade, "reabertura", "reaberturas")} na janela`,
    mesma_falha: c => `A mesma falha em ${c.ev.quantidade} de ${c.ev.comCodigo} corretivas com código`,
    apos_corretiva: c => `${c.ev.quantidade} ${plural(c.ev.quantidade, "falha voltou", "falhas voltaram")} em até ${c.ev.diasAposCorretiva} dias depois da corretiva anterior`
  };
  const motivos = (score, quantos = 3) => score.comps.filter(c => c.valor !== null && c.pontos > 0).sort((a, b) => b.pontos - a.pontos).slice(0, quantos);

  /* Os ativos fictícios. O hotel, a categoria e a ordem escolhem um ativo do seed do mock; o resto é inventado. */
  const ESPEC = [
    { chave: "ia1", hotel: "h3", cat: "c1", ord: 1, criticidade: 5, n: 6, intervalo: 11.8, reaberturas: 3, falha: "Porta de cabine não fecha", vezes: 4, comCodigo: 6, voltas: 4, horasParadas: 41, custo12m: 14200, impacto: 52, inicio: 48, insight: "INS-0201", estado: "Novo", os: [["Troca do operador de porta", 5200], ["Ajuste do sensor da porta", 3400], ["Troca de roldanas", 5600]] },
    { chave: "ia2", hotel: "h10", cat: "c3", ord: 0, criticidade: 5, n: 5, intervalo: 14, reaberturas: 2, falha: "Falha de partida", vezes: 4, comCodigo: 5, voltas: 3, horasParadas: 30, custo12m: 9400, impacto: 35, inicio: 40, insight: "INS-0202", estado: "Em revisão", os: [["Troca da bateria de partida", 2100], ["Revisão do módulo de comando", 4300], ["Troca do relé de partida", 3000]] },
    { chave: "ia3", hotel: "h1", cat: "c5", ord: 0, criticidade: 4, n: 5, intervalo: 14, reaberturas: 2, falha: "Vazamento no selo mecânico", vezes: 3, comCodigo: 5, voltas: 3, horasParadas: 12, custo12m: 4100, impacto: 30, inicio: 36, insight: null, estado: null, os: [["Troca do selo mecânico", 2400], ["Reaperto e vedação", 1700]] },
    { chave: "ia4", hotel: "h5", cat: "c2", ord: 0, criticidade: 4, n: 2, intervalo: 38, reaberturas: 0, falha: "Pressão de sucção baixa", vezes: 2, comCodigo: 2, voltas: 0, horasParadas: 6.5, custo12m: 3100, impacto: 8, inicio: 56, insight: null, estado: null, os: [["Recarga de gás refrigerante", 3100]],
      intervencao: { quando: 95, descricao: "Troca da válvula de expansão", antes: { chamados: 7, reaberturas: 3, horas_paradas: 41.5, custo: 18400 }, depois: { chamados: 2, reaberturas: 0, horas_paradas: 6.5, custo: 3100 } } },
    { chave: "ia5", hotel: "h7", cat: "c1", ord: 0, criticidade: 5, n: 3, intervalo: 22, reaberturas: 1, falha: "Nivelamento de cabine", vezes: 2, comCodigo: 3, voltas: 1, horasParadas: 9, custo12m: 5600, impacto: 22, inicio: 44, insight: null, estado: null, os: [["Ajuste do freio", 2900], ["Reajuste de nivelamento", 2700]],
      intervencao: { quando: 38, descricao: "Troca do cabo de tração", antes: { chamados: 5, reaberturas: 2, horas_paradas: 22, custo: 9600 }, depois: { chamados: 2, reaberturas: 1, horas_paradas: 8, custo: 4400 } } }
  ];
  /* Insights de rede: possíveis problemas sistêmicos. Só aparecem a quem lê todos os hotéis do insight. */
  const SISTEMICOS = [
    { id: "INS-0210", regra: "mesmo_modelo", titulo: "Mesmo modelo com a mesma falha", hoteis: ["h2", "h4", "h9"], resumo: "6 splits Daikin Split Inverter 18.000 BTU com a falha \"dreno entupido\" nos últimos 90 dias (mínimo da regra: 5 ativos).", estado: "Novo", evidencia: [["Ativos distintos com a falha", "6 (mínimo 5)"], ["Hotéis", "3"], ["Janela", "90 dias"]] },
    { id: "INS-0211", regra: "mesmo_andar", titulo: "Mesmo andar com a mesma falha", hoteis: ["h10"], resumo: "5 UHs do 7º andar com \"vazamento no registro do banheiro\" em 10 dias (mínimo da regra: 5 locais).", estado: "Em revisão", evidencia: [["Locais distintos com a falha", "5 (mínimo 5)"], ["Andar", "7º"], ["Janela", "10 dias"]] }
  ];

  const D = 864e5;
  function ativosDaTela() {
    return ESPEC.map(e => {
      const lista = DB.ativos.filter(a => a.hotel_id === e.hotel && a.categoria_id === e.cat);
      const base = lista[e.ord] || lista[0];
      if (!base) return null;
      const reinc = reincidencia(e), atenc = atencao(e, reinc);
      const faixa = faixaDe(atenc.valor);
      return { ...e, ativo: base, reinc, atenc, faixa };
    }).filter(Boolean).sort((x, y) => y.atenc.valor - x.atenc.valor);
  }
  const visiveis = () => { const s = scope().hoteis; return ativosDaTela().filter(x => s.includes(x.hotel)); };
  const sistemicosVisiveis = () => { const s = scope().hoteis; return SISTEMICOS.filter(x => x.hoteis.every(h => s.includes(h))); };
  const hotelNome = id => IDX.hotel[id].nome;

  /* As corretivas que levaram à reincidência: datas espaçadas pelo intervalo médio, para os números baterem. */
  function corretivas(x) {
    const out = [], passo = x.intervalo, k = Math.min(x.n, 8);
    for (let i = 0; i < k; i++) out.push(Date.now() - (2 + (k - 1 - i) * passo) * D);
    return out.map((tt, i) => ({ id: "CH-D" + String(x.chave.slice(2) * 100 + i + 1).padStart(4, "0"), t: tt, falha: i < x.vezes ? x.falha : "Outra falha" })).reverse();
  }

  function serie(x) {
    const v = [], fim = x.atenc.valor;
    for (let i = 0; i < 90; i++) {
      const f = i / 89, e = f * f * (3 - 2 * f);
      const ruido = Math.sin(i * 1.7 + x.inicio) * 2.2 + Math.sin(i * .45) * 1.6;
      v.push(Math.max(2, Math.min(98, x.inicio + (fim - x.inicio) * e + (i === 89 ? 0 : ruido))));
    }
    return v;
  }
  function graficoSerie(x) {
    const W = 760, H = 220, pl = 32, pb = 24, pt = 10, pr = 10, y = v => pt + (H - pt - pb) * (1 - v / 100), xx = i => pl + i * (W - pl - pr) / 89;
    const vals = serie(x), pts = vals.map((v, i) => [xx(i), y(v)]);
    const bandas = FAIXAS.map(f => { const topo = f[0] === 85 ? 100 : FAIXAS[FAIXAS.indexOf(f) - 1][0]; return `<rect x="${pl}" width="${W - pl - pr}" y="${y(topo)}" height="${y(f[0]) - y(topo)}" fill="${f[3] === "b-red" ? "var(--red)" : f[3] === "b-amber" ? "var(--amber)" : f[3] === "b-blue" ? "var(--blue)" : "var(--green)"}" opacity=".06"/>`; }).join("");
    const grade = [0, 30, 50, 70, 85, 100].map(g => `<line x1="${pl}" x2="${W - pr}" y1="${y(g)}" y2="${y(g)}" style="stroke:var(--grid)"/><text x="${pl - 6}" y="${y(g) + 4}" text-anchor="end">${g}</text>`).join("");
    const lim = `<line x1="${pl}" x2="${W - pr}" y1="${y(LIMITE_INSIGHT)}" y2="${y(LIMITE_INSIGHT)}" stroke="var(--amber)" stroke-dasharray="5 4" stroke-width="1.4"/><text x="${W - pr}" y="${y(LIMITE_INSIGHT) - 5}" text-anchor="end" fill="var(--amber)">limite do insight (${LIMITE_INSIGHT})</text>`;
    const rot = [0, 30, 60, 89].map(i => `<text x="${xx(i)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === 89 ? "end" : "middle"}">${i === 89 ? "hoje" : "há " + (89 - i) + " dias"}</text>`).join("");
    let marca = "";
    if (x.intervencao && x.intervencao.quando <= 89) { const i = 89 - x.intervencao.quando; marca = `<line x1="${xx(i)}" x2="${xx(i)}" y1="${pt}" y2="${H - pb}" stroke="var(--ok)" stroke-dasharray="3 3"/><text x="${xx(i) + 5}" y="${pt + 11}" fill="var(--ok)">intervenção</text>`; }
    const id = "ia" + (++gid), linha = smoothPath(pts), ult = pts[89];
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Atenção ao ativo nos últimos 90 dias: começou em ${Math.round(vals[0])} e está em ${x.atenc.valor}. Limite do insight: ${LIMITE_INSIGHT}.">${bandas}${grade}${lim}${marca}
      <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--ok)" stop-opacity=".25"/><stop offset="1" stop-color="var(--ok)" stop-opacity="0"/></linearGradient></defs>
      <path d="${linha} L${ult[0]},${y(0)} L${pts[0][0]},${y(0)} Z" fill="url(#${id})"/><path d="${linha}" fill="none" stroke="var(--ok)" stroke-width="2.2"/><circle cx="${ult[0]}" cy="${ult[1]}" r="3.4" fill="var(--ok)"/>${rot}</svg>`;
  }

  const aviso = `<div class="ia-aviso" role="note"><strong>Dados fictícios, para demonstração.</strong> Os ativos, chamados, custos e intervenções desta tela são inventados. As regras são as do Intelligence 1.0: pesos, faixas, limite de insight e frases de explicação. O módulo está em desenvolvimento.</div>`;
  const badgeFaixa = f => `<span class="badge ${f[2]}">${f[1]}</span>`;

  /* ---------- Painel de investigação ---------- */
  function painel() {
    const xs = visiveis(), sis = sistemicosVisiveis();
    const emAtencao = xs.filter(x => x.atenc.valor >= 50), acima = xs.filter(x => x.atenc.valor >= LIMITE_INSIGHT), avaliadas = xs.filter(x => x.intervencao);
    const kpi = (cl, v, l, d) => `<div class="panel kpi ${cl}"><div class="v">${v}</div><div class="l">${l}</div><div class="d">${d}</div></div>`;
    const linhas = xs.map(x => `<tr class="click" onclick="location.hash='#/intelligence?ativo=${x.chave}'">
      <td>${badgeFaixa(x.faixa)}</td><td><b>${esc(x.ativo.nome)}</b><div class="small muted">${esc(hotelNome(x.hotel))} · ${esc(IDX.local[x.ativo.local_id].nome)}</div></td>
      <td class="num tnum"><span class="ia-score">${x.atenc.valor}</span></td>
      <td class="small">${motivos(x.atenc, 2).map(c => esc(FRASE[c.chave](c))).join("<br>")}</td>
      <td class="small">${x.insight ? `<span class="id">${x.insight}</span> ${x.estado}` : '<span class="muted">Sem insight</span>'}</td></tr>`).join("");
    const sisHtml = sis.length ? sis.map(s => `<div class="ia-sis"><div class="row" style="gap:8px;flex-wrap:wrap"><span class="id">${s.id}</span><span class="badge b-amber">Atenção</span><span class="badge b-outline">${s.estado}</span><b>${s.titulo}</b></div>
      <p class="small" style="margin:6px 0 4px">${esc(s.resumo)}</p>
      <div class="small muted">Escopo: ${s.hoteis.map(h => esc(hotelNome(h))).join(", ")}. Possível problema sistêmico: é um sinal, e não uma conclusão. Confirmar é decisão de uma pessoa.</div>
      <div class="ia-evid">${s.evidencia.map(e => `<span>${e[0]}: <b>${e[1]}</b></span>`).join("")}</div></div>`).join("")
      : `<div class="empty">Nenhum possível problema sistêmico no seu escopo. Um insight de rede só aparece para quem lê todos os hotéis dele.</div>`;
    const avHtml = avaliadas.length ? `<table><thead><tr><th>Ativo</th><th>Intervenção</th><th>Resultado observado</th></tr></thead><tbody>${avaliadas.map(x => { const r = resultadoEfet(x.intervencao); return `<tr class="click" onclick="location.hash='#/intelligence?ativo=${x.chave}'"><td><b>${esc(x.ativo.nome)}</b><div class="small muted">${esc(hotelNome(x.hotel))}</div></td><td class="small">${esc(x.intervencao.descricao)}<div class="muted">há ${x.intervencao.quando} dias</div></td><td class="small">${r.badge}<div class="muted">${r.resumo}</div></td></tr>`; }).join("")}</tbody></table>` : `<div class="empty">Nenhuma intervenção avaliada no seu escopo.</div>`;
    return `${aviso}
    <div class="grid g-4" style="margin:14px 0">
      ${kpi(acima.length ? "bad" : "good", acima.length, "Ativos com insight sugerido", `Atenção a partir de ${LIMITE_INSIGHT}`)}
      ${kpi(emAtencao.length ? "warn" : "good", emAtencao.length, "Ativos em atenção ou pior", "Faixa Atenção a partir de 50")}
      ${kpi(sis.length ? "warn" : "good", sis.length, "Possíveis problemas sistêmicos", "Só no escopo que você lê inteiro")}
      ${kpi("good", avaliadas.length, "Intervenções avaliadas", "Antes e depois, em janelas iguais")}
    </div>
    <div class="panel"><div class="panel-h"><h2>Ativos em atenção</h2><span class="hint">Do maior para o menor. Clique para ver o porquê.</span></div>
      <div class="table-wrap"><table><thead><tr><th>Faixa</th><th>Ativo</th><th class="num">Atenção</th><th>O que mais pesou</th><th>Insight</th></tr></thead><tbody>${linhas || `<tr><td colspan="5" class="empty">Nenhum ativo em atenção no seu escopo.</td></tr>`}</tbody></table></div></div>
    <div class="grid g-2" style="margin-top:16px;align-items:start">
      <div class="panel"><div class="panel-h"><h2>Possíveis problemas sistêmicos</h2><span class="hint">Entre hotéis, modelos e andares</span></div><div class="panel-b">${sisHtml}</div></div>
      <div class="panel"><div class="panel-h"><h2>Intervenções avaliadas</h2><span class="hint">O que mudou depois que se interveio</span></div><div class="table-wrap">${avHtml}</div></div>
    </div>
    <p class="small muted" style="margin-top:14px">O score mostra o que pesou, e não a causa. O Intelligence aponta onde olhar; quem decide é a equipe. Cada pessoa vê só o insight cujos hotéis todos ela lê, pela mesma regra de escopo do restante da Central.</p>`;
  }

  /* ---------- Antes e depois (PRD, seção 16): variação observada, nunca causa ---------- */
  const NOME_METRICA = { chamados: "Chamados", reaberturas: "Reaberturas", horas_paradas: "Horas paradas", custo: "Custo informado" };
  function variacao(a, d) { return a === 0 ? null : Math.round((d - a) / a * 1000) / 10; }
  function resultadoEfet(i) {
    const completa = i.quando >= 90, v = variacao(i.antes.chamados, i.depois.chamados);
    if (!completa) return { badge: '<span class="badge b-grey">Janela incompleta</span>', resumo: `${i.quando} de 90 dias decorridos; os números ainda são parciais` };
    if (v === null) return { badge: '<span class="badge b-grey">Sem base de comparação</span>', resumo: "Sem chamados antes" };
    if (v <= -20) return { badge: '<span class="badge b-green">Redução observada</span>', resumo: `Chamados ${v}% em 90 dias` };
    if (v >= 20) return { badge: '<span class="badge b-red">Aumento observado</span>', resumo: `Chamados +${v}% em 90 dias` };
    return { badge: '<span class="badge b-grey">Sem mudança relevante</span>', resumo: `Chamados ${v}%` };
  }
  function blocoAntesDepois(x) {
    const i = x.intervencao;
    if (!i) return `<div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Antes e depois de uma intervenção</h2></div><div class="panel-b"><div class="empty">Nenhuma intervenção registrada neste ativo. Quando houver, o Intelligence compara 90 dias antes com 90 dias depois.</div></div></div>`;
    const r = resultadoEfet(i), fmtV = (k, v) => k === "custo" ? brl(v) : k === "horas_paradas" ? n1(v) + " h" : v;
    const linhas = Object.keys(NOME_METRICA).map(k => { const vr = variacao(i.antes[k], i.depois[k]); return `<tr><td>${NOME_METRICA[k]}</td><td class="num tnum">${fmtV(k, i.antes[k])}</td><td class="num tnum">${fmtV(k, i.depois[k])}</td><td class="num tnum">${vr === null ? "—" : (vr > 0 ? "+" : "") + String(vr).replace(".", ",") + "%"}</td></tr>`; }).join("");
    return `<div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Antes e depois de uma intervenção</h2>${r.badge}<span class="hint">${esc(i.descricao)}, há ${i.quando} dias</span></div><div class="panel-b">
      <div class="table-wrap"><table><thead><tr><th>Medida</th><th class="num">90 dias antes</th><th class="num">${i.quando >= 90 ? "90 dias depois" : i.quando + " dias depois (parcial)"}</th><th class="num">Variação</th></tr></thead><tbody>${linhas}</tbody></table></div>
      <p class="small muted" style="margin-bottom:0">${r.resumo}. É a variação observada nas duas janelas, e não a prova de que a intervenção foi a causa. Variação em % só quando o antes não é zero.</p></div></div>`;
  }

  /* ---------- Detalhe do ativo ---------- */
  function detalhe(chave) {
    const x = visiveis().find(v => v.chave === chave);
    if (!x) return `${aviso}<div class="panel" style="margin-top:14px"><div class="panel-b"><div class="empty">Este ativo não está no seu escopo. <a href="#/intelligence">Voltar ao painel</a></div></div></div>`;
    const a = x.ativo, ms = motivos(x.atenc), tz = x.atenc.ausentes;
    const kpi = (cl, v, l, d) => `<div class="panel kpi ${cl}"><div class="v">${v}</div><div class="l">${l}</div><div class="d">${d}</div></div>`;
    const compAt = x.atenc.comps.map(c => `<tr><td>${NOME_ATENC[c.chave]}</td><td class="num tnum">${c.valor === null ? "—" : n1(c.valor * 100)}</td><td class="num tnum">${Math.round(c.peso * 100)}%</td><td class="num tnum">${c.valor === null ? "—" : Math.round(c.pesoEfetivo * 1000) / 10 + "%"}</td><td class="num tnum">${c.valor === null ? "—" : n1(c.pontos)}</td></tr>`).join("");
    const compRe = x.reinc.comps.map(c => `<tr><td>${NOME_REINC[c.chave]}</td><td class="small">${c.valor === null ? '<span class="muted">Sem dado</span>' : esc(FRASE[c.chave](c))}</td><td class="num tnum">${c.valor === null ? "—" : n1(c.valor * 100)}</td><td class="num tnum">${Math.round(c.peso * 100)}%</td><td class="num tnum">${c.valor === null ? "—" : n1(c.pontos)}</td></tr>`).join("");
    const ch = corretivas(x).map(c => `<tr><td><span class="id">${c.id}</span></td><td class="small">${fmtD(new Date(c.t).toISOString())}</td><td class="small">${esc(c.falha)}</td></tr>`).join("");
    const cust = x.os.map(o => `<tr><td class="small">${esc(o[0])}</td><td class="num tnum">${brl(o[1])}</td></tr>`).join("");
    const calcEm = new Date(); calcEm.setHours(5, 30, 0, 0);
    return `${aviso}
    <p style="margin:14px 0 8px"><a href="#/intelligence">← Voltar ao painel de investigação</a></p>
    <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center"><h2 style="margin:0;font-family:var(--font-cond)">${esc(a.nome)}</h2>${badgeFaixa(x.faixa)}${x.insight ? `<span class="id">${x.insight}</span><span class="badge b-outline">${x.estado}</span>` : ""}</div>
    <div class="small muted" style="margin:4px 0 14px">${esc(hotelNome(x.hotel))} · ${esc(IDX.local[a.local_id].nome)} · ${esc(a.fabricante)}${a.modelo ? ", " + esc(a.modelo) : ""} · <a href="#/ativos?id=${a.id}">abrir a ficha do ativo (${a.id})</a></div>
    <div class="grid g-4">
      ${kpi(x.atenc.valor >= LIMITE_INSIGHT ? "bad" : x.atenc.valor >= 50 ? "warn" : "good", x.atenc.valor, "Atenção ao ativo", `${x.faixa[1]}. Insight a partir de ${LIMITE_INSIGHT}`)}
      ${kpi("", x.criticidade + '<small> de 5</small>', "Criticidade", "Definida no cadastro do ativo")}
      ${kpi(x.horasParadas > 24 ? "warn" : "", n1(x.horasParadas) + "<small> h</small>", "Parado em 90 dias", "Limite do componente: 48 h")}
      ${kpi(x.impacto > 40 ? "warn" : "", n1(x.impacto) + "<small>%</small>", "Chamados que afetaram hóspedes", "Pelo indicador do chamado")}
    </div>
    <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Por que estou vendo isso?</h2></div><div class="panel-b">
      <ol class="ia-porque">${ms.map(c => `<li>${esc(FRASE[c.chave](c))}<span class="muted small"> · ${n1(c.pontos)} pontos</span></li>`).join("")}</ol>
      <p class="small muted" style="margin-bottom:0">Os três fatores que mais pesaram. O score mostra o que pesou, e não a causa.</p></div></div>
    <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Atenção nos últimos 90 dias</h2><span class="hint">Uma linha por dia calculado, sobre as faixas</span></div><div class="panel-b chart">${graficoSerie(x)}</div></div>
    <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Como o score foi composto</h2><span class="hint">Atenção ao ativo, fórmula v1</span></div><div class="table-wrap"><table><thead><tr><th>Componente</th><th class="num">Valor</th><th class="num">Peso</th><th class="num">Peso usado</th><th class="num">Pontos</th></tr></thead><tbody>${compAt}<tr><td><b>Total</b></td><td></td><td></td><td></td><td class="num tnum"><b>${x.atenc.valor}</b></td></tr></tbody></table></div>
      ${tz.length ? `<p class="small muted" style="margin:10px 18px 14px">Sem dado ainda: ${tz.map(k => NOME_ATENC[k].toLowerCase()).join(", ")}. O peso desse componente foi dividido entre os outros, e o score não o conta como zero.</p>` : ""}</div>
    <div class="grid g-2" style="margin-top:16px;align-items:start">
      <div class="panel"><div class="panel-h"><h2>Reincidência de falhas</h2>${badgeFaixa(faixaDe(x.reinc.valor))}<span class="hint">Pontuação ${x.reinc.valor}, 90 dias</span></div><div class="table-wrap"><table><thead><tr><th>Componente</th><th>O que a regra encontrou</th><th class="num">Valor</th><th class="num">Peso</th><th class="num">Pontos</th></tr></thead><tbody>${compRe}</tbody></table></div></div>
      <div class="panel"><div class="panel-h"><h2>Corretivas da janela</h2><span class="hint">Os chamados que levaram a este número</span></div><div class="table-wrap"><table><tbody>${ch}</tbody></table></div></div>
    </div>
    <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Custo informado</h2><span class="hint">Informado no aceite da OS, em 12 meses. Limite do componente: ${brl(10000)}</span></div><div class="panel-b"><div class="grid g-2" style="align-items:start"><div class="table-wrap"><table><tbody>${cust}<tr><td><b>Total em 12 meses</b></td><td class="num tnum"><b>${brl(x.custo12m)}</b></td></tr></tbody></table></div>
      <p class="small muted" style="margin:0">É o valor que o hotel informou ao aceitar cada OS, e não o custo contábil. Sem custo informado, o componente fica sem dado, e não zero.</p></div></div></div>
    ${blocoAntesDepois(x)}
    <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Como este resultado foi gravado</h2></div><div class="panel-b"><dl class="kv"><dt>Calculado em</dt><dd>${fmtDT(calcEm.toISOString())}, pelo job diário</dd><dt>Cálculo</dt><dd>Nº 1, resultado original do dia</dd><dt>Fórmulas</dt><dd>Atenção v1 e reincidência v1</dd><dt>Política</dt><dd>padrão do grupo</dd></dl>
      <p class="small muted" style="margin-bottom:0">Cada resultado diário guarda a versão da fórmula e da política com que foi calculado, e nada é apagado. O painel mostra o resultado original de cada dia; um recálculo com a política atual aparece só no painel de investigação, sob demanda, identificado como recálculo.</p></div></div>`;
  }

  return { pagina: params => params.ativo ? detalhe(params.ativo) : painel() };
})();

function pageIntelligence() { return IA.pagina(route().params); }
