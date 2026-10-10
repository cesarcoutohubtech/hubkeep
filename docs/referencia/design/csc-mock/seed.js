/* Seed de demonstração da Central de Manutenção (CSC).
   Todos os dados são fictícios e gerados de forma determinística (mesma semente = mesmos dados).
   As datas são relativas ao dia em que a demo é aberta, para parecerem sempre atuais.
   Para trocar o nome do cliente, edite DEMO_CONFIG. */

const DEMO_CONFIG = {
  cliente: "Grupo Hotel",
  produto: "HubKeep",
  descricao: "Operação de manutenção da rede hoteleira",
  plataforma: "EasyGov",
  aviso: "Dados fictícios de demonstração",
  semente: 20260923
};

/* Calendário de SLA: categorias em horário comercial não contam prazo fora do expediente nem em feriados.
   Expediente de demonstração: segunda a sexta, 8h às 18h; sábado, 8h às 12h. Feriados nacionais fixos. */
const FERIADOS_FIXOS = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];
function ehFeriado(d) { return FERIADOS_FIXOS.includes(String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")); }
function janelaDoDia(d) { const w = d.getDay(); if (w === 0 || ehFeriado(d)) return null; return w === 6 ? [8, 12] : [8, 18]; }
function somarHorasUteis(inicioMs, horas) {
  let restante = horas * 3600e3, cur = new Date(inicioMs);
  for (let guarda = 0; guarda < 400 && restante > 0; guarda++) {
    const jan = janelaDoDia(cur);
    const ini = new Date(cur); const fim = new Date(cur);
    if (jan) { ini.setHours(jan[0], 0, 0, 0); fim.setHours(jan[1], 0, 0, 0); }
    if (!jan || cur >= fim) { cur = new Date(cur); cur.setDate(cur.getDate() + 1); cur.setHours(0, 0, 0, 0); continue; }
    if (cur < ini) cur = ini;
    const disp = fim - cur;
    if (disp >= restante) return cur.getTime() + restante;
    restante -= disp; cur = new Date(fim); cur.setDate(cur.getDate() + 1); cur.setHours(0, 0, 0, 0);
  }
  return cur.getTime();
}
const CAL_COMERCIAL = ["c9", "c16"];
function prazoSla(cat, inicioMs, horas) { return CAL_COMERCIAL.includes(cat) ? somarHorasUteis(inicioMs, horas) : inicioMs + horas * 3600e3; }

function buildSeed() {
  // PRNG determinístico (mulberry32)
  let s = DEMO_CONFIG.semente >>> 0;
  const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let s2 = (DEMO_CONFIG.semente ^ 0x5bd1e995) >>> 0;
  const rnd2 = () => { s2 |= 0; s2 = (s2 + 0x6D2B79F5) | 0; let t = Math.imul(s2 ^ (s2 >>> 15), 1 | s2); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick2 = a => a[Math.floor(rnd2() * a.length)];
  const int2 = (a, b) => a + Math.floor(rnd2() * (b - a + 1));
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
  // Modelo contratual: define quem manda, quem aprova e quem paga. O piloto cobre a matriz.
  const MODELO = { h1: "Próprio", h2: "Próprio", h3: "Próprio", h4: "Administrado", h5: "Próprio", h6: "Próprio", h7: "Arrendado", h8: "Arrendado", h9: "Próprio", h10: "Administrado", h11: "Administrado", h12: "Administrado", h13: "Próprio", h14: "Próprio" };
  const PILOTO = { h1: "Urbano próprio", h2: "Econômico próprio", h11: "Administrado (condo-hotel)", h7: "Arrendado" };
  const hoteis = hoteisBase.map(([id, nome, cidade, uf, bandeira_id, uhs], i) => ({
    id, nome, cidade, uf, bandeira_id, tenant_id: "t1", uhs,
    andares: Math.max(6, Math.round(uhs / 16)),
    cod_totvs: "PMS" + String(1001 + i),
    modelo: MODELO[id], piloto: PILOTO[id] || null, fuso: "America/Sao_Paulo"
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
        const ed = ["h3", "h11"].includes(h.id) ? (u <= Math.ceil(perFloor / 2) ? "Torre A" : "Torre B") : null;
        locais.push({ id: `${h.id}-u${num}`, hotel_id: h.id, tipo: "uh", nome: "UH " + num, andar: f, cod_totvs: `${h.cod_totvs}-${num}`, edificacao: ed });
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
    { id: "c15", nome: "Portão e cancela", critica: false },
    { id: "c16", nome: "Pintura e acabamento", critica: false }
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
  // Criticidade fixa de 1 a 5 (os nomes de cada nível são configuráveis na política do grupo)
  const crit5 = a => {
    if (/^Elevador|^Chiller principal|^Gerador|^Quadro geral/.test(a.nome)) return 5;
    if (a.criticidade === "Alta") return 4;
    if (a.criticidade === "Média") return 3;
    if (/^Cancela/.test(a.nome)) return 1;
    return 2;
  };
  ativos.forEach(a => { a.criticidade = crit5(a); a.comprado_em = iso(+new Date(a.instalado_em) - int2(10, 75) * D); });

  // ---------- Pessoas ----------
  const primeiros = ["Ana", "Bruno", "Camila", "Diego", "Eduardo", "Fabiana", "Gustavo", "Igor", "Jéssica", "Leandro", "Márcio", "Natália", "Otávio", "Rafael", "Sérgio", "Tiago", "Vanessa", "Wagner", "Alexandre", "Daniel", "Everton", "Rodrigo", "Cláudio", "André", "Priscila"];
  const sobren = ["Silva", "Santos", "Oliveira", "Pereira", "Costa", "Rodrigues", "Almeida", "Nascimento", "Lima", "Araújo", "Fernandes", "Carvalho", "Gomes", "Martins", "Rocha", "Ribeiro", "Barbosa", "Moreira", "Cardoso", "Teixeira"];
  const usuarios = [
    { id: "u1", nome: "Marina Costa", papel: "Admin do grupo e Gestora do CSC", escopo: { tipo: "grupo", id: "t1" }, email: "marina.costa@demo.com" },
    { id: "u2", nome: "Ricardo Alves", papel: "Gestor CSC da bandeira", escopo: { tipo: "bandeira", id: "b1" }, email: "ricardo.alves@demo.com" },
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
  usuarios.push({ id: "u" + uid++, nome: "Solange Ferreira", papel: "Gestora CSC da bandeira", escopo: { tipo: "bandeira", id: "b2" }, email: "solange.ferreira@demo.com" });
  usuarios.push({ id: "u" + uid++, nome: "Otávio Brandão", papel: "Gestor CSC da bandeira", escopo: { tipo: "bandeira", id: "b3" }, email: "otavio.brandao@demo.com" });
  // Papéis que não aparecem no seletor da demonstração, mas existem no produto
  usuarios.push({ id: "u90", nome: "Augusto Bittencourt", papel: "Locador", escopo: { tipo: "locador", id: "h7" }, email: "augusto.bittencourt@demo.com" });
  usuarios.push({ id: "u91", nome: "Lúcia Andrade", papel: "Admin do grupo", escopo: { tipo: "grupo", id: "t1" }, email: "lucia.andrade@demo.com" });
  usuarios.push({ id: "u92", nome: "Rafael Teixeira", papel: "Implantador", escopo: { tipo: "hotel", id: "h6" }, email: "rafael.teixeira@demo.com", valido_ate: iso(now.getTime() + 18 * D) });
  usuarios.push({ id: "u93", nome: "Recepção Curitiba Batel", papel: "Solicitante", escopo: { tipo: "hotel", id: "h1" }, email: "recepcao.batel@demo.com" });
  const solicitantes = ["Recepção", "Governança", "Hóspede (via recepção)", "A&B", "Gerência", "Segurança", "Eventos"];

  // ---------- Políticas de SLA (horas), com herança ----------
  const politicas = [
    { id: "po1", escopo_tipo: "grupo", escopo_id: "t1", sla: { "Crítica": 2, "Alta": 8, "Média": 24, "Baixa": 72 }, horario: "24h, 7 dias", escalonar_em: 80,
      prio_padrao: { c1: "Crítica", c2: "Crítica", c3: "Alta", c4: "Alta", c5: "Crítica", c6: "Alta", c7: "Média", c8: "Crítica", c9: "Baixa", c10: "Alta", c11: "Média", c12: "Baixa", c13: "Média", c14: "Baixa", c15: "Média", c16: "Baixa" },
      calendario_comercial: CAL_COMERCIAL.slice(), expediente: "Segunda a sexta, 8h às 18h; sábado, 8h às 12h", feriados: "Nacionais, estaduais e municipais do hotel, e os cadastrados pelo próprio hotel",
      criticidade_nomes: { 5: "Crítico para a operação", 4: "Alto", 3: "Médio", 2: "Baixo", 1: "Mínimo" },
      codigos_obrigatorios: false,
      inteligencia: { versao: "v2", limite_atencao: 70, janela_dias: 180, limite_horas_paradas: 48, limite_custo_12m: 10000, min_medicoes: 3,
        pesos: { reincidencia: 20, parada: 15, impacto_hospede: 15, criticidade: 15, custo: 10, preventiva_atrasada: 10, medicoes: 10, garantia: 5, uh_dias: 0 },
        efetividade: { janela_dias: 90, reducao_observada: 60, reducao_parcial: 25, aumento_observado: 20, min_chamados_antes: 3 },
        sistemico: { mesmo_modelo: { ativa: true, min_hoteis: 3, min_chamados: 6, min_ativos: 5, janela_dias: 90, taxa_vezes_base: 2, taxa_minima: 0.3 },
          mesmo_andar: { ativa: false, min_locais: 5, janela_dias: 10 }, mesma_area_comum: { ativa: false, min_ocorrencias: 5, janela_dias: 30 },
          mesmo_fornecedor: { ativa: false, janela_dias: 180, dias_apos: 30, min_concluidas: 5, limiar_percentual: 30 }, crescimento: { ativa: false, percentual: 50, min_atual: 5, janela_dias: 30 } } } },
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
      aberto_em: iso(aberto), prazo_sla: iso(prazoSla(cat, aberto, slaH)), sla_h: slaH,
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
    chamados.unshift({ id: "CH-" + chn, hotel_id: hid, local_id: lid, ativo_id: a ? a.id : null, categoria_id: cat, titulo, descricao: titulo + ".", prioridade: prio, status, aberto_em: iso(aberto), prazo_sla: iso(prazoSla(cat, aberto, slaH)), sla_h: slaH, atendido_em: tec ? iso(aberto + 0.3 * H) : null, encerrado_em: null, tecnico_id: tec || null, solicitante: "Recepção", eventos: ev, fotos: 2 });
  };
  destaque("h1", areaDo("h1", "Casa de máquinas").id, "c1", "Elevador social 2 parado no 9º andar", "Crítica", 1.4, "Em atendimento", "u4");
  destaque("h1", "h1-u812", "c7", "Ar-condicionado não gela", "Média", 3, "Em atendimento", "u4");
  destaque("h1", "h1-u1105", "c10", "Fechadura não reconhece o cartão", "Alta", 0.6, "Aberto", null);
  destaque("h3", areaDo("h3", "Cozinha").id, "c8", "Câmara fria de carnes a 8 °C", "Crítica", 1.6, "Aberto", null);
  destaque("h11", "h11-u504", "c13", "Infiltração no teto do banheiro", "Alta", 5, "Em atendimento", tecsDo("h11")[0].id);
  destaque("h11", "h11-u712", "c7", "Ar-condicionado com barulho", "Média", 20, "Aguardando peça", tecsDo("h11")[1].id);

  // ---------- Planos preventivos ----------
  const planosBase = [
    ["c1", "Manutenção mensal de elevadores", 30, [{ t: "Condição dos cabos de tração", tipo: "lista", opcoes: ["Bom", "Desgaste leve", "Substituir"] }, "Inspecionar cabos e polias", "Testar freio de segurança", "Verificar nivelamento nos andares", "Testar interfone e alarme", "Lubrificar guias", "Registrar no livro de ocorrências"]],
    ["c2", "Inspeção mensal do chiller", 30, ["Registrar pressões de alta e baixa", "Verificar temperatura de entrada e saída", "Checar vazamentos de fluido", "Limpar filtros de água", "Verificar corrente dos compressores"]],
    ["c3", "Teste quinzenal do gerador", 15, ["Verificar nível de óleo e combustível", "Partida em vazio por 15 minutos", "Testar transferência automática", "Checar bateria de partida", { t: "Foto do painel com o horímetro", tipo: "foto" }, { t: "Data da próxima troca de óleo", tipo: "data" }]],
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
    checklist: [...(medicoes[cat] || []), ...checklist.filter(t => typeof t !== "string" || !["Verificar temperatura de entrada e saída", "Medir temperatura de saída", "Medir corrente do motor", "Registrar temperatura", "Medir pH e cloro"].includes(t)).map(t => typeof t === "string" ? { t, tipo: "check" } : t)],
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
            if (it.tipo === "lista") return { ...it, valor: concl ? it.opcoes[0] : null };
            if (it.tipo === "data") return { ...it, valor: concl ? new Date(dia + 90 * D).toISOString().slice(0, 10) : null };
            if (it.tipo === "foto") return { ...it, ok: concl };
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
  const ONDA = { h1: 0, h2: 0, h7: 0, h11: 0, h3: 1, h4: 1, h5: 1, h6: 1, h9: 1, h10: 1, h8: 2, h12: 2, h13: 2, h14: 2 };
  const implantacao = hoteis.map(h => {
    const o = ONDA[h.id];
    const criticos = ativos.filter(a => a.hotel_id === h.id && a.criticidade >= 3).length;
    const previstos = criticos + int(4, 14);
    const pct = o === 0 ? 1 : o === 1 ? (h.id === "h6" ? 0.35 : 0.45 + rnd() * 0.4) : h.id === "h8" ? 0.15 : 0;
    const cad = Math.round(previstos * pct);
    return { hotel_id: h.id, previstos, cadastrados: cad, etiquetados: Math.round(cad * (o === 0 ? 1 : 0.6 + rnd() * 0.3)), onda: o === 0 ? "Piloto" : o === 1 ? "Onda 1" : "Onda 2" };
  });
  const capturas_celular = [
    { id: "CP-1", hotel_id: "h4", local: "Casa de máquinas", categoria_id: "c5", fabricante: "Schneider", modelo: "BC-92", foto: 2, por: "Técnico do Hotel São Paulo Moema" },
    { id: "CP-2", hotel_id: "h4", local: "Cozinha", categoria_id: "c8", fabricante: "Danfoss", modelo: "", foto: 1, por: "Técnico do Hotel São Paulo Moema" },
    { id: "CP-3", hotel_id: "h5", local: "Cobertura", categoria_id: "c2", fabricante: "Trane", modelo: "RTAF 100 TR", foto: 3, por: "Técnico do Hotel Florianópolis Centro" }
  ];

  // ---------- Integração PMS (somente leitura) ----------
  const minAtras = m => iso(now.getTime() - m * 60e3);
  const integracao = {
    modo: "Somente leitura",
    conexao: "Agente local via HTTPS (usuário de banco sem permissão de escrita)",
    views: [
      { nome: "vw_csc_hoteis", conteudo: "Hotéis e códigos no PMS", frequencia: "Diária", ultima: minAtras(612), linhas: hoteis.length, status: "ok" },
      { nome: "vw_csc_unidades", conteudo: "UHs, tipo e andar", frequencia: "Diária", ultima: minAtras(608), linhas: locais.filter(l => l.tipo === "uh").length, status: "ok" },
      { nome: "vw_csc_status_uh", conteudo: "Ocupada, vaga, bloqueada", frequencia: "A cada 5 min", ultima: minAtras(3), linhas: locais.filter(l => l.tipo === "uh").length, status: "ok" },
      { nome: "vw_csc_bloqueios", conteudo: "Bloqueios de UH por manutenção", frequencia: "A cada 5 min", ultima: minAtras(4), linhas: 37, status: "ok" },
      { nome: "vw_csc_proprietarios", conteudo: "Proprietário por UH (condo-hotel)", frequencia: "Diária", ultima: minAtras(1480), linhas: localProprietario.length, status: "atraso" }
    ],
    execucoes: []
  };
  for (let i = 0; i < 14; i++) {
    const v = pick(integracao.views);
    integracao.execucoes.push({ t: minAtras(i * 17 + int(1, 9)), view: v.nome, linhas: int(0, 60), duracao_s: int(2, 38), resultado: i === 5 ? "Falha: tempo de conexão esgotado (nova tentativa em 5 min)" : "Sucesso" });
  }
  // status de UH (vindo do PMS), para exibir no detalhe
  const statusUH = {};
  locais.filter(l => l.tipo === "uh").forEach(l => { statusUH[l.id] = weighted([["Ocupada", 68], ["Vaga limpa", 18], ["Vaga suja", 9], ["Bloqueada", 5]]); });
  chamados.filter(c => c.status !== "Encerrado" && c.status !== "Cancelado" && c.local_id.includes("-u") && (c.prioridade === "Alta" || c.prioridade === "Crítica")).forEach(c => { if (rnd() < 0.6) statusUH[c.local_id] = "Bloqueada"; });


  // ---------- Fornecedores (cadastro mínimo) ----------
  const cnpj = () => { const d = Array.from({ length: 12 }, () => int2(0, 9)).join(""); return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/0001-${String(int2(10, 99))}`; };
  const fornecedores = [
    ["f1", "Elevar Elevadores Ltda.", ["c1"], "(41) 3333-1200", "plantao@elevar.demo"],
    ["f2", "FrioSul Refrigeração", ["c2", "c8", "c11"], "(41) 3022-4410", "chamados@friosul.demo"],
    ["f3", "Hidrotec Serviços Hidráulicos", ["c13", "c5"], "(11) 4004-2210", "os@hidrotec.demo"],
    ["f4", "Voltare Engenharia Elétrica", ["c6", "c3", "c14"], "(11) 3555-9081", "atendimento@voltare.demo"],
    ["f5", "Clima Certo Climatização", ["c7"], "(48) 3211-7788", "suporte@climacerto.demo"],
    ["f6", "AquaPura Piscinas", ["c9"], "(47) 3366-0900", "contato@aquapura.demo"],
    ["f7", "Acesso Total Automação", ["c10", "c15"], "(51) 3088-1515", "servicos@acessototal.demo"],
    ["f8", "Pinta Bem Acabamentos", ["c16"], "(41) 99812-4400", "orcamento@pintabem.demo"]
  ].map(([id, nome, categorias, telefone, email]) => ({ id, nome, cnpj: cnpj(), categorias, telefone, email, ativo: true }));
  const fornDe = cat => fornecedores.find(f => f.categorias.includes(cat));

  // ---------- Códigos de manutenção (falha, causa, solução) por categoria ----------
  const codigos = {
    c1: { falha: ["Parado entre andares", "Porta não fecha", "Nivelamento irregular", "Ruído anormal"], causa: ["Desgaste de componente", "Falha elétrica", "Sujeira no trilho da porta", "Uso indevido"], solucao: ["Ajuste e regulagem", "Troca de componente", "Limpeza", "Reinício do quadro de comando"] },
    c2: { falha: ["Alarme de alta pressão", "Baixa capacidade", "Vazamento de fluido"], causa: ["Condensador sujo", "Falha de sensor", "Desgaste do compressor"], solucao: ["Limpeza do condensador", "Troca de sensor", "Recarga de fluido", "Troca de compressor"] },
    c5: { falha: ["Desarme", "Ruído", "Vazamento no selo"], causa: ["Sobrecorrente", "Rolamento gasto", "Selo mecânico gasto"], solucao: ["Troca de rolamento", "Troca do selo", "Ajuste do relé térmico"] },
    c7: { falha: ["Não gela", "Pingando", "Ruído"], causa: ["Filtro sujo", "Placa eletrônica", "Dreno obstruído", "Falta de gás"], solucao: ["Limpeza", "Troca de placa", "Desobstrução do dreno", "Recarga de gás"] },
    c8: { falha: ["Temperatura acima da faixa", "Porta sem vedação"], causa: ["Degelo travado", "Borracha danificada", "Condensador sujo"], solucao: ["Ajuste do degelo", "Troca da borracha", "Limpeza"] },
    c10: { falha: ["Não reconhece o cartão", "Sem bateria"], causa: ["Bateria fraca", "Falha do leitor"], solucao: ["Troca de bateria", "Troca do leitor", "Reprogramação"] },
    c13: { falha: ["Vazamento", "Entupimento", "Sem água quente"], causa: ["Vedação gasta", "Obstrução", "Falha no misturador"], solucao: ["Troca de vedação", "Desentupimento", "Troca do misturador"] },
    _: { falha: ["Não funciona", "Funcionamento irregular"], causa: ["Desgaste", "Falha elétrica", "Uso indevido"], solucao: ["Ajuste", "Troca de componente", "Limpeza"] }
  };
  const codDe = cat => codigos[cat] || codigos._;

  // ---------- Arrendado: matriz de responsabilidade por hotel e categoria ----------
  const LOCADOR_CATS = { h7: ["c1", "c2", "c3", "c5", "c6"], h8: ["c1", "c3", "c5", "c6"] };
  const responsabilidade = [];
  Object.entries(LOCADOR_CATS).forEach(([hid, cats]) => categorias.forEach(c => responsabilidade.push({ hotel_id: hid, categoria_id: c.id, responsavel: cats.includes(c.id) ? "Locador" : "Arrendatária" })));
  const respDe = (hid, cat) => { const r = responsabilidade.find(x => x.hotel_id === hid && x.categoria_id === cat); return r ? r.responsavel : null; };

  // ---------- Histórico anterior (90 a 180 dias), base da Intelligence ----------
  const antigos = [];
  for (let i = 0; i < 560; i++) {
    const hid = weightedR2(pesos), h = hoteis.find(x => x.id === hid);
    const m = weightedR2(modelos.map(m => [m, m[3]])), [cat, titulo, lugar] = m;
    const local = lugar === "uh" ? pick2(uhsDo(hid)) : areaDo(hid, lugar);
    const ativo = lugar === "uh" ? (cat === "c7" ? ativos.find(a => a.local_id === local.id && a.categoria_id === "c7") : null) : (rnd2() < 0.7 ? pick2(ativos.filter(a => a.hotel_id === hid && a.categoria_id === cat)) : null);
    antigos.push({ hid, cat, titulo, local, ativo: ativo || null, prio: prioPorCatR2(cat), age: 91 + rnd2() * 89 });
  }
  function weightedR2(pairs) { const tot = pairs.reduce((x, p) => x + p[1], 0); let r = rnd2() * tot; for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; } return pairs[0][0]; }
  function prioPorCatR2(cat) { return ["c1", "c2", "c5", "c8"].includes(cat) ? (rnd2() < 0.6 ? "Crítica" : "Alta") : ["c4", "c6", "c3"].includes(cat) ? "Alta" : rnd2() < 0.5 ? "Média" : "Baixa"; }

  // Cenários plantados para os insights (reincidência, efetividade antes e depois, padrão sistêmico)
  const atv = (hid, nome) => ativos.find(a => a.hotel_id === hid && a.nome === nome);
  const bombaSP = atv("h3", "Bomba de recalque 1"), chillerFln = atv("h5", "Chiller principal"), camaraRio = atv("h10", "Câmara fria de carnes");
  [84, 67, 49, 33, 18].forEach((d, i) => antigos.push({ hid: "h3", cat: "c5", titulo: i % 2 ? "Ruído na bomba de recalque" : "Bomba de recalque desarmando", local: IDXloc(bombaSP.local_id), ativo: bombaSP, prio: "Alta", age: d, parada: 6 + i * 2 }));
  [172, 158, 141, 126, 110].forEach(d => antigos.push({ hid: "h5", cat: "c2", titulo: "Chiller em alarme de alta pressão", local: IDXloc(chillerFln.local_id), ativo: chillerFln, prio: "Crítica", age: d, parada: 5 }));
  antigos.push({ hid: "h5", cat: "c2", titulo: "Troca do pressostato e limpeza do condensador", local: IDXloc(chillerFln.local_id), ativo: chillerFln, prio: "Alta", age: 98, intervencao: true, forn: "f2", custo: 18400, parada: 9 });
  antigos.push({ hid: "h5", cat: "c2", titulo: "Chiller com baixa capacidade", local: IDXloc(chillerFln.local_id), ativo: chillerFln, prio: "Média", age: 31 });
  [168, 139, 117].forEach(d => antigos.push({ hid: "h10", cat: "c8", titulo: "Câmara fria acima de 5 °C", local: IDXloc(camaraRio.local_id), ativo: camaraRio, prio: "Crítica", age: d, parada: 4 }));
  antigos.push({ hid: "h10", cat: "c8", titulo: "Troca do motor do evaporador", local: IDXloc(camaraRio.local_id), ativo: camaraRio, prio: "Alta", age: 95, intervencao: true, forn: "f2", custo: 6900, parada: 7 });
  [78, 55, 37, 12].forEach(d => antigos.push({ hid: "h10", cat: "c8", titulo: "Câmara fria acima de 5 °C", local: IDXloc(camaraRio.local_id), ativo: camaraRio, prio: "Crítica", age: d, parada: 5 }));
  // Mesmo modelo de split falhando em vários hotéis da Linha Business
  const splitsMidea = [];
  ["h1", "h3", "h5", "h10", "h14"].forEach(hid => ativos.filter(a => a.hotel_id === hid && a.categoria_id === "c7" && a.local_id.includes("-u")).slice(0, 3).forEach(a => { a.fabricante = "Midea"; a.modelo = "Split Inverter 12.000 BTU"; splitsMidea.push(a); }));
  splitsMidea.forEach((a, i) => [int2(5, 40), int2(45, 85)].slice(0, i % 3 === 2 ? 1 : 2).forEach(d => antigos.push({ hid: a.hotel_id, cat: "c7", titulo: "Ar-condicionado não gela", local: IDXloc(a.local_id), ativo: a, prio: "Média", age: d, codigo: ["Não gela", "Placa eletrônica", "Troca de placa"] })));
  function IDXloc(id) { return locais.find(l => l.id === id); }
  // Elevador social 2 do São Paulo Paulista voltou a falhar várias vezes (caso de demonstração do Intelligence)
  { const es2 = atv("h3", "Elevador social 2"); [71, 54, 38, 22, 9].forEach(d => antigos.push({ hid: "h3", cat: "c1", titulo: "Porta do elevador não fecha", local: IDXloc(es2.local_id), ativo: es2, prio: "Alta", age: d, parada: 7, codigo: ["Porta não fecha", "Desgaste de componente", "Troca da sapata da porta"] })); }

  antigos.sort((a, b) => b.age - a.age);
  let chOld = 4800 - antigos.length, osOld = 9000;
  antigos.forEach(x => {
    const aberto = now.getTime() - x.age * D - int2(0, 10) * H, slaH = slaEfetivo(x.hid, x.prio);
    const reparoH = Math.max(0.5, slaH * (0.3 + rnd2() * 0.9)), enc = aberto + reparoH * H;
    const tec = pick2(tecsDo(x.hid)), sol = pick2(solicitantes);
    const c = { id: "CH-" + (++chOld), hotel_id: x.hid, local_id: x.local.id, ativo_id: x.ativo ? x.ativo.id : null, categoria_id: x.cat, titulo: x.titulo, descricao: x.titulo + ".", prioridade: x.prio, status: "Encerrado",
      aberto_em: iso(aberto), prazo_sla: iso(prazoSla(x.cat, aberto, slaH)), sla_h: slaH, atendido_em: iso(aberto + 0.4 * H), encerrado_em: iso(enc), tecnico_id: tec.id, solicitante: sol, fotos: int2(0, 2),
      eventos: [{ t: iso(aberto), tipo: "abertura", txt: "Chamado aberto por " + sol }, { t: iso(aberto + 0.1 * H), tipo: "sistema", txt: `Prazo de SLA definido: ${slaH} h (prioridade ${x.prio})` }, { t: iso(aberto + 0.4 * H), tipo: "atribuicao", txt: "Atribuído a " + tec.nome }, { t: iso(enc), tipo: "status", txt: "Encerrado com aceite do solicitante" }] };
    if (x.intervencao) c.intervencao = true;
    if (x.forn) c._forn = x.forn;
    if (x.custo) c._custo = x.custo;
    if (x.codigo) c._codigo = x.codigo;
    if (x.parada && c.ativo_id) ativo_parada.push({ id: "PA-" + (ativo_parada.length + 1), ativo_id: c.ativo_id, chamado_id: c.id, inicio: c.aberto_em, fim: iso(aberto + x.parada * H), motivo: c.titulo });
    chamados.push(c);
    os.push({ id: "OS-" + (++osOld), origem: "corretiva", chamado_id: c.id, plano_id: null, hotel_id: c.hotel_id, local_id: c.local_id, ativo_id: c.ativo_id, titulo: c.titulo, responsavel_id: tec.id, status: "Concluída", programada_para: c.atendido_em, inicio: c.atendido_em, fim: c.encerrado_em, horas: Math.round((enc - aberto - 0.4 * H) / H * 10) / 10, checklist: [], materiais: "" });
  });
  // A bomba do São Paulo Paulista voltou a falhar e está em atendimento agora
  (() => { const aberto = now.getTime() - 20 * H, slaH = slaEfetivo("h3", "Alta"), tec = tecsDo("h3")[0];
    const c = { id: "CH-" + (++chn), hotel_id: "h3", local_id: bombaSP.local_id, ativo_id: bombaSP.id, categoria_id: "c5", titulo: "Bomba de recalque desarmando de novo", descricao: "Desarmou três vezes desde ontem.", prioridade: "Alta", status: "Em atendimento", aberto_em: iso(aberto), prazo_sla: iso(aberto + slaH * H), sla_h: slaH, atendido_em: iso(aberto + 0.5 * H), encerrado_em: null, tecnico_id: tec.id, solicitante: "Manutenção", fotos: 1,
      eventos: [{ t: iso(aberto), tipo: "abertura", txt: "Chamado aberto por Manutenção" }, { t: iso(aberto + 0.1 * H), tipo: "sistema", txt: `Prazo de SLA definido: ${slaH} h (prioridade Alta)` }, { t: iso(aberto + 0.5 * H), tipo: "atribuicao", txt: "Atribuído a " + tec.nome }, { t: iso(aberto + 0.6 * H), tipo: "status", txt: "Em atendimento" }] };
    chamados.unshift(c); ativo_parada.push({ id: "PA-" + (ativo_parada.length + 1), ativo_id: bombaSP.id, chamado_id: c.id, inicio: iso(aberto), fim: null, motivo: c.titulo }); bombaSP.status = "Parado";
    osn++; os.push({ id: "OS-" + osn, origem: "corretiva", chamado_id: c.id, plano_id: null, hotel_id: "h3", local_id: c.local_id, ativo_id: bombaSP.id, titulo: c.titulo, responsavel_id: tec.id, status: "Em execução", programada_para: c.atendido_em, inicio: c.atendido_em, fim: null, horas: null, checklist: [], materiais: "" });
  })();
  // Medição fora da faixa recente na bomba
  (() => { const o = os.filter(x => x.ativo_id === bombaSP.id && x.origem === "preventiva" && x.status === "Concluída").sort((a, b) => b.fim.localeCompare(a.fim))[0]; if (o) o.checklist.forEach(c => { if (c.tipo === "medicao") { c.valor = 13.6; c.fora = true; } }); })();
  chamados.sort((a, b) => b.aberto_em.localeCompare(a.aberto_em));

  // ---------- Instrumentação dos chamados (1b): origem, impacto no hóspede, UH indisponível, quem executou, custo, códigos, aceite ----------
  const origemDe = sol => ({ "Recepção": "Recepção", "Governança": "Governança", "Hóspede (via recepção)": "Hóspede, pela recepção", "Técnico (app)": "App do técnico (QR)", "Manutenção": "Equipe de manutenção" })[sol] || "Área operacional";
  chamados.forEach(c => {
    const loc = locais.find(l => l.id === c.local_id), ehUH = loc.tipo === "uh";
    c.origem = origemDe(c.solicitante);
    c.impacto_hospede = c.solicitante === "Hóspede (via recepção)" || (ehUH && rnd2() < 0.55) || (["c1", "c4"].includes(c.categoria_id) && rnd2() < 0.7);
    const aberto = +new Date(c.aberto_em);
    if (ehUH && c.status !== "Cancelado" && (["Crítica", "Alta"].includes(c.prioridade) ? rnd2() < 0.75 : rnd2() < 0.12)) {
      const fim = c.encerrado_em ? +new Date(c.encerrado_em) + (0.5 + rnd2() * 3) * H : null;
      c.uh_indisp = { inicio: iso(aberto + 0.25 * H), fim: fim && fim < now.getTime() ? iso(fim) : null };
      if (!c.uh_indisp.fim) statusUH[c.local_id] = "Bloqueada";
    }
    if (c.tecnico_id && c.status !== "Cancelado") {
      const f = c._forn ? fornecedores.find(x => x.id === c._forn) : fornDe(c.categoria_id);
      const usaForn = c._forn || (f && (c.categoria_id === "c1" ? rnd2() < 0.9 : ["c2", "c8", "c3"].includes(c.categoria_id) ? rnd2() < 0.5 : rnd2() < 0.08));
      c.executado_por = usaForn ? { tipo: "fornecedor", fornecedor_id: f.id } : { tipo: "interna" };
    }
    if (c.status === "Encerrado") {
      c.custo = c._custo || (c.executado_por && c.executado_por.tipo === "fornecedor" ? Math.round((600 + rnd2() * 5200) / 10) * 10 : rnd2() < 0.55 ? Math.round(rnd2() * 380 / 10) * 10 : null);
      const cd = codDe(c.categoria_id);
      if (c._codigo) c.codigos = { falha: c._codigo[0], causa: c._codigo[1], solucao: c._codigo[2] };
      else if (rnd2() < 0.62) c.codigos = { falha: pick2(cd.falha), causa: pick2(cd.causa), solucao: pick2(cd.solucao) };
      c.aceite = { t: c.encerrado_em, por: c.solicitante === "Hóspede (via recepção)" ? "Recepção" : c.solicitante, assinatura: rnd2() < 0.8 };
    }
    const r = respDe(c.hotel_id, c.categoria_id);
    if (r) {
      c.responsavel_custo = r;
      if (r === "Locador") { c.eventos.push({ t: iso(aberto + 0.15 * H), tipo: "sistema", txt: "Locador notificado: categoria sob responsabilidade dele no contrato" }); c.eventos.sort((a, b) => a.t.localeCompare(b.t)); c.locador_notificado_em = iso(aberto + 0.15 * H); }
    }
    delete c._forn; delete c._custo; delete c._codigo;
  });
  os.forEach(o => { if (o.chamado_id) { const c = chamados.find(x => x.id === o.chamado_id); if (c) { o.executado_por = c.executado_por || { tipo: "interna" }; if (c.responsavel_custo) o.responsavel_custo = c.responsavel_custo; } } else if (respDe(o.hotel_id, (ativos.find(a => a.id === o.ativo_id) || {}).categoria_id)) o.responsavel_custo = respDe(o.hotel_id, ativos.find(a => a.id === o.ativo_id).categoria_id); });
  // Casos de demonstração do Intelligence (dados fictícios): dois ativos com histórico pesado, para a tela mostrar alta atenção
  [bombaSP, atv("h3", "Elevador social 2")].forEach(a => {
    const cs = chamados.filter(c => c.ativo_id === a.id && c.status !== "Cancelado");
    cs.filter(c => +new Date(c.aberto_em) > now.getTime() - 90 * D).forEach(c => { c.impacto_hospede = true; });
    const enc = cs.filter(c => c.status === "Encerrado").sort((x, y) => y.encerrado_em.localeCompare(x.encerrado_em));
    const soma = enc.reduce((s, c) => s + (c.custo || 0), 0);
    if (enc.length && soma < 9000) enc[0].custo = (enc[0].custo || 0) + 9000 - soma;
    const prev = os.filter(o => o.ativo_id === a.id && o.origem === "preventiva" && o.status === "Concluída").sort((x, y) => y.fim.localeCompare(x.fim))[0];
    if (prev && a !== bombaSP) { prev.status = "Atrasada"; prev.inicio = null; prev.fim = null; prev.horas = null; prev.checklist.forEach(it => { if (it.tipo === "medicao") { it.valor = null; it.fora = false; } else if ("ok" in it) it.ok = false; }); }
  });
  { const es2 = atv("h3", "Elevador social 2"); ativo_parada.push({ id: "PA-" + (ativo_parada.length + 1), ativo_id: es2.id, chamado_id: null, inicio: iso(now.getTime() - 24 * D), fim: iso(now.getTime() - 24 * D + 30 * H), motivo: "Parada para ajuste de portas" }); }

  // ---------- Pacote da bandeira e hotéis em abertura ----------
  const pacotes = [
    { bandeira_id: "b1", versao: "2026.3", modelos: ["MA-01", "MA-03", "MA-04", "MA-05", "MA-06", "MA-07", "MA-08"], planos: ["PL-101", "PL-102", "PL-103", "PL-104", "PL-105", "PL-106", "PL-107", "PL-108", "PL-109"], atualizado_em: iso(now.getTime() - 12 * D) },
    { bandeira_id: "b2", versao: "2026.2", modelos: ["MA-01", "MA-03", "MA-05", "MA-06", "MA-07"], planos: ["PL-101", "PL-103", "PL-104", "PL-105", "PL-106", "PL-107", "PL-108"], atualizado_em: iso(now.getTime() - 34 * D) },
    { bandeira_id: "b3", versao: "2026.3", modelos: ["MA-02", "MA-03", "MA-05", "MA-06", "MA-08"], planos: ["PL-101", "PL-103", "PL-104", "PL-105", "PL-107", "PL-109"], atualizado_em: iso(now.getTime() - 9 * D) }
  ];
  const aberturas = [
    { id: "ab1", nome: "Hotel Palmas", cidade: "Palmas", uf: "TO", bandeira_id: "b2", uhs: 120, modelo: "Próprio", previsao: "Dezembro de 2026",
      passos: { licenca: iso(now.getTime() - 2 * D), pacote: null, locais: null, usuarios: null, ativos: null, etiquetas: null } },
    { id: "ab2", nome: "Hotel Foz do Iguaçu", cidade: "Foz do Iguaçu", uf: "PR", bandeira_id: "b1", uhs: 160, modelo: "Arrendado", previsao: "2027",
      passos: { licenca: null, pacote: null, locais: null, usuarios: null, ativos: null, etiquetas: null } }
  ];

  // ---------- Ficha de conexão por hotel (agente local) ----------
  const fichas = hoteis.map(h => ({ hotel_id: h.id, agente: h.id === "h13" ? "hk-agente 1.3.9" : "hk-agente 1.4.2", ultimo_contato: minAtras(h.id === "h8" ? 47 : int2(1, 4)), limite_min: 5 }));

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
  auditoria.push({ t: minAtras(60 * 30), usuario: "Lúcia Andrade", entidade: "Fornecedor", registro: "f8", hotel_id: null, acao: "Fornecedor cadastrado: Pinta Bem Acabamentos" });
  auditoria.push({ t: minAtras(60 * 74), usuario: "Lúcia Andrade", entidade: "Hotel", registro: "ab1", hotel_id: null, acao: "Hotel Palmas ativado com licença (abertura prevista para dezembro de 2026)" });
  auditoria.push({ t: minAtras(60 * 98), usuario: "Marina Costa", entidade: "Política", registro: "po1", hotel_id: null, acao: "Calendário de SLA: pintura e piscina passam a contar em horário comercial" });
  auditoria.sort((a, b) => b.t.localeCompare(a.t));

  // ---------- Caso de demonstração do Intelligence no Hotel Curitiba Batel (dados fictícios) ----------
  // Fica no fim e sem sorteio, para não mudar o resto do seed. O Elevador social 2 (o do chamado crítico de hoje) parou
  // várias vezes com hóspedes: a atenção passa do limite há cerca de 30 dias, a gerente decide, e a troca do operador de
  // porta entra como intervenção depois da decisão. A página do insight mostra a efetividade dela.
  {
    const es2 = atv("h1", "Elevador social 2"), forn = fornDe("c1"), tec = tecsDo("h1")[0], slaH = slaEfetivo("h1", "Crítica");
    let livre = Math.min(...chamados.map(c => +c.id.split("-")[1])), osLivre = Math.max(...os.map(o => +o.id.split("-")[1]));
    chamados.filter(c => c.ativo_id === es2.id && c.status !== "Cancelado").forEach(c => { c.impacto_hospede = true; });
    [[82, false, 1900, 5], [57, false, 2100, 6], [31, false, 2400, 6], [13, true, 9600, 8]].forEach(([age, intv, custo, parada]) => {
      const aberto = now.getTime() - age * D - 2 * H, enc = aberto + 4 * H, sol = intv ? "Gerência" : "Recepção";
      const titulo = intv ? "Troca do operador de porta" : "Elevador parado entre andares";
      const c = { id: "CH-" + (--livre), hotel_id: "h1", local_id: es2.local_id, ativo_id: es2.id, categoria_id: "c1", titulo,
        descricao: intv ? "Troca do operador de porta pelo fornecedor, depois das paradas repetidas." : "Elevador parou entre andares com hóspedes.", prioridade: "Crítica", status: "Encerrado",
        aberto_em: iso(aberto), prazo_sla: iso(prazoSla("c1", aberto, slaH)), sla_h: slaH, atendido_em: iso(aberto + 0.4 * H), encerrado_em: iso(enc), tecnico_id: tec.id, solicitante: sol, fotos: 1,
        eventos: [{ t: iso(aberto), tipo: "abertura", txt: "Chamado aberto por " + sol }, { t: iso(aberto + 0.1 * H), tipo: "sistema", txt: `Prazo de SLA definido: ${slaH} h (prioridade Crítica)` }, { t: iso(aberto + 0.4 * H), tipo: "atribuicao", txt: "Atribuído a " + tec.nome }, { t: iso(enc), tipo: "status", txt: "Encerrado com aceite do solicitante" }],
        origem: origemDe(sol), impacto_hospede: !intv, executado_por: { tipo: "fornecedor", fornecedor_id: forn.id }, custo,
        codigos: { falha: "Parada entre andares", causa: "Desgaste de componente", solucao: intv ? "Troca do operador de porta" : "Ajuste do operador de porta" }, aceite: { t: iso(enc), por: sol, assinatura: true } };
      if (intv) c.intervencao = true;
      chamados.push(c);
      ativo_parada.push({ id: "PA-" + (ativo_parada.length + 1), ativo_id: es2.id, chamado_id: c.id, inicio: c.aberto_em, fim: iso(aberto + parada * H), motivo: titulo });
      os.push({ id: "OS-" + (++osLivre), origem: "corretiva", chamado_id: c.id, plano_id: null, hotel_id: "h1", local_id: c.local_id, ativo_id: es2.id, titulo, responsavel_id: tec.id, status: "Concluída", programada_para: c.atendido_em, inicio: c.atendido_em, fim: c.encerrado_em, horas: 3.6, checklist: [], materiais: "", executado_por: c.executado_por });
    });
    chamados.sort((a, b) => b.aberto_em.localeCompare(a.aberto_em));
  }

  integracao.fichas = fichas;
  return { versao: 11, gerado_em: iso(now), tenant, bandeiras, hoteis, locais, proprietarios, localProprietario, categorias, ativos, ativo_parada, modelos_ativo, implantacao, capturas_celular, usuarios, tecnicos, politicas, chamados, os, planos, integracao, statusUH, auditoria,
    fornecedores, codigos, responsabilidade, pacotes, aberturas };
}

/* ---------- HubKeep Intelligence: o que o job diário gravou (dados fictícios) ----------
   Aprovado por Kaio em 10/10/2026: as telas leem os insights e os resultados diários gravados, no lugar do cálculo na
   hora. Roda depois do buildSeed (pelo reindex do app.js), com as fórmulas do Intelligence do app.js:
   - resultado diário: a atenção de cada ativo às 03:00 de cada um dos últimos 90 dias, com a versão da fórmula e a da
     política. O dia de hoje guarda também a composição; os outros dias, só o valor;
   - insights: o job aplica, dia a dia, a regra de detecção do motor (decidirDeteccao, em packages/inteligencia). O mesmo
     conjunto de hotéis atualiza; o conjunto contido num aberto não faz nada; hotel a mais abre um insight novo, ligado ao
     aberto mais recente; sem aberto, abre ligado ao último encerrado, salvo o descarte "não relevante" de menos de 30
     dias sem subida de faixa. O job nunca muda o estado;
   - as decisões das pessoas são o roteiro da demonstração (roteiroDoInsight), aplicadas na data de cada uma. */
function seedInteligencia() {
  const pol = polGrupo().inteligencia, ix = iaIndice(), iso = x => new Date(x).toISOString();
  const hoje = new Date(); hoje.setHours(3, 0, 0, 0);
  const base = hoje.getTime(), DIAS = 90, ordem = f => IA_FAIXAS.findIndex(x => x[1] === f);
  const serie = {}, composicao = {}, insights = [], pendentes = [];
  let seq = 100;
  DB.ativos.forEach(a => { serie[a.id] = []; });
  const mesmo = (x, y) => x.length === y.length && x.every(h => y.includes(h));
  const alcanceDe = hs => {
    if (hs.length === 1) return { tipo: "hotel", hotel_id: hs[0], bandeira_id: IDX.hotel[hs[0]].bandeira_id };
    const bs = [...new Set(hs.map(h => IDX.hotel[h].bandeira_id))];
    return { tipo: "rede", bandeira_id: bs.length === 1 ? bs[0] : null };
  };
  const planejar = (ins, em, acao, usuario_id, extra = {}) => pendentes.push({ ins, em, acao, usuario_id, ...extra });
  const detectar = (d, now) => {
    const daFamilia = insights.filter(i => i.familia === d.familia);
    const abertos = daFamilia.filter(iaAberto).sort((x, y) => t(y.aberto_em) - t(x.aberto_em));
    const igual = abertos.find(i => mesmo(i.hotel_ids, d.hotel_ids));
    if (igual) {
      if (ordem(d.faixa) > ordem(igual.faixa)) igual.historico.push({ t: iso(now), tipo: "job", txt: `Faixa subiu para ${d.faixa}` });
      Object.assign(igual, { ultima_deteccao_em: iso(now), faixa: d.faixa, valor: d.valor, evidencia: d.evidencia });
      return;
    }
    if (abertos.some(i => d.hotel_ids.every(h => i.hotel_ids.includes(h)))) return;
    let anterior = abertos[0] || null;
    if (!anterior) {
      const enc = daFamilia.filter(i => i.encerrado_em).sort((x, y) => t(y.encerrado_em) - t(x.encerrado_em))[0];
      if (enc && enc.estado === "descartado" && enc.motivo_descarte === "nao_relevante" && now - t(enc.encerrado_em) < 30 * D && ordem(d.faixa) <= ordem(enc.faixa)) return;
      anterior = enc || null;
    }
    const ins = { id: "INS-" + String(++seq).padStart(4, "0"), ...d, aberto_em: iso(now), ultima_deteccao_em: iso(now), encerrado_em: null, estado: "novo", responsavel_id: null,
      anterior_id: anterior ? anterior.id : null, motivo_descarte: null,
      historico: [{ t: iso(now), tipo: "job", txt: anterior && iaAberto(anterior) ? `Aberto pelo job diário, com hotel a mais que o ${anterior.id}` : anterior ? `Aberto pelo job diário; o ${anterior.id} já estava encerrado` : "Aberto pelo job diário" }] };
    insights.push(ins);
    roteiroDoInsight(ins, anterior, now, base, planejar);
  };
  const aplicarAte = now => {
    pendentes.sort((x, y) => x.em - y.em);
    while (pendentes.length && pendentes[0].em <= now) {
      const p = pendentes.shift();
      if (IA_ACOES[p.acao].de.includes(p.ins.estado)) iaAplicar(p.ins, p.acao, p.usuario_id, iso(p.em), p);
    }
  };
  for (let k = DIAS - 1; k >= 0; k--) {
    const now = base - k * D;
    aplicarAte(now);
    DB.ativos.forEach(a => {
      const r = intelAtivo(a, now, ix);
      serie[a.id].push(r.score);
      // Compacto, para caber no armazenamento do navegador: [atenção, composição, horas paradas, impacto em hóspedes (%)],
      // e cada componente como [componente, peso, valor, peso usado, pontos, medido].
      if (k === 0) composicao[a.id] = [r.score, r.comp.map(c => [c.k, c.peso, c.valor === null ? null : Math.round(c.valor * 1000) / 1000, Math.round(c.pesoEf * 10000) / 10000, Math.round(c.pontos * 100) / 100, c.medido]), r.horas, r.imp];
      if (r.score === null || r.score < pol.limite_atencao) return;
      const top = r.comp.filter(c => c.valor !== null && c.pontos > 0).sort((x, y) => y.pontos - x.pontos).slice(0, 3).map(c => [c.nome, c.medido]);
      detectar({ tipo: "atencao_ativo", familia: `atencao_ativo|ativo=${a.id}|hotel=${a.hotel_id}`, escopo: { ativo_id: a.id, hotel_id: a.hotel_id }, alcance: alcanceDe([a.hotel_id]), hotel_ids: [a.hotel_id],
        faixa: r.faixa, valor: r.score, versao: 2, evidencia: { valor: r.score, faixa: r.faixa, top, limite: pol.limite_atencao } }, now);
    });
    padraoSistemico(DB.ativos, DB.chamados, now).filter(s => s.k).forEach(s => {
      const hs = [...new Set(s.hoteis)].sort();
      detectar({ tipo: "sistemico", familia: `sistemico|${s.k}|${s.chave}`, escopo: { regra: s.k, chave: s.chave, categoria_id: s.categoria_id }, alcance: alcanceDe(hs), hotel_ids: hs, faixa: "Atenção", valor: null, versao: 2,
        evidencia: { regra: s.regra, titulo: s.titulo, quem: s.quem, evid: s.evid, n: s.n, ativos: s.ativos, hoteis: hs.length, taxa: s.taxa, base: s.base, janela: s.janela, chamado_ids: s.chamados } }, now);
    });
  }
  aplicarAte(Date.now());
  DB.ia = { calculado_em: iso(base), versao_formula: 2, versao_politica: pol.versao, inicio: iso(base - (DIAS - 1) * D), dias: DIAS, serie, hoje: composicao };
  DB.insights = insights;
}
/* O roteiro das pessoas na demonstração: quem decide cada insight, quando e com que nota. Só vale para os casos
   plantados; o resto fica como o job deixou. Insight aberto há 20 dias ou menos continua "novo". */
function roteiroDoInsight(ins, anterior, now, base, planejar) {
  const at = ins.escopo.ativo_id ? IDX.ativo[ins.escopo.ativo_id] : null, recente = base - now <= 20 * D, h = x => now + x * D + 7 * H;
  const decisor = ins.alcance.tipo === "rede" && ins.alcance.bandeira_id === "b1" ? "u2" : "u1";
  if (at && at.hotel_id === "h3" && at.nome === "Elevador social 2") {
    planejar(ins, h(1), "revisar", "u2"); planejar(ins, h(2), "aceitar", "u2");
    planejar(ins, h(9), "agir", "u2", { nota: "OS corretiva para o ajuste das portas, com parada programada com o fabricante." });
  } else if (at && at.hotel_id === "h1" && at.nome === "Elevador social 2") {
    planejar(ins, h(1), "revisar", "u3"); planejar(ins, h(2), "aceitar", "u3");
    const iv = DB.chamados.find(c => c.ativo_id === at.id && c.intervencao && t(c.aberto_em) > now);
    if (iv) { planejar(ins, t(iv.aberto_em), "agir", "u3", { nota: `Chamado ${iv.id}: troca do operador de porta pelo fornecedor.` }); planejar(ins, t(iv.encerrado_em) + 2 * H, "monitorar", "u3"); }
  } else if (ins.tipo === "sistemico" && /midea/i.test(ins.evidencia.titulo)) {
    if (!recente) planejar(ins, h(3), "revisar", decisor);
    if (anterior && iaAberto(anterior) && !recente) planejar(anterior, now + 1 * D + 9 * H, "descartar", anterior.alcance.tipo === "rede" && anterior.alcance.bandeira_id === "b1" ? "u2" : "u1", { motivo: "substituido", nota: `Substituído pelo ${ins.id}, que inclui mais hotéis.` });
  } else if (ins.tipo === "sistemico" && !recente) {
    planejar(ins, h(2), "revisar", "u1");
    planejar(ins, h(4), "descartar", "u1", { motivo: "nao_relevante", nota: "Os chamados têm causas diferentes em cada hotel; não há padrão do modelo." });
  }
}
