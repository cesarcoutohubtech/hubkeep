/* Seed de demonstração da Central de Manutenção (CSC).
   Todos os dados são fictícios e gerados de forma determinística (mesma semente = mesmos dados).
   As datas são relativas ao dia em que a demo é aberta, para parecerem sempre atuais.
   Para trocar o nome do cliente, edite DEMO_CONFIG. */

const DEMO_CONFIG = {
  cliente: "Grupo Slaviero",
  produto: "Central de Manutenção",
  plataforma: "EasyGov",
  aviso: "Dados fictícios de demonstração",
  semente: 20260923
};

function buildSeed() {
  // PRNG determinístico (mulberry32)
  let s = DEMO_CONFIG.semente >>> 0;
  const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const weighted = pairs => { const tot = pairs.reduce((x, p) => x + p[1], 0); let r = rnd() * tot; for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; } return pairs[0][0]; };

  const now = new Date();
  const H = 3600e3, D = 24 * H;
  const iso = t => new Date(t).toISOString();

  // ---------- Estrutura: grupo → bandeira → hotel ----------
  const tenant = { id: "t1", nome: DEMO_CONFIG.cliente };
  const bandeiras = [
    { id: "b1", nome: "Linha Business", tenant_id: "t1" },
    { id: "b2", nome: "Linha Essencial", tenant_id: "t1" },
    { id: "b3", nome: "Linha Suítes", tenant_id: "t1", condo: true }
  ];
  const hoteisBase = [
    ["h1", "Hotel Curitiba Batel", "Curitiba", "PR", "b1", 186],
    ["h2", "Hotel Curitiba Centro", "Curitiba", "PR", "b2", 142],
    ["h3", "Hotel São Paulo Paulista", "São Paulo", "SP", "b1", 220],
    ["h4", "Hotel São Paulo Moema", "São Paulo", "SP", "b2", 128],
    ["h5", "Hotel Florianópolis Centro", "Florianópolis", "SC", "b1", 164],
    ["h6", "Hotel Joinville", "Joinville", "SC", "b2", 110],
    ["h7", "Hotel Porto Alegre Moinhos", "Porto Alegre", "RS", "b1", 150],
    ["h8", "Hotel Londrina", "Londrina", "PR", "b2", 96],
    ["h9", "Hotel Campinas", "Campinas", "SP", "b2", 118],
    ["h10", "Hotel Rio Botafogo", "Rio de Janeiro", "RJ", "b1", 198],
    ["h11", "Suítes Balneário Camboriú", "Balneário Camboriú", "SC", "b3", 132],
    ["h12", "Suítes Brasília", "Brasília", "DF", "b3", 104],
    ["h13", "Hotel Maringá", "Maringá", "PR", "b2", 88],
    ["h14", "Hotel Belo Horizonte Savassi", "Belo Horizonte", "MG", "b1", 172]
  ];
  const hoteis = hoteisBase.map(([id, nome, cidade, uf, bandeira_id, uhs], i) => ({
    id, nome, cidade, uf, bandeira_id, tenant_id: "t1", uhs,
    andares: Math.max(6, Math.round(uhs / 16)),
    cod_totvs: "CM" + String(1001 + i)
  }));

  // ---------- Locais (UHs e áreas comuns) ----------
  const areas = ["Casa de máquinas", "Lobby e recepção", "Cozinha", "Restaurante", "Piscina", "Academia", "Lavanderia", "Estacionamento", "Salão de eventos", "Cobertura", "Subsolo técnico", "Corredores"];
  const locais = [];
  hoteis.forEach(h => {
    areas.forEach((a, i) => locais.push({ id: `${h.id}-a${i}`, hotel_id: h.id, tipo: "area", nome: a }));
    const perFloor = Math.ceil(h.uhs / (h.andares - 1));
    let n = 0;
    for (let f = 2; f <= h.andares && n < h.uhs; f++) {
      for (let u = 1; u <= perFloor && n < h.uhs; u++, n++) {
        const num = String(f) + String(u).padStart(2, "0");
        locais.push({ id: `${h.id}-u${num}`, hotel_id: h.id, tipo: "uh", nome: "UH " + num, andar: f, cod_totvs: `${h.cod_totvs}-${num}` });
      }
    }
  });
  const uhsDo = hid => locais.filter(l => l.hotel_id === hid && l.tipo === "uh");
  const areaDo = (hid, nome) => locais.find(l => l.hotel_id === hid && l.nome === nome);

  // ---------- Proprietários (condo-hotel da Linha Suítes) ----------
  const nomesProp = ["Helena Ramos", "Carlos Eduardo Lima", "Beatriz Nogueira", "Fernando Tavares", "Luciana Barros", "Marcos Vieira", "Patrícia Souza", "Roberto Fontes"];
  const proprietarios = nomesProp.map((n, i) => ({ id: "pr" + (i + 1), nome: n }));
  const localProprietario = [];
  ["h11", "h12"].forEach(hid => {
    uhsDo(hid).forEach((u, i) => {
      if (rnd() < 0.55) localProprietario.push({ local_id: u.id, proprietario_id: pick(proprietarios.slice(1)).id });
    });
  });
  // Garante UHs conhecidas para a persona de proprietária
  ["h11-u504", "h11-u712", "h11-u803"].forEach(lid => {
    const ex = localProprietario.find(x => x.local_id === lid);
    if (ex) ex.proprietario_id = "pr1"; else if (locais.find(l => l.id === lid)) localProprietario.push({ local_id: lid, proprietario_id: "pr1" });
  });

  // ---------- Categorias e ativos ----------
  const categorias = [
    { id: "c1", nome: "Elevador", critica: true },
    { id: "c2", nome: "Central de água gelada (chiller)", critica: true },
    { id: "c3", nome: "Gerador", critica: true },
    { id: "c4", nome: "Aquecimento de água (caldeira)", critica: true },
    { id: "c5", nome: "Bomba de recalque", critica: true },
    { id: "c6", nome: "Quadro elétrico", critica: true },
    { id: "c7", nome: "Ar-condicionado split", critica: false },
    { id: "c8", nome: "Câmara fria", critica: true },
    { id: "c9", nome: "Filtro de piscina", critica: false },
    { id: "c10", nome: "Fechadura eletrônica", critica: false },
    { id: "c11", nome: "Frigobar", critica: false },
    { id: "c12", nome: "TV", critica: false },
    { id: "c13", nome: "Hidráulica da UH", critica: false },
    { id: "c14", nome: "Iluminação", critica: false },
    { id: "c15", nome: "Portão e cancela", critica: false }
  ];
  const fabricantes = { c1: ["Atlas Schindler", "Otis", "ThyssenKrupp"], c2: ["Carrier", "Trane", "York"], c3: ["Cummins", "Stemac", "Heimer"], c4: ["Rinnai", "Komeco", "Bosch"], c5: ["KSB", "Schneider", "Grundfos"], c6: ["WEG", "Schneider", "Siemens"], c7: ["Daikin", "LG", "Midea", "Samsung"], c8: ["Plotter Racks", "Danfoss"], c9: ["Jacuzzi", "Dancor"], c10: ["Assa Abloy", "Salto"], c11: ["Electrolux", "Consul"], c12: ["LG", "Samsung"], c13: ["Docol", "Deca"], c14: ["Philips", "Osram"], c15: ["PPA", "Garen"] };
  const ativos = [];
  let at = 0;
  const modelosPorCat = { c1: ["Gen2 Comfort 8 paradas", "Synergy 630 kg"], c2: ["30XA Air-Cooled 120 TR", "RTAF 100 TR"], c3: ["C150 D6 150 kVA", "GEH 200 kVA"], c4: ["REU-2802 FEH", "Therm 8000 S"], c5: ["Etanorm 40-200", "CR 15-4"], c6: ["QGBT 1.600 A"], c7: ["Split Inverter 12.000 BTU", "Split Inverter 18.000 BTU", "Split Hi-Wall 9.000 BTU"], c8: ["Câmara 12 m² média temperatura"], c9: ["Filtro 60 cm com bomba 1 cv"], c10: ["RFID Série 700"], c11: ["Frigobar 80 L"], c12: ['TV 43" hotelaria'], c13: ["Misturador monocomando"], c14: ["Luminária LED 18 W"], c15: ["Cancela automática 3 m"] };
  const addAtivo = (h, cat, local, nome, crit) => {
    at++;
    const inst = now.getTime() - int(200, 3600) * D;
    const garantiaAnos = cat === "c7" ? 3 : cat === "c1" ? 5 : 2;
    const anexos = [{ tipo: "Manual", nome: "Manual do fabricante.pdf" }];
    if (rnd() < 0.7) anexos.push({ tipo: "Nota fiscal", nome: "NF de compra.pdf" });
    if (["c1", "c3", "c6"].includes(cat)) anexos.push({ tipo: "Laudo", nome: cat === "c1" ? "Laudo de inspeção do elevador.pdf" : cat === "c3" ? "Relatório de ensaio de carga.pdf" : "Laudo de termografia.pdf", validade: iso(now.getTime() + int(-20, 300) * D) });
    ativos.push({
      id: "AT-" + String(at).padStart(4, "0"), hotel_id: h.id, local_id: local.id, categoria_id: cat,
      nome, fabricante: pick(fabricantes[cat]), modelo: pick(modelosPorCat[cat]), numero_serie: (cat.toUpperCase() + String(int(100000, 999999))),
      garantia_ate: iso(inst + garantiaAnos * 365 * D), anexos, criticidade: crit, instalado_em: iso(inst),
      qr: "EGV-" + h.cod_totvs + "-" + String(at).padStart(4, "0"), status: "Operando"
    });
  };
  hoteis.forEach(h => {
    const nElev = h.uhs > 160 ? 4 : h.uhs > 110 ? 3 : 2;
    for (let i = 1; i <= nElev; i++) addAtivo(h, "c1", areaDo(h.id, "Casa de máquinas"), `Elevador social ${i}`, "Alta");
    addAtivo(h, "c1", areaDo(h.id, "Casa de máquinas"), "Elevador de serviço", "Alta");
    addAtivo(h, "c2", areaDo(h.id, "Cobertura"), "Chiller principal", "Alta");
    if (h.uhs > 150) addAtivo(h, "c2", areaDo(h.id, "Cobertura"), "Chiller reserva", "Média");
    addAtivo(h, "c3", areaDo(h.id, "Subsolo técnico"), "Gerador de emergência", "Alta");
    addAtivo(h, "c4", areaDo(h.id, "Subsolo técnico"), "Central de aquecimento", "Alta");
    addAtivo(h, "c5", areaDo(h.id, "Subsolo técnico"), "Bomba de recalque 1", "Alta");
    addAtivo(h, "c5", areaDo(h.id, "Subsolo técnico"), "Bomba de recalque 2", "Média");
    addAtivo(h, "c6", areaDo(h.id, "Subsolo técnico"), "Quadro geral de baixa tensão", "Alta");
    addAtivo(h, "c8", areaDo(h.id, "Cozinha"), "Câmara fria de carnes", "Alta");
    addAtivo(h, "c8", areaDo(h.id, "Cozinha"), "Câmara fria de hortifrúti", "Média");
    addAtivo(h, "c9", areaDo(h.id, "Piscina"), "Filtro da piscina", "Baixa");
    addAtivo(h, "c15", areaDo(h.id, "Estacionamento"), "Cancela da garagem", "Baixa");
    addAtivo(h, "c7", areaDo(h.id, "Salão de eventos"), "Split do salão de eventos", "Média");
    addAtivo(h, "c7", areaDo(h.id, "Academia"), "Split da academia", "Baixa");
    // amostra de ativos em UHs
    const uhs = uhsDo(h.id);
    for (let i = 0; i < 6; i++) { const u = pick(uhs); addAtivo(h, "c7", u, `Split ${u.nome}`, "Baixa"); }
  });
  const catNome = id => categorias.find(c => c.id === id).nome;

  // ---------- Pessoas ----------
  const primeiros = ["Ana", "Bruno", "Camila", "Diego", "Eduardo", "Fabiana", "Gustavo", "Igor", "Jéssica", "Leandro", "Márcio", "Natália", "Otávio", "Rafael", "Sérgio", "Tiago", "Vanessa", "Wagner", "Alexandre", "Daniel", "Everton", "Rodrigo", "Cláudio", "André", "Priscila"];
  const sobren = ["Silva", "Santos", "Oliveira", "Pereira", "Costa", "Rodrigues", "Almeida", "Nascimento", "Lima", "Araújo", "Fernandes", "Carvalho", "Gomes", "Martins", "Rocha", "Ribeiro", "Barbosa", "Moreira", "Cardoso", "Teixeira"];
  const usuarios = [
    { id: "u1", nome: "Marina Costa", papel: "Gestora do CSC", escopo: { tipo: "grupo", id: "t1" }, email: "marina.costa@demo.com" },
    { id: "u2", nome: "Ricardo Alves", papel: "Coordenador de bandeira", escopo: { tipo: "bandeira", id: "b1" }, email: "ricardo.alves@demo.com" },
    { id: "u3", nome: "Juliana Prado", papel: "Gerente de hotel", escopo: { tipo: "hotel", id: "h1" }, email: "juliana.prado@demo.com" },
    { id: "u4", nome: "Paulo Mendes", papel: "Técnico", escopo: { tipo: "hotel", id: "h1" }, email: "paulo.mendes@demo.com", tecnico: true },
    { id: "u5", nome: "Helena Ramos", papel: "Proprietária", escopo: { tipo: "proprietario", id: "pr1" }, email: "helena.ramos@demo.com" }
  ];
  const tecnicos = [{ id: "u4", nome: "Paulo Mendes", hotel_id: "h1", especialidade: "Elétrica e climatização" }];
  const esp = ["Elétrica", "Hidráulica", "Climatização", "Manutenção geral", "Refrigeração", "Elétrica e climatização"];
  let uid = 6;
  hoteis.forEach(h => {
    const n = h.uhs > 150 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      if (h.id === "h1" && i === 0) continue;
      const nome = pick(primeiros) + " " + pick(sobren);
      const id = "u" + uid++;
      tecnicos.push({ id, nome, hotel_id: h.id, especialidade: pick(esp) });
      usuarios.push({ id, nome, papel: "Técnico", escopo: { tipo: "hotel", id: h.id }, email: nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ /g, ".") + "@demo.com", tecnico: true });
    }
    const g = pick(primeiros) + " " + pick(sobren);
    usuarios.push({ id: "u" + uid++, nome: g, papel: "Gerente de hotel", escopo: { tipo: "hotel", id: h.id }, email: g.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ /g, ".") + "@demo.com" });
  });
  usuarios.push({ id: "u" + uid++, nome: "Solange Ferreira", papel: "Coordenadora de bandeira", escopo: { tipo: "bandeira", id: "b2" }, email: "solange.ferreira@demo.com" });
  usuarios.push({ id: "u" + uid++, nome: "Otávio Brandão", papel: "Coordenador de bandeira", escopo: { tipo: "bandeira", id: "b3" }, email: "otavio.brandao@demo.com" });
  const solicitantes = ["Recepção", "Governança", "Hóspede (via recepção)", "A&B", "Gerência", "Segurança", "Eventos"];

  // ---------- Políticas de SLA (horas), com herança ----------
  const politicas = [
    { id: "po1", escopo_tipo: "grupo", escopo_id: "t1", sla: { "Crítica": 2, "Alta": 8, "Média": 24, "Baixa": 72 }, horario: "24h, 7 dias", escalonar_em: 80,
      prio_padrao: { c1: "Crítica", c2: "Crítica", c3: "Alta", c4: "Alta", c5: "Crítica", c6: "Alta", c7: "Média", c8: "Crítica", c9: "Baixa", c10: "Alta", c11: "Média", c12: "Baixa", c13: "Média", c14: "Baixa", c15: "Média" } },
    { id: "po2", escopo_tipo: "bandeira", escopo_id: "b3", sla: { "Alta": 4 }, horario: null, escalonar_em: null },
    { id: "po3", escopo_tipo: "hotel", escopo_id: "h3", sla: { "Crítica": 1 }, horario: null, escalonar_em: 70 }
  ];
  const slaEfetivo = (hid, prio) => {
    const h = hoteis.find(x => x.id === hid);
    const ph = politicas.find(p => p.escopo_tipo === "hotel" && p.escopo_id === hid);
    const pb = politicas.find(p => p.escopo_tipo === "bandeira" && p.escopo_id === h.bandeira_id);
    const pg = politicas.find(p => p.escopo_tipo === "grupo");
    return (ph && ph.sla[prio]) || (pb && pb.sla[prio]) || pg.sla[prio];
  };

  // ---------- Chamados corretivos ----------
  const modelos = [
    ["c7", "Ar-condicionado não gela", "uh", 22], ["c7", "Ar-condicionado com barulho", "uh", 10], ["c7", "Ar-condicionado pingando", "uh", 8],
    ["c13", "Vazamento no chuveiro", "uh", 14], ["c13", "Vaso sanitário entupido", "uh", 10], ["c13", "Sem água quente no chuveiro", "uh", 8], ["c13", "Ralo com mau cheiro", "uh", 5],
    ["c10", "Fechadura não reconhece o cartão", "uh", 12], ["c10", "Fechadura sem bateria", "uh", 6],
    ["c11", "Frigobar não refrigera", "uh", 7], ["c12", "TV sem sinal", "uh", 11], ["c12", "Controle remoto não funciona", "uh", 6],
    ["c14", "Lâmpada queimada", "uh", 12], ["c14", "Luminária do corredor apagada", "Corredores", 6],
    ["c1", "Elevador parado entre andares", "Casa de máquinas", 2], ["c1", "Porta do elevador não fecha", "Casa de máquinas", 3],
    ["c2", "Chiller em alarme de alta pressão", "Cobertura", 1], ["c4", "Queda de temperatura da água quente", "Subsolo técnico", 2],
    ["c5", "Bomba de recalque desarmando", "Subsolo técnico", 1], ["c8", "Câmara fria acima de 5 °C", "Cozinha", 2],
    ["c9", "Água da piscina turva", "Piscina", 3], ["c15", "Cancela da garagem travada", "Estacionamento", 4], ["c6", "Disjuntor desarmando no andar", "Subsolo técnico", 2]
  ];
  const prioPorCat = cat => {
    if (["c1", "c2", "c5", "c8"].includes(cat)) return weighted([["Crítica", 60], ["Alta", 40]]);
    if (["c4", "c6", "c3"].includes(cat)) return weighted([["Crítica", 30], ["Alta", 60], ["Média", 10]]);
    if (["c10", "c13"].includes(cat)) return weighted([["Alta", 35], ["Média", 50], ["Baixa", 15]]);
    return weighted([["Alta", 10], ["Média", 50], ["Baixa", 40]]);
  };
  const chamados = [];
  const os = [];
  let chn = 4800, osn = 12000;
  const tecsDo = hid => tecnicos.filter(t => t.hotel_id === hid);
  const pesoHotel = h => h.uhs / 100 * (h.id === "h3" ? 1.25 : h.id === "h8" ? 0.8 : 1);

  const totalChamados = 1000;
  const pesos = hoteis.map(h => [h.id, pesoHotel(h)]);
  for (let i = 0; i < totalChamados; i++) {
    const hid = weighted(pesos);
    const h = hoteis.find(x => x.id === hid);
    const m = weighted(modelos.map(m => [m, m[3]]));
    const [cat, titulo, lugar] = m;
    const local = lugar === "uh" ? pick(uhsDo(hid)) : areaDo(hid, lugar);
    const ativo = lugar === "uh"
      ? (cat === "c7" ? ativos.find(a => a.local_id === local.id && a.categoria_id === "c7") : null)
      : pick(ativos.filter(a => a.hotel_id === hid && a.categoria_id === cat).concat([null]));
    const prio = prioPorCat(cat);
    const slaH = slaEfetivo(hid, prio);
    // distribuição: mais chamados recentes
    const ageDays = Math.pow(rnd(), 1.1) * 90;
    const aberto = now.getTime() - ageDays * D - int(0, 23) * H;
    const tecs = tecsDo(hid);
    const tec = pick(tecs);
    const eventos = [{ t: iso(aberto), tipo: "abertura", txt: `Chamado aberto por ${pick(solicitantes)}` }];
    let status, atendido = null, encerrado = null, tecnico_id = null;
    const ageH = (now.getTime() - aberto) / H;
    // tempo de reparo (h) proporcional ao SLA, com parte estourando
    const fator = weighted([[0.25, 32], [0.5, 32], [0.8, 23], [1.3, 8], [2.2, 5]]);
    const reparoH = Math.max(0.3, slaH * fator * (0.7 + rnd() * 0.6));
    const backlog = ageDays > 3 && ageDays < 12 && rnd() < 0.02;
    const recente = ageH < slaH * 1.05 && rnd() < 0.6;
    if (ageH > reparoH + 6 && !backlog && !recente) {
      status = rnd() < 0.03 ? "Cancelado" : "Encerrado";
      tecnico_id = tec.id;
      atendido = aberto + Math.min(reparoH * 0.3, 1.5) * H;
      encerrado = aberto + reparoH * H;
      eventos.push({ t: iso(aberto + 0.1 * H), tipo: "sistema", txt: `Prazo de SLA definido: ${slaH} h (prioridade ${prio})` });
      eventos.push({ t: iso(atendido), tipo: "atribuicao", txt: `Atribuído a ${tec.nome}` });
      if (status === "Cancelado") eventos.push({ t: iso(encerrado), tipo: "status", txt: "Cancelado: chamado duplicado" });
      else {
        eventos.push({ t: iso(atendido + 0.2 * H), tipo: "status", txt: "Em atendimento" });
        eventos.push({ t: iso(encerrado - 0.2 * H), tipo: "comentario", txt: pick(["Peça substituída e teste realizado.", "Ajuste feito, equipamento operando normalmente.", "Limpeza e regulagem concluídas.", "Troca de componente e verificação de funcionamento."]) });
        eventos.push({ t: iso(encerrado), tipo: "status", txt: "Encerrado com aceite do solicitante" });
      }
    } else {
      status = backlog ? "Aguardando peça" : weighted([["Aberto", 26], ["Em atendimento", 44], ["Aguardando peça", 10], ["Aguardando aceite", 20]]);
      eventos.push({ t: iso(aberto + 0.1 * H), tipo: "sistema", txt: `Prazo de SLA definido: ${slaH} h (prioridade ${prio})` });
      if (status !== "Aberto") {
        tecnico_id = tec.id;
        atendido = aberto + Math.min(ageH * 0.2, 1.2) * H;
        eventos.push({ t: iso(atendido), tipo: "atribuicao", txt: `Atribuído a ${tec.nome}` });
        eventos.push({ t: iso(atendido + 0.1 * H), tipo: "status", txt: "Em atendimento" });
      }
      if (status === "Aguardando peça") eventos.push({ t: iso(atendido + 0.5 * H), tipo: "status", txt: "Aguardando peça: " + pick(["compressor", "placa eletrônica", "sifão", "bateria da fechadura", "motor do ventilador", "rolamento"]) });
      if (status === "Aguardando aceite") eventos.push({ t: iso(Math.min(now.getTime() - 0.2 * H, atendido + 0.8 * H)), tipo: "status", txt: "Serviço concluído, aguardando aceite do solicitante" });
    }
    chn++;
    const ch = {
      id: "CH-" + chn, hotel_id: hid, local_id: local.id, ativo_id: ativo ? ativo.id : null, categoria_id: cat,
      titulo, descricao: `${titulo}. Relatado em ${local.nome}.`, prioridade: prio, status,
      aberto_em: iso(aberto), prazo_sla: iso(aberto + slaH * H), sla_h: slaH,
      atendido_em: atendido ? iso(atendido) : null, encerrado_em: encerrado ? iso(encerrado) : null,
      tecnico_id, solicitante: eventos[0].txt.replace("Chamado aberto por ", ""), eventos,
      fotos: int(0, 3)
    };
    chamados.push(ch);
    if (status !== "Aberto" && status !== "Cancelado") {
      osn++;
      os.push({
        id: "OS-" + osn, origem: "corretiva", chamado_id: ch.id, plano_id: null, hotel_id: hid, local_id: local.id, ativo_id: ch.ativo_id,
        titulo: titulo, responsavel_id: tecnico_id, status: status === "Encerrado" ? "Concluída" : "Em execução",
        programada_para: ch.atendido_em, inicio: ch.atendido_em, fim: ch.encerrado_em,
        horas: encerrado ? Math.round((encerrado - atendido) / H * 10) / 10 : null,
        checklist: [], materiais: status === "Encerrado" ? pick(["", "1 filtro", "Fita veda-rosca, 1 sifão", "2 pilhas AA", "Gás R410A (0,5 kg)", "1 reator"]) : ""
      });
    }
  }
  chamados.sort((a, b) => b.aberto_em.localeCompare(a.aberto_em));

  // Chamados de destaque para a demo (garantem cenários visíveis)
  const destaque = (hid, lid, cat, titulo, prio, horasAtras, status, tec) => {
    if (!locais.find(l => l.id === lid)) throw new Error("Local do seed não existe: " + lid);
    chn++;
    const aberto = now.getTime() - horasAtras * H;
    const slaH = slaEfetivo(hid, prio);
    const ev = [{ t: iso(aberto), tipo: "abertura", txt: "Chamado aberto por Recepção" }, { t: iso(aberto + 0.05 * H), tipo: "sistema", txt: `Prazo de SLA definido: ${slaH} h (prioridade ${prio})` }];
    if (tec) { ev.push({ t: iso(aberto + 0.3 * H), tipo: "atribuicao", txt: `Atribuído a ${tecnicos.find(t => t.id === tec).nome}` }); ev.push({ t: iso(aberto + 0.4 * H), tipo: "status", txt: "Em atendimento" }); }
    const a = ativos.find(x => x.hotel_id === hid && titulo.includes(x.nome)) || ativos.find(x => x.local_id === lid && x.categoria_id === cat) || ativos.find(x => x.hotel_id === hid && x.categoria_id === cat);
    chamados.unshift({ id: "CH-" + chn, hotel_id: hid, local_id: lid, ativo_id: a ? a.id : null, categoria_id: cat, titulo, descricao: titulo + ".", prioridade: prio, status, aberto_em: iso(aberto), prazo_sla: iso(aberto + slaH * H), sla_h: slaH, atendido_em: tec ? iso(aberto + 0.3 * H) : null, encerrado_em: null, tecnico_id: tec || null, solicitante: "Recepção", eventos: ev, fotos: 2 });
  };
  destaque("h1", areaDo("h1", "Casa de máquinas").id, "c1", "Elevador social 2 parado no 9º andar", "Crítica", 1.4, "Em atendimento", "u4");
  destaque("h1", "h1-u812", "c7", "Ar-condicionado não gela", "Média", 3, "Em atendimento", "u4");
  destaque("h1", "h1-u1105", "c10", "Fechadura não reconhece o cartão", "Alta", 0.6, "Aberto", null);
  destaque("h3", areaDo("h3", "Cozinha").id, "c8", "Câmara fria de carnes a 8 °C", "Crítica", 1.6, "Aberto", null);
  destaque("h11", "h11-u504", "c13", "Infiltração no teto do banheiro", "Alta", 5, "Em atendimento", tecsDo("h11")[0].id);
  destaque("h11", "h11-u712", "c7", "Ar-condicionado com barulho", "Média", 20, "Aguardando peça", tecsDo("h11")[1].id);

  // ---------- Planos preventivos ----------
  const planosBase = [
    ["c1", "Manutenção mensal de elevadores", 30, ["Inspecionar cabos e polias", "Testar freio de segurança", "Verificar nivelamento nos andares", "Testar interfone e alarme", "Lubrificar guias", "Registrar no livro de ocorrências"]],
    ["c2", "Inspeção mensal do chiller", 30, ["Registrar pressões de alta e baixa", "Verificar temperatura de entrada e saída", "Checar vazamentos de fluido", "Limpar filtros de água", "Verificar corrente dos compressores"]],
    ["c3", "Teste quinzenal do gerador", 15, ["Verificar nível de óleo e combustível", "Partida em vazio por 15 minutos", "Testar transferência automática", "Checar bateria de partida", "Registrar horímetro"]],
    ["c4", "Revisão trimestral do aquecimento", 90, ["Limpar queimadores", "Verificar pressão de gás", "Testar válvula de segurança", "Medir temperatura de saída"]],
    ["c5", "Inspeção mensal das bombas", 30, ["Verificar ruído e vibração", "Checar selo mecânico", "Medir corrente do motor", "Testar alternância entre bombas"]],
    ["c6", "Termografia semestral de quadros", 180, ["Termografia dos barramentos", "Reapertar conexões", "Verificar disjuntores e DR", "Atualizar diagrama unifilar"]],
    ["c7", "Limpeza trimestral de splits", 90, ["Limpar filtros", "Higienizar evaporadora", "Verificar dreno", "Medir temperatura de insuflamento"]],
    ["c8", "Inspeção mensal de câmaras frias", 30, ["Registrar temperatura", "Verificar vedação da porta", "Checar degelo", "Limpar condensador"]],
    ["c9", "Tratamento semanal da piscina", 7, ["Medir pH e cloro", "Retrolavar filtro", "Limpar cestos", "Registrar leituras"]]
  ];
  const medicoes = {
    c2: [{ t: "Temperatura da água gelada na saída", tipo: "medicao", unidade: "°C", min: 6, max: 8 }],
    c3: [{ t: "Tensão de saída entre fases", tipo: "medicao", unidade: "V", min: 210, max: 230 }],
    c4: [{ t: "Temperatura da água na saída", tipo: "medicao", unidade: "°C", min: 55, max: 65 }],
    c5: [{ t: "Corrente do motor", tipo: "medicao", unidade: "A", min: 8, max: 12 }],
    c8: [{ t: "Temperatura interna da câmara", tipo: "medicao", unidade: "°C", min: -2, max: 4 }],
    c9: [{ t: "pH da água", tipo: "medicao", unidade: "", min: 7.2, max: 7.8 }, { t: "Cloro livre", tipo: "medicao", unidade: "ppm", min: 1, max: 3 }]
  };
  const planos = planosBase.map(([cat, nome, dias, checklist], i) => ({ id: "PL-" + (101 + i), categoria_id: cat, nome, periodicidade_dias: dias,
    checklist: [...(medicoes[cat] || []), ...checklist.filter(t => !["Verificar temperatura de entrada e saída", "Medir temperatura de saída", "Medir corrente do motor", "Registrar temperatura", "Medir pH e cloro"].includes(t)).map(t => ({ t, tipo: "check" }))],
    escopo_tipo: "grupo", escopo_id: "t1", ativo: true }));

  // OS preventivas: últimos 60 dias até próximos 35 dias
  const hojeZero = new Date(now); hojeZero.setHours(0, 0, 0, 0);
  planos.forEach(pl => {
    const alvos = ativos.filter(a => a.categoria_id === pl.categoria_id && (pl.categoria_id !== "c7" || !a.local_id.includes("-u")));
    alvos.forEach(a => {
      const offset = int(0, pl.periodicidade_dias - 1);
      for (let d = -60 + offset; d <= Math.max(35, pl.periodicidade_dias); d += pl.periodicidade_dias) {
        const dia = hojeZero.getTime() + d * D + (8 + int(0, 8)) * H;
        const passado = dia < now.getTime() - 4 * H;
        const tecs = tecsDo(a.hotel_id);
        const resp = pick(tecs);
        let status;
        if (!passado) status = "Programada";
        else status = weighted([["Concluída", a.hotel_id === "h8" ? 76 : 95.5], ["Atrasada", a.hotel_id === "h8" ? 24 : 4.5]]);
        if (status === "Atrasada" && d < -25) status = "Concluída";
        osn++;
        const concl = status === "Concluída";
        os.push({
          id: "OS-" + osn, origem: "preventiva", chamado_id: null, plano_id: pl.id, hotel_id: a.hotel_id, local_id: a.local_id, ativo_id: a.id,
          titulo: pl.nome.replace(/ (mensal|quinzenal|trimestral|semestral|semanal)/, "") + " — " + a.nome,
          responsavel_id: resp.id, status, programada_para: iso(dia),
          inicio: concl ? iso(dia) : null, fim: concl ? iso(dia + (0.5 + rnd() * 2) * H) : null,
          horas: concl ? Math.round((0.5 + rnd() * 2) * 10) / 10 : null,
          checklist: pl.checklist.map(it => {
            if (it.tipo !== "medicao") return { ...it, ok: concl };
            if (!concl) return { ...it, valor: null, fora: false };
            const fora = rnd() < 0.05, span = it.max - it.min;
            const v = fora ? it.max + span * (0.2 + rnd() * 0.5) : it.min + span * (0.15 + rnd() * 0.7);
            return { ...it, valor: Math.round(v * 10) / 10, fora };
          }), materiais: ""
        });
      }
    });
  });

  // OS do dia para o técnico Paulo (app do técnico)
  const paulo = os.filter(o => o.hotel_id === "h1" && o.origem === "preventiva" && o.status === "Programada").slice(0, 3);
  paulo.forEach((o, i) => { o.responsavel_id = "u4"; o.programada_para = iso(hojeZero.getTime() + (9 + i * 2) * H); });
  os.filter(o => o.hotel_id === "h1" && o.origem === "preventiva" && o.status === "Atrasada").slice(0, 1).forEach(o => o.responsavel_id = "u4");

  // ---------- Paradas de ativos (indisponibilidade) ----------
  const ativo_parada = [];
  chamados.filter(c => c.ativo_id && ["c1", "c2", "c5", "c8", "c3", "c4"].includes(c.categoria_id) && (c.prioridade === "Crítica" || c.prioridade === "Alta")).forEach(c => {
    const fim = c.status === "Encerrado" ? c.encerrado_em : null;
    if (c.status === "Cancelado") return;
    ativo_parada.push({ id: "PA-" + (ativo_parada.length + 1), ativo_id: c.ativo_id, chamado_id: c.id, inicio: c.aberto_em, fim, motivo: c.titulo });
  });
  ativo_parada.filter(p => !p.fim).forEach(p => { const a = ativos.find(x => x.id === p.ativo_id); if (a) a.status = "Parado"; });

  // ---------- Modelos de ativo e implantação ----------
  const modelos_ativo = [
    ["MA-01", "c7", "Split Inverter 12.000 BTU", "Daikin", "PL-107"], ["MA-02", "c7", "Split Inverter 18.000 BTU", "LG", "PL-107"],
    ["MA-03", "c1", "Elevador 8 paradas, 630 kg", "Atlas Schindler", "PL-101"], ["MA-04", "c2", "Chiller 120 TR condensação a ar", "Carrier", "PL-102"],
    ["MA-05", "c3", "Gerador diesel 150 kVA", "Cummins", "PL-103"], ["MA-06", "c5", "Bomba centrífuga de recalque", "KSB", "PL-105"],
    ["MA-07", "c8", "Câmara fria média temperatura", "Danfoss", "PL-108"], ["MA-08", "c9", "Filtro de piscina com bomba 1 cv", "Dancor", "PL-109"]
  ].map(([id, categoria_id, nome, fabricante, plano_id]) => ({ id, categoria_id, nome, fabricante, plano_id }));
  const implantacao = hoteis.map((h, i) => {
    const criticos = ativos.filter(a => a.hotel_id === h.id && a.criticidade !== "Baixa").length;
    const previstos = criticos + int(4, 14);
    const pct = i < 3 ? 1 : i < 6 ? 0.55 + rnd() * 0.35 : i < 10 ? 0.1 + rnd() * 0.35 : 0;
    const cad = Math.round(previstos * pct);
    return { hotel_id: h.id, previstos, cadastrados: cad, etiquetados: Math.round(cad * (i < 3 ? 1 : 0.6 + rnd() * 0.3)), onda: i < 3 ? "Piloto" : i < 10 ? "Onda 1" : "Onda 2" };
  });
  const capturas_celular = [
    { id: "CP-1", hotel_id: "h4", local: "Casa de máquinas", categoria_id: "c5", fabricante: "Schneider", modelo: "BC-92", foto: 2, por: "Técnico do Hotel São Paulo Moema" },
    { id: "CP-2", hotel_id: "h4", local: "Cozinha", categoria_id: "c8", fabricante: "Danfoss", modelo: "", foto: 1, por: "Técnico do Hotel São Paulo Moema" },
    { id: "CP-3", hotel_id: "h5", local: "Cobertura", categoria_id: "c2", fabricante: "Trane", modelo: "RTAF 100 TR", foto: 3, por: "Técnico do Hotel Florianópolis Centro" }
  ];

  // ---------- Integração TOTVS CM (somente leitura) ----------
  const minAtras = m => iso(now.getTime() - m * 60e3);
  const integracao = {
    modo: "Somente leitura",
    conexao: "Agente local via HTTPS (usuário de banco sem permissão de escrita)",
    views: [
      { nome: "vw_csc_hoteis", conteudo: "Hotéis e códigos no CM", frequencia: "Diária", ultima: minAtras(612), linhas: hoteis.length, status: "ok" },
      { nome: "vw_csc_unidades", conteudo: "UHs, tipo e andar", frequencia: "Diária", ultima: minAtras(608), linhas: locais.filter(l => l.tipo === "uh").length, status: "ok" },
      { nome: "vw_csc_status_uh", conteudo: "Ocupada, vaga, bloqueada", frequencia: "A cada 10 min", ultima: minAtras(4), linhas: locais.filter(l => l.tipo === "uh").length, status: "ok" },
      { nome: "vw_csc_bloqueios", conteudo: "Bloqueios de UH por manutenção", frequencia: "A cada 15 min", ultima: minAtras(11), linhas: 37, status: "ok" },
      { nome: "vw_csc_proprietarios", conteudo: "Proprietário por UH (condo-hotel)", frequencia: "Diária", ultima: minAtras(1480), linhas: localProprietario.length, status: "atraso" }
    ],
    execucoes: []
  };
  for (let i = 0; i < 14; i++) {
    const v = pick(integracao.views);
    integracao.execucoes.push({ t: minAtras(i * 17 + int(1, 9)), view: v.nome, linhas: int(0, 60), duracao_s: int(2, 38), resultado: i === 5 ? "Falha: tempo de conexão esgotado (nova tentativa em 5 min)" : "Sucesso" });
  }
  // status de UH (vindo do CM), para exibir no detalhe
  const statusUH = {};
  locais.filter(l => l.tipo === "uh").forEach(l => { statusUH[l.id] = weighted([["Ocupada", 68], ["Vaga limpa", 18], ["Vaga suja", 9], ["Bloqueada", 5]]); });
  chamados.filter(c => c.status !== "Encerrado" && c.status !== "Cancelado" && c.local_id.includes("-u") && (c.prioridade === "Alta" || c.prioridade === "Crítica")).forEach(c => { if (rnd() < 0.6) statusUH[c.local_id] = "Bloqueada"; });

  // ---------- Auditoria ----------
  const auditoria = [];
  chamados.slice(0, 60).forEach(c => c.eventos.forEach(e => {
    if (e.tipo === "abertura" || e.tipo === "status" || e.tipo === "atribuicao") {
      const u = e.tipo === "abertura" ? "Recepção" : (tecnicos.find(t => t.id === c.tecnico_id) || {}).nome || "Sistema";
      auditoria.push({ t: e.t, usuario: u, entidade: "Chamado", registro: c.id, hotel_id: c.hotel_id, acao: e.txt });
    }
  }));
  auditoria.push({ t: minAtras(60 * 26), usuario: "Marina Costa", entidade: "Política", registro: "po3", hotel_id: "h3", acao: "SLA de prioridade Crítica no Hotel São Paulo Paulista alterado de 2 h para 1 h" });
  auditoria.push({ t: minAtras(60 * 50), usuario: "Marina Costa", entidade: "Usuário", registro: "u5", hotel_id: "h11", acao: "Acesso de proprietária concedido a Helena Ramos (3 UHs)" });
  auditoria.sort((a, b) => b.t.localeCompare(a.t));

  return { versao: 4, gerado_em: iso(now), tenant, bandeiras, hoteis, locais, proprietarios, localProprietario, categorias, ativos, ativo_parada, modelos_ativo, implantacao, capturas_celular, usuarios, tecnicos, politicas, chamados, os, planos, integracao, statusUH, auditoria };
}
