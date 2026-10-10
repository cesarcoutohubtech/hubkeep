/* HubKeep (EasyGov) — mock navegável para apresentação. "CSC" é a equipe central de manutenção do cliente.
   Sem backend: os dados vêm de seed.js e as alterações ficam no navegador (localStorage).
   O isolamento por escopo é simulado em uma única função (scope), como faria a RLS no banco. */

const H = 3600e3, D = 24 * H;
const STORE_KEY = "csc-demo-v6";
const THEME_KEY = "csc-demo-theme";
const PERSONA_KEY = "csc-demo-persona";
const PRIOS = ["Crítica", "Alta", "Média", "Baixa"];
const OPEN = ["Aberto", "Em atendimento", "Aguardando peça", "Aguardando aceite"];

let DB, IDX;
const UI = {
  persona: "u1",
  f: { ch: { q: "", hotel: "", status: "abertos", prio: "", cat: "", page: 0 }, os: { origem: "", status: "", hotel: "", page: 0 }, at: { q: "", hotel: "", cat: "", crit: "", page: 0 }, au: { q: "", ent: "", hotel: "", page: 0 }, ind: { band: "" }, intel: { estado: "abertos", tipo: "", escopo: "", faixa: "" } },
  cal: null, calHotel: null, theme: "dark", ncFotos: 0, imp: null,
  phone: { tab: "hoje", view: null, offline: false, pend: 0, scan: null }
};

/* ---------- Persistência ---------- */
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const d = JSON.parse(raw); if (d && d.versao === 10) { DB = d; } }
    const p = localStorage.getItem(PERSONA_KEY); if (p) UI.persona = p;
    const th = localStorage.getItem(THEME_KEY); if (th) UI.theme = th;
  } catch (e) { /* armazenamento indisponível: segue com seed em memória */ }
  const qt = new URLSearchParams(location.search).get("tema"); if (qt) UI.theme = qt === "claro" ? "light" : "dark";
  applyTheme();
  if (!DB) DB = buildSeed();
  reindex();
}
function applyTheme() { document.documentElement.dataset.theme = UI.theme; const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = UI.theme === "light" ? "#F2F5F5" : "#081A20"; }
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); localStorage.setItem(PERSONA_KEY, UI.persona); } catch (e) { } }
function resetDemo() {
  try { localStorage.removeItem(STORE_KEY); } catch (e) { }
  DB = buildSeed(); reindex(); save(); toast("Demonstração restaurada com os dados iniciais"); render();
}
function reindex() {
  const m = a => Object.fromEntries(a.map(x => [x.id, x]));
  IDX = { hotel: m(DB.hoteis), band: m(DB.bandeiras), local: m(DB.locais), ativo: m(DB.ativos), user: m(DB.usuarios), cat: m(DB.categorias), plano: m(DB.planos), ch: m(DB.chamados), os: m(DB.os), prop: m(DB.proprietarios) };
  IDX.donoDe = {}; DB.localProprietario.forEach(x => IDX.donoDe[x.local_id] = x.proprietario_id);
  IDX.modelo = m(DB.modelos_ativo);
  IDX.forn = m(DB.fornecedores);
  if (!DB.ia) seedInteligencia(); // o que o job diário do Intelligence gravou (seed.js)
  IDX.ins = m(DB.insights);
}

/* ---------- Utilidades ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/* Datas em milissegundos, com cache: o job simulado do Intelligence lê as mesmas datas milhares de vezes. */
const T_CACHE = new Map();
const t = s => { let v = T_CACHE.get(s); if (v === undefined) { v = +new Date(s); if (typeof s === "string") T_CACHE.set(s, v); } return v; };
const pad = n => String(n).padStart(2, "0");
function fmtDT(s) { if (!s) return "—"; const d = new Date(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtD(s) { if (!s) return "—"; const d = new Date(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; }
function dur(h) {
  h = Math.abs(h);
  if (h < 1) return Math.max(1, Math.round(h * 60)) + " min";
  if (h < 24) { const tot = Math.round(h * 60), hh = Math.floor(tot / 60), mm = tot % 60; return hh + " h" + (mm ? " " + mm + " min" : ""); }
  const tot = Math.round(h), d = Math.floor(tot / 24), hh = tot % 24; return d + " d" + (hh ? " " + hh + " h" : "");
}
/* Formatadores criados uma vez: toLocaleString com opções cria um formatador a cada chamada. */
const NF_NUM1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }), NF_BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }), NF_FMT1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num1 = v => v == null ? "—" : NF_NUM1.format(v);
function rel(s) { const diff = (Date.now() - t(s)) / H; return diff >= 0 ? "há " + dur(diff) : "em " + dur(-diff); }
const nomeUser = id => (IDX.user[id] || {}).nome || "—";
const initials = n => n.split(" ").filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase();
function toast(msg) {
  const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.textContent = msg;
  document.body.appendChild(el); setTimeout(() => el.remove(), 3200);
}
function nextId(prefix, arr) { const max = Math.max(...arr.map(x => +x.id.split("-")[1])); return prefix + "-" + (max + 1); }

/* ---------- Escopo (simula a RLS) ---------- */
function persona() { return IDX.user[UI.persona] || IDX.user.u1; }
function scope() {
  const p = persona(), e = p.escopo;
  if (e.tipo === "grupo") return { hoteis: DB.hoteis.map(h => h.id), locais: null, label: `grupo inteiro (${DB.hoteis.length} hotéis)` };
  if (e.tipo === "bandeira") { const hs = DB.hoteis.filter(h => h.bandeira_id === e.id).map(h => h.id); return { hoteis: hs, locais: null, label: `${IDX.band[e.id].nome} (${hs.length} hotéis)` }; }
  if (e.tipo === "hotel") return { hoteis: [e.id], locais: null, label: IDX.hotel[e.id].nome };
  if (e.tipo === "locador") {
    const cats = DB.responsabilidade.filter(r => r.hotel_id === e.id && r.responsavel === "Locador").map(r => r.categoria_id);
    return { hoteis: [e.id], locais: null, cats, label: `${IDX.hotel[e.id].nome}, só as categorias que o contrato põe sob o locador (${cats.length})` };
  }
  if (e.tipo === "proprietario") {
    const ls = DB.localProprietario.filter(x => x.proprietario_id === e.id).map(x => x.local_id);
    const hs = [...new Set(ls.map(l => IDX.local[l].hotel_id))];
    return { hoteis: hs, locais: ls, label: `${ls.length} UHs próprias em ${hs.map(h => IDX.hotel[h].nome).join(", ")}` };
  }
}
const catOf = x => x.categoria_id !== undefined ? x.categoria_id : (x.ativo_id && IDX.ativo[x.ativo_id] ? IDX.ativo[x.ativo_id].categoria_id : null);
function scoped(list, localKey = "local_id") {
  const s = scope();
  return list.filter(x => s.hoteis.includes(x.hotel_id) && (!s.locais || s.locais.includes(x[localKey])) && (!s.cats || s.cats.includes(catOf(x))));
}
const role = () => {
  const p = persona().papel;
  if (p === "Gestora do CSC") return "csc";
  if (p.includes("bandeira")) return "band";
  if (p === "Gerente de hotel") return "hotel";
  if (p === "Técnico") return "tec";
  if (p === "Locador") return "loc";
  return "prop";
};
const isOwner = () => ["prop", "loc"].includes(role());
const canEdit = () => ["csc", "band", "hotel"].includes(role());
const catNome = id => id ? IDX.cat[id].nome : "Aguardando triagem";
const polGrupo = () => DB.politicas.find(p => p.escopo_tipo === "grupo");
const critNome = n => (polGrupo().criticidade_nomes || {})[n] || String(n);
const critBadge = n => `<span class="badge ${n >= 5 ? "b-red" : n >= 4 ? "b-amber" : n >= 3 ? "b-blue" : "b-grey"}" title="Criticidade ${n} de 5">${n} · ${esc(critNome(n))}</span>`;
const calComercial = cat => (polGrupo().calendario_comercial || []).includes(cat);
const prazoDe = (cat, inicioMs, h) => calComercial(cat) ? somarHorasUteis(inicioMs, h) : inicioMs + h * H;
const brl = v => v == null ? "—" : NF_BRL.format(v);
const nomeExec = e => !e ? "—" : e.tipo === "fornecedor" ? (IDX.forn[e.fornecedor_id] || {}).nome || "Fornecedor" : "Equipe interna";
function downloadCSV(nome, cab, linhas) {
  const q = v => { const x = v == null ? "" : String(v); return /[";\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
  const txt = "\ufeff" + [cab, ...linhas].map(l => l.map(q).join(";")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" })); a.download = nome; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  toast(`${linhas.length} linhas exportadas em ${nome}, só com o que o seu perfil enxerga`);
}
function prioPadrao(cat, hid) {
  const h = IDX.hotel[hid];
  const ps = [DB.politicas.find(p => p.escopo_tipo === "hotel" && p.escopo_id === hid), DB.politicas.find(p => p.escopo_tipo === "bandeira" && p.escopo_id === h.bandeira_id), DB.politicas.find(p => p.escopo_tipo === "grupo")];
  for (const p of ps) if (p && p.prio_padrao && p.prio_padrao[cat]) return p.prio_padrao[cat];
  return "Média";
}
const paradaAberta = aid => DB.ativo_parada.find(p => p.ativo_id === aid && !p.fim);

/* ---------- Regras de SLA ---------- */
function slaEfetivo(hid, prio) {
  const h = IDX.hotel[hid];
  const ph = DB.politicas.find(p => p.escopo_tipo === "hotel" && p.escopo_id === hid);
  const pb = DB.politicas.find(p => p.escopo_tipo === "bandeira" && p.escopo_id === h.bandeira_id);
  const pg = DB.politicas.find(p => p.escopo_tipo === "grupo");
  if (ph && ph.sla[prio]) return { h: ph.sla[prio], origem: h.nome };
  if (pb && pb.sla[prio]) return { h: pb.sla[prio], origem: IDX.band[h.bandeira_id].nome };
  return { h: pg.sla[prio], origem: "Grupo" };
}
function escalonar(hid) {
  const ph = DB.politicas.find(p => p.escopo_tipo === "hotel" && p.escopo_id === hid);
  return (ph && ph.escalonar_em) || DB.politicas.find(p => p.escopo_tipo === "grupo").escalonar_em;
}
function slaInfo(c) {
  const prazo = t(c.prazo_sla);
  if (c.status === "Cancelado") return { cls: "done", txt: "Cancelado", state: "na" };
  if (c.status === "Encerrado") { const ok = t(c.encerrado_em) <= prazo; return { cls: ok ? "done" : "late", txt: ok ? "No prazo" : "Fora do prazo", state: ok ? "ok" : "late" }; }
  if (c.status === "Aguardando aceite") { const last = c.eventos[c.eventos.length - 1]; const ok = t(last.t) <= prazo; return { cls: "done", txt: ok ? "Serviço no prazo" : "Serviço fora do prazo", state: ok ? "ok" : "late" }; }
  const rem = (prazo - Date.now()) / H;
  if (rem < 0) return { cls: "late", txt: "Vencido há " + dur(rem), state: "late" };
  const pct = (Date.now() - t(c.aberto_em)) / Math.max(1, prazo - t(c.aberto_em));
  if (pct >= escalonar(c.hotel_id) / 100) return { cls: "warn", txt: "Vence em " + dur(rem), state: "warn" };
  return { cls: "", txt: "Vence em " + dur(rem), state: "ok" };
}
const tag = c => { const s = slaInfo(c); return `<span class="tag ${s.cls}">${esc(s.txt)}</span>`; };
const prio = p => `<span class="prio p-${p.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()}">${p}</span>`;
function statusBadge(s) {
  const m = { "Aberto": "b-amber", "Em atendimento": "b-blue", "Aguardando peça": "b-grey", "Aguardando aceite": "b-green", "Encerrado": "b-outline", "Cancelado": "b-outline", "Concluída": "b-green", "Atrasada": "b-red", "Programada": "b-blue", "Em execução": "b-amber" };
  return `<span class="badge ${m[s] || "b-grey"}">${esc(s)}</span>`;
}

/* ---------- Ícones ---------- */
const I = {
  painel: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  chamados: '<path d="M4 4h16v12H7l-3 3z"/><path d="M8 9h8M8 12h5"/>',
  os: '<path d="M9 3h6v3H9z"/><path d="M6 5H5v16h14V5h-1"/><path d="M9 12l2 2 4-4"/>',
  prev: '<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  ativos: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 12l9-5M12 12v10M12 12L3 7"/>',
  hoteis: '<path d="M4 21V5l8-3 8 3v16"/><path d="M9 21v-4h6v4M8 8h1M15 8h1M8 12h1M15 12h1"/>',
  pol: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  integ: '<path d="M4 7h11M11 3l4 4-4 4"/><path d="M20 17H9M13 13l-4 4 4 4"/>',
  tec: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><path d="M16 4.5a3.5 3.5 0 010 7M22 20c0-3-2-5-5-5.8"/>',
  audit: '<path d="M5 3h10l4 4v14H5z"/><path d="M9 12h6M9 16h6M9 8h3"/>',
  road: '<path d="M4 20L9 4M20 20L15 4M12 6v2M12 11v2M12 16v2"/>',
  imp: '<path d="M4 7l8-4 8 4v10l-8 4-8-4z"/><path d="M12 8v7M9 12l3 3 3-3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  ind: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  forn: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/><circle cx="18" cy="17" r="0"/>',
  intel: '<path d="M12 3a6 6 0 0 0-4 10.5V17h8v-3.5A6 6 0 0 0 12 3z"/><path d="M9 21h6M10 17v-3l2-2 2 2v3"/>',
  sig: '<path d="M3 17c3-6 5-9 7-9s-1 9 1 9 3-5 4-5 1 3 3 3 2-1 3-1"/><path d="M3 21h18"/>',
  cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'
};
const icon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k]}</svg>`;

/* ---------- Navegação ---------- */
function navItems() {
  const r = role();
  const all = [
    ["Operação", null],
    ["painel", "Painel", "painel"], ["indicadores", "Indicadores", "ind"], ["chamados", "Chamados", "chamados"], ["os", "Ordens de serviço", "os"], ["preventiva", "Preventiva", "prev"],
    ["Cadastros", null],
    ["ativos", "Ativos", "ativos"], ["implantacao", "Implantação de ativos", "imp"], ["hoteis", "Hotéis e unidades", "hoteis"], ["fornecedores", "Fornecedores", "forn"],
    ["Configuração", null],
    ["politicas", "Políticas de SLA", "pol"], ["integracao", "Integração PMS", "integ"], ["usuarios", "Usuários e escopos", "users"], ["auditoria", "Auditoria", "audit"],
    ["Módulo opcional", null],
    ["inteligencia", "HubKeep Intelligence", "intel"],
    ["Apresentação", null],
    ["tecnico", r === "tec" ? "Meu dia" : "App do técnico", "tec"], ["roadmap", "Próximas fases", "road"]
  ];
  const allow = {
    csc: null,
    band: ["painel", "indicadores", "chamados", "os", "preventiva", "ativos", "implantacao", "hoteis", "fornecedores", "politicas", "auditoria", "inteligencia", "tecnico"],
    hotel: ["painel", "indicadores", "chamados", "os", "preventiva", "ativos", "implantacao", "hoteis", "fornecedores", "auditoria", "inteligencia", "tecnico"],
    tec: ["tecnico"],
    prop: ["painel", "chamados"],
    loc: ["painel", "chamados", "os", "ativos"]
  }[r];
  const out = []; let pendingGroup = null;
  all.forEach(it => {
    if (!it[1]) { pendingGroup = it[0]; return; }
    if (allow && !allow.includes(it[0])) return;
    if (pendingGroup) { out.push({ group: pendingGroup }); pendingGroup = null; }
    out.push({ id: it[0], label: it[1], icon: it[2] });
  });
  return out;
}
function route() {
  const h = location.hash.replace(/^#\/?/, "");
  const [path, qs] = h.split("?");
  const params = Object.fromEntries(new URLSearchParams(qs || ""));
  let page = path || (role() === "tec" ? "tecnico" : "painel");
  const allowed = navItems().filter(x => x.id).map(x => x.id);
  if (!allowed.includes(page)) page = allowed[0];
  return { page, params };
}
function go(page, params) { const qs = params ? "?" + new URLSearchParams(params).toString() : ""; location.hash = "#/" + page + qs; }

/* ---------- Renderização principal ---------- */
const TITLES = { indicadores: "Indicadores", fornecedores: "Fornecedores", inteligencia: "HubKeep Intelligence", painel: "Painel", chamados: "Chamados", os: "Ordens de serviço", preventiva: "Preventiva", ativos: "Ativos", implantacao: "Implantação de ativos", hoteis: "Hotéis e unidades", politicas: "Políticas de SLA", integracao: "Integração PMS", usuarios: "Usuários e escopos", auditoria: "Auditoria", tecnico: "App do técnico", roadmap: "Próximas fases" };
function render() {
  document.querySelectorAll(".drawer, .drawer-bg").forEach(e => e.remove());
  const { page, params } = route();
  const p = persona(), s = scope();
  const openCount = scoped(DB.chamados).filter(c => OPEN.includes(c.status)).length;
  const nav = navItems().map(it => it.group ? `<div class="nav-group">${it.group}</div>` :
    `<a href="#/${it.id}" class="${it.id === page ? "active" : ""}" ${it.id === page ? 'aria-current="page"' : ""}>${icon(it.icon)}<span>${it.label}</span>${it.id === "chamados" ? `<span class="count">${openCount}</span>` : it.id === "inteligencia" ? `<span class="count">${iaVisiveis().filter(iaAberto).length}</span>` : ""}</a>`).join("");
  const personas = ["u1", "u2", "u3", "u4", "u5", "u90"].map(id => { const u = IDX.user[id]; return `<option value="${id}" ${id === UI.persona ? "selected" : ""}>${esc(u.nome)} (${esc(u.papel)})</option>`; }).join("");
  $("#app").innerHTML = `
  <div class="app">
    <aside class="sidebar" id="sidebar">
      <div class="brand"><svg class="brand-mark" viewBox="0 0 34 34" aria-hidden="true"><rect width="34" height="34" rx="9" fill="#0F3D45"/><path d="M8 22a9 9 0 0 1 18 0" fill="none" stroke="#2FD6C3" stroke-width="3" stroke-linecap="round"/><path d="M17 22l5-7" stroke="#F0A500" stroke-width="3" stroke-linecap="round"/><circle cx="17" cy="22" r="2.4" fill="#F0A500"/></svg><div><div class="brand-name">${esc(DEMO_CONFIG.produto)}</div><div class="brand-sub">por ${esc(DEMO_CONFIG.plataforma)} · ${esc(DEMO_CONFIG.cliente)}</div></div></div>
      <nav class="nav" aria-label="Menu principal">${nav}</nav>
      <div class="sidebar-foot"><button data-act="tour" class="tour-launch">Assistir demonstração guiada</button><br>${esc(DEMO_CONFIG.aviso)}<br><button data-act="reset">Restaurar dados da demo</button></div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="hamb" data-act="menu" aria-label="Abrir menu">☰</button>
        <h1>${TITLES[page] === "App do técnico" && role() === "tec" ? "Meu dia" : TITLES[page]}</h1>
        <span class="demo-flag">Demonstração</span>
        <div class="spacer"></div>
        <button class="btn sm theme-btn" data-act="theme" aria-label="Alternar entre tema claro e escuro" title="Alternar tema">${icon(UI.theme === "light" ? "moon" : "sun")}<span>${UI.theme === "light" ? "Tema escuro" : "Tema claro"}</span></button>
        <div class="persona"><span class="avatar">${initials(p.nome)}</span><label for="persona">Ver como</label><select id="persona" data-act="persona">${personas}</select></div>
      </header>
      <div class="scopebar">Você vê: <strong>${esc(s.label)}</strong>. O filtro de escopo é aplicado no banco de dados, não só na tela.</div>
      <main class="content" id="content">${PAGES[page](params)}</main>
    </div>
  </div>`;
  if (params.id) openDrawer(params.id, page);
  afterRender(page);
  tickLive();
}
function afterRender(page) {
  const sel = document.querySelector("#nc-hotel"); if (sel) updateNovoChamado();
}

/* ---------- Painel (sala de controle) ---------- */
const openAt = (chs, at) => chs.filter(c => c.status !== "Cancelado" && t(c.aberto_em) <= at && (c.encerrado_em ? t(c.encerrado_em) > at : true));
function slaWin(chs, from, to) { const e = chs.filter(c => c.status === "Encerrado" && t(c.encerrado_em) >= from && t(c.encerrado_em) < to); const ok = e.filter(c => t(c.encerrado_em) <= t(c.prazo_sla)).length; return { pct: e.length ? ok / e.length * 100 : null, n: e.length }; }
function mttrWin(chs, from, to) { const e = chs.filter(c => c.status === "Encerrado" && t(c.encerrado_em) >= from && t(c.encerrado_em) < to); return e.length ? e.reduce((a, c) => a + (t(c.encerrado_em) - t(c.aberto_em)) / H, 0) / e.length : null; }
function prevWin(oss, from, to) { const p = oss.filter(o => o.origem === "preventiva" && t(o.programada_para) >= from && t(o.programada_para) < Math.min(to, Date.now()) && o.status !== "Programada"); const ok = p.filter(o => o.status === "Concluída").length; return { pct: p.length ? ok / p.length * 100 : null, n: p.length, late: p.length - ok }; }
function kpis(chs, oss) {
  const now = Date.now(), d30 = now - 30 * D;
  const open = chs.filter(c => OPEN.includes(c.status)), running = open.filter(c => c.status !== "Aguardando aceite");
  const s = slaWin(chs, d30, now), p = prevWin(oss, d30, now);
  return { open: open.length, crit: running.filter(c => c.prioridade === "Crítica").length, late: running.filter(c => slaInfo(c).state === "late").length, sla: s.pct, enc: s.n, mttr: mttrWin(chs, d30, now), pv: p.pct, prevLate: p.late };
}
let gid = 0;
function smoothPath(pts) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
function spark(vals, color, w = 220, h = 38, minZero = true) {
  const v = vals.map(x => x == null ? null : x), nums = v.filter(x => x != null);
  if (nums.length < 2) return "";
  const max = Math.max(...nums), min = minZero ? Math.min(0, ...nums) : Math.min(...nums), rng = (max - min) || 1;
  const pts = v.map((x, i) => x == null ? null : [i * w / (v.length - 1), h - 3 - (x - min) / rng * (h - 6)]).filter(Boolean);
  const id = "g" + (++gid), line = smoothPath(pts), last = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L${last[0]},${h} L${pts[0][0]},${h} Z" fill="url(#${id})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="1.8" vector-effect="non-scaling-stroke"/><circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="${color}"/></svg>`;
}
function ring(pct, target, color) {
  const r = 25, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct || 0));
  const a = (target / 100) * 2 * Math.PI - Math.PI / 2, tx = 31 + Math.cos(a) * r, ty = 31 + Math.sin(a) * r;
  return `<svg class="ring" viewBox="0 0 62 62" aria-hidden="true"><circle cx="31" cy="31" r="${r}" fill="none" style="stroke:var(--tint-2)" stroke-width="6"/>
    <circle cx="31" cy="31" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${c * v / 100} ${c}" transform="rotate(-90 31 31)"/>
    <circle cx="${tx}" cy="${ty}" r="3.2" style="fill:var(--head);stroke:var(--surface)" stroke-width="1.5"><title>Meta: ${target}%</title></circle></svg>`;
}
const fmt1 = v => NF_FMT1.format(v);
function deltaHtml(d, unit, goodWhenUp, ref) {
  if (d == null || !isFinite(d)) return `<span class="delta flat">sem base de comparação</span>`;
  if (Math.abs(d) < 0.05) return `<span class="delta flat">estável ${ref}</span>`;
  const up = d > 0, cls = up ? (goodWhenUp ? "up-good" : "up-bad") : (goodWhenUp ? "down-bad" : "down-good");
  return `<span class="delta ${cls}">${up ? "▲" : "▼"} ${unit === "" ? Math.abs(Math.round(d)) : fmt1(Math.abs(d))}${unit} ${ref}</span>`;
}
function hotelHealth(hid, chs, oss) {
  const open = chs.filter(c => c.hotel_id === hid && OPEN.includes(c.status));
  const run = open.filter(c => c.status !== "Aguardando aceite").map(c => ({ c, s: slaInfo(c).state }));
  const late = run.filter(x => x.s === "late"), warn = run.filter(x => x.s === "warn");
  const crit = run.filter(x => x.c.prioridade === "Crítica").length;
  const critLate = late.some(x => x.c.prioridade === "Crítica");
  const pl = oss.filter(o => o.hotel_id === hid && o.status === "Atrasada").length;
  const st = critLate || late.length >= 3 ? "crit" : (late.length || warn.length || pl >= 2) ? "att" : "ok";
  return { hid, open: open.length, late: late.length, warn: warn.length, crit, pl, st };
}
function pageDashboard() {
  const chs = scoped(DB.chamados), oss = scoped(DB.os), s = scope(), r = role(), now = Date.now();
  const k = kpis(chs, oss);
  const hs = s.hoteis.map(h => hotelHealth(h, chs, oss));
  const nCrit = hs.filter(h => h.st === "crit").length, nAtt = hs.filter(h => h.st === "att").length, nOk = hs.length - nCrit - nAtt;
  const band = nCrit ? "crit" : nAtt ? "att" : "ok";
  const warnTot = hs.reduce((a, h) => a + h.warn, 0), hotLate = hs.filter(h => h.late).length;
  const plural = (n, a, b) => n === 1 ? a : b;
  const headline = k.late ? `${k.late} ${plural(k.late, "chamado fora do prazo", "chamados fora do prazo")}${hs.length > 1 ? ` em ${hotLate} ${plural(hotLate, "hotel", "hotéis")}` : ""}` : "Tudo dentro do prazo agora";
  const sub = [warnTot ? `${warnTot} ${plural(warnTot, "vence", "vencem")} em breve` : null, k.crit ? `${k.crit} ${plural(k.crit, "crítico", "críticos")} em atendimento` : null, !isOwner() && k.prevLate ? `${k.prevLate} preventivas atrasadas em 30 dias` : null].filter(Boolean).join(". ") || "Nenhum chamado perto de vencer.";
  const stLabel = { crit: "Estado da rede: crítico", att: "Estado da rede: atenção", ok: "Estado da rede: normal" }[band].replace("rede", hs.length > 1 ? "rede" : "operação");
  const statusBand = `<section class="status-band ${band}" aria-label="Estado da operação">
    <div><div class="meta"><span class="live"><i></i>Ao vivo</span><span>${stLabel}</span></div>
      <div class="headline">${headline}</div><div class="sub">${sub}.</div></div>
    <div class="clock-wrap"><div class="clock" id="live-clock">--:--:--</div><div class="meta clock-meta"><span>${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</span><span>PMS lido <span data-rel="${DB.integracao.views[2].ultima}">${rel(DB.integracao.views[2].ultima)}</span></span></div></div>
    ${hs.length > 1 ? `<div class="health-bar" aria-hidden="true">${hs.slice().sort((a, b) => ({ crit: 0, att: 1, ok: 2 }[a.st] - { crit: 0, att: 1, ok: 2 }[b.st])).map(h => `<i class="${h.st === "ok" ? "" : h.st}" title="${esc(IDX.hotel[h.hid].nome)}"></i>`).join("")}</div>
    <div class="health-legend"><span><b>${nCrit}</b>${plural(nCrit, "hotel crítico", "hotéis críticos")}</span><span><b>${nAtt}</b>em atenção</span><span><b>${nOk}</b>${plural(nOk, "normal", "normais")}</span></div>` : ""}
  </section>`;

  // Instrumentos
  const days = 30, wk = 12;
  const newSeries = Array.from({ length: days }, (_, i) => chs.filter(c => { const x = t(c.aberto_em); return x >= now - (days - i) * D && x < now - (days - 1 - i) * D; }).length);
  const new24 = newSeries[days - 1], avgNew = newSeries.slice(0, -1).reduce((p, v) => p + v, 0) / (days - 1);
  const weekly = f => Array.from({ length: wk }, (_, i) => f(now - (wk - i) * 7 * D, now - (wk - 1 - i) * 7 * D));
  const slaS = weekly((a, b) => slaWin(chs, a, b).pct), mttrS = weekly((a, b) => mttrWin(chs, a, b)), prevS = weekly((a, b) => prevWin(oss, a, b).pct);
  const slaPrev = slaWin(chs, now - 60 * D, now - 30 * D).pct, mttrPrev = mttrWin(chs, now - 60 * D, now - 30 * D), pvPrev = prevWin(oss, now - 60 * D, now - 30 * D).pct;
  const mttrTxt = k.mttr == null ? "—" : k.mttr < 24 ? fmt1(k.mttr) + "<small>h</small>" : fmt1(k.mttr / 24) + "<small>dias</small>";
  const col = (v, g, w) => v == null ? "#8AA5AB" : v >= g ? "#2FD6C3" : v >= w ? "#F0A500" : "#FF5A5F";
  const inst = `<div class="grid g-4" style="margin-bottom:16px">
    <div class="panel inst"><div class="lab">Chamados em aberto</div><div class="val">${k.open}</div><span class="delta ${new24 > avgNew * 1.3 ? "up-bad" : "flat"}">${new24} ${new24 === 1 ? "novo" : "novos"} em 24 h (média ${fmt1(avgNew)})</span>
      <div class="spark">${spark(newSeries, "#2FD6C3")}</div><div class="foot">${k.crit} críticos, ${k.late} fora do prazo. Linha: novos por dia.</div></div>
    <div class="panel inst has-ring"><div class="lab">SLA cumprido</div>${ring(k.sla, 90, col(k.sla, 90, 80))}<div class="val">${k.sla == null ? "—" : fmt1(k.sla)}<small>%</small></div>${deltaHtml(k.sla != null && slaPrev != null ? k.sla - slaPrev : null, " p.p.", true, "vs. 30 dias antes")}
      <div class="spark">${spark(slaS, col(k.sla, 90, 80), 220, 38, false)}</div><div class="foot">Meta de 90%. ${k.enc} encerrados em 30 dias.</div></div>
    <div class="panel inst"><div class="lab">Tempo médio de reparo</div><div class="val">${mttrTxt}</div>${deltaHtml(k.mttr != null && mttrPrev ? (k.mttr - mttrPrev) / mttrPrev * 100 : null, "%", false, "vs. 30 dias antes")}
      <div class="spark">${spark(mttrS, "#5CC8E0", 220, 38, false)}</div><div class="foot">Da abertura ao encerramento, por semana.</div></div>
    ${r === "loc" ? `<div class="panel inst"><div class="lab">Categorias sob o locador</div><div class="val">${s.cats.length}</div><span class="delta flat">${esc(s.cats.map(c => IDX.cat[c].nome).join(", "))}</span><div class="foot" style="margin-top:22px">Definidas na matriz de responsabilidade do contrato de arrendamento.</div></div>` : r === "prop" ? `<div class="panel inst"><div class="lab">UHs acompanhadas</div><div class="val">${s.locais.length}</div><span class="delta flat">${esc(s.hoteis.map(h => IDX.hotel[h].nome).join(", "))}</span><div class="foot" style="margin-top:22px">Você vê só os chamados das suas unidades.</div></div>` :
      `<div class="panel inst has-ring"><div class="lab">Preventivas em dia</div>${ring(k.pv, 95, col(k.pv, 95, 85))}<div class="val">${k.pv == null ? "—" : fmt1(k.pv)}<small>%</small></div>${deltaHtml(k.pv != null && pvPrev != null ? k.pv - pvPrev : null, " p.p.", true, "vs. 30 dias antes")}
      <div class="spark">${spark(prevS, col(k.pv, 95, 85), 220, 38, false)}</div><div class="foot">Meta de 95%. ${k.prevLate} atrasadas em 30 dias.</div></div>`}
  </div>`;

  // Situação por hotel
  const mx = { open: Math.max(1, ...hs.map(h => h.open)), warn: Math.max(1, ...hs.map(h => h.warn)), late: Math.max(1, ...hs.map(h => h.late)), crit: Math.max(1, ...hs.map(h => h.crit)), pl: Math.max(1, ...hs.map(h => h.pl)) };
  const heat = (v, m, rgb) => v ? `style="background:rgba(${rgb},${(.18 + .6 * v / m).toFixed(2)})"` : "";
  const order = { crit: 0, att: 1, ok: 2 };
  const rows = hs.slice().sort((a, b) => order[a.st] - order[b.st] || b.late - a.late || b.open - a.open).map(h => {
    const hc = chs.filter(c => c.hotel_id === h.hid);
    const sl = slaWin(hc, now - 30 * D, now).pct;
    const trend = Array.from({ length: 14 }, (_, i) => hc.filter(c => { const x = t(c.aberto_em); return x >= now - (14 - i) * D && x < now - (13 - i) * D; }).length);
    const hn = IDX.hotel[h.hid];
    const c = col(sl, 90, 80);
    return `<tr class="click" data-act="goto-hotel" data-id="${h.hid}" title="Ver chamados de ${esc(hn.nome)}">
      <td><div class="hname"><span class="led ${h.st === "ok" ? "" : h.st}" aria-label="${h.st === "crit" ? "crítico" : h.st === "att" ? "atenção" : "normal"}"></span><span>${esc(hn.nome.replace(/^Hotel /, ""))}<small>${esc(IDX.band[hn.bandeira_id].nome)}, ${esc(hn.modelo.toLowerCase())}, ${hn.uhs} UHs</small></span></div></td>
      <td><div class="cell ${h.open ? "" : "zero"}" ${heat(h.open, mx.open, "47,214,195")}>${h.open}</div></td>
      <td><div class="cell ${h.warn ? "" : "zero"}" ${heat(h.warn, mx.warn, "240,165,0")}>${h.warn}</div></td>
      <td><div class="cell ${h.late ? "" : "zero"}" ${heat(h.late, mx.late, "255,90,95")}>${h.late}</div></td>
      <td><div class="cell ${h.crit ? "" : "zero"}" ${heat(h.crit, mx.crit, "255,90,95")}>${h.crit}</div></td>
      ${isOwner() ? "" : `<td><div class="cell ${h.pl ? "" : "zero"}" ${heat(h.pl, mx.pl, "240,165,0")}>${h.pl}</div></td>`}
      <td><div class="slabar"><div class="trk"><b style="width:${sl ?? 0}%;background:${c}"></b><em></em></div><span style="color:${c}">${sl == null ? "—" : Math.round(sl) + "%"}</span></div></td>
      <td class="spark-cell">${spark(trend, "#5CC8E0", 110, 28)}</td></tr>`;
  }).join("");
  const matrix = `<div class="panel"><div class="panel-h"><h2>Situação por hotel</h2><span class="hint">Cores mais fortes indicam mais ocorrências. Clique em um hotel para ver a fila dele.</span></div>
    <div class="panel-b table-wrap"><table class="matrix"><thead><tr><th>Hotel</th><th>Em aberto</th><th>Vencem em breve</th><th>Fora do prazo</th><th>Críticos</th>${isOwner() ? "" : "<th>Prev. atrasadas</th>"}<th>SLA 30 dias<br>(meta 90%)</th><th>Chamados abertos por dia, 14 dias</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;

  // Contagem regressiva
  const runningAll = chs.filter(c => OPEN.includes(c.status) && c.status !== "Aguardando aceite");
  const cds = runningAll.filter(c => t(c.prazo_sla) > now).sort((a, b) => t(a.prazo_sla) - t(b.prazo_sla)).slice(0, 6);
  const countdown = `<div class="panel"><div class="panel-h"><h2>Contagem regressiva do SLA</h2><span class="hint">Próximos prazos a vencer</span><div class="spacer"></div>${k.late ? `<a href="#" class="badge b-red" data-act="goto-late" style="text-decoration:none">${k.late} já ${k.late === 1 ? "vencido" : "vencidos"}</a>` : ""}</div><div class="panel-b" style="padding-top:0">
    ${cds.length ? `<ul class="cd-list">${cds.map(c => `<li class="cd-item" data-act="open-ch" data-id="${c.id}" data-deadline="${c.prazo_sla}" data-open="${c.aberto_em}" data-hid="${c.hotel_id}">
      <div class="cd-t">${esc(c.titulo)}</div><div class="cd-time"><span class="cd-v">--:--:--</span><small class="cd-l"></small></div>
      <div class="cd-s">${prio(c.prioridade)} <span style="margin-left:6px">${esc(IDX.hotel[c.hotel_id].nome.replace(/^Hotel /, ""))}, ${esc(IDX.local[c.local_id].nome)}</span></div>
      <div class="cd-bar"><b></b></div></li>`).join("")}</ul>` : `<div class="empty">Nenhum chamado em andamento.</div>`}
    <div class="row" style="justify-content:flex-end;margin-top:8px"><a href="#/chamados" class="small">Ver fila completa</a></div></div></div>`;

  // Últimos eventos (decisão 5 do Cesar, 10/10/2026: lidos da auditoria, sem o selo "ao vivo")
  const aud = DB.auditoria.filter(a => audVisivel(a, s)).filter(a => !(s.locais && a.entidade === "Chamado" && IDX.ch[a.registro] && !s.locais.includes(IDX.ch[a.registro].local_id))).slice(0, 5);
  const icFor = a => a.entidade === "Chamado" ? ["ch", "chamados"] : a.entidade === "OS" ? ["os", "os"] : ["po", "pol"];
  const feed = isOwner() ? "" : `<div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Últimos eventos</h2></div><div class="panel-b" style="padding-top:0"><ul class="feed">${aud.map(a => { const [cl, ic] = icFor(a); return `<li class="${now - t(a.t) < 90e3 ? "new" : ""}"><span class="ic ${cl}">${icon(ic)}</span><div>${esc(a.acao)}<div class="who">${esc(a.usuario)}, ${esc(a.entidade.toLowerCase())} ${esc(a.registro)}</div></div><span class="w" data-rel="${a.t}">${rel(a.t)}</span></li>`; }).join("")}</ul></div></div>`;

  // Fluxo diário e categorias
  const dAb = Array(days).fill(0), dEn = Array(days).fill(0), start0 = now - days * D;
  chs.forEach(c => { const i = Math.floor((t(c.aberto_em) - start0) / D); if (i >= 0 && i < days) dAb[i]++; if (c.encerrado_em && c.status === "Encerrado") { const j = Math.floor((t(c.encerrado_em) - start0) / D); if (j >= 0 && j < days) dEn[j]++; } });
  const labels = dAb.map((_, i) => { const d = new Date(start0 + i * D); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1); });
  const cc = {}; chs.filter(c => t(c.aberto_em) >= now - 30 * D).forEach(c => cc[c.categoria_id] = (cc[c.categoria_id] || 0) + 1);
  const cats = Object.entries(cc).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([id, v]) => ({ label: id === "null" ? "Aguardando triagem" : IDX.cat[id].nome, v }));

  return `${statusBand}${inst}
  <div class="grid g-3-1" style="align-items:start">${matrix}<div>${countdown}${feed}</div></div>
  <div class="grid g-3-1" style="margin-top:16px">
    <div class="panel"><div class="panel-h"><h2>Fluxo de chamados</h2><span class="hint">Abertos e encerrados por dia, 30 dias</span></div><div class="panel-b chart">${areaChart([{ name: "Abertos", c: "#F0A500", v: dAb }, { name: "Encerrados", c: "#2FD6C3", v: dEn }], labels)}</div></div>
    <div class="panel"><div class="panel-h"><h2>Onde mais quebra</h2><span class="hint">Chamados por categoria, 30 dias</span></div><div class="panel-b chart">${barChart(cats)}</div></div>
  </div>`;
}
function areaChart(series, labels) {
  const W = 760, Hh = 230, pl = 30, pb = 24, pt = 10, pr = 8, n = labels.length;
  const max = Math.max(4, ...series.flatMap(s => s.v)), top = Math.ceil(max / 4) * 4;
  const x = i => pl + i * (W - pl - pr) / (n - 1), y = v => pt + (Hh - pt - pb) * (1 - v / top);
  const grid = [0, .25, .5, .75, 1].map(f => { const v = Math.round(top * f); return `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--grid)"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`; }).join("");
  const xl = labels.map((l, i) => i % 5 === 0 || i === n - 1 ? `<text x="${x(i)}" y="${Hh - 6}" text-anchor="middle">${i === n - 1 ? "hoje" : l}</text>` : "").join("");
  const paths = series.map(s => {
    const pts = s.v.map((v, i) => [x(i), y(v)]), line = smoothPath(pts), id = "a" + (++gid);
    return `<defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${s.c}" stop-opacity=".28"/><stop offset="1" stop-color="${s.c}" stop-opacity="0"/></linearGradient></defs>
      <path d="${line} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z" fill="url(#${id})"/><path d="${line}" fill="none" stroke="${s.c}" stroke-width="2.2"/>
      ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="7" fill="transparent"><title>${s.name}: ${s.v[i]} em ${labels[i]}</title></circle>`).join("")}`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Chamados abertos e encerrados por dia">${grid}${xl}${paths}</svg><div class="legend">${series.map(s => `<span style="--c:${s.c}">${s.name}</span>`).join("")}</div>`;
}
function barChart(items) {
  if (!items.length) return `<div class="empty">Sem chamados no período.</div>`;
  const max = Math.max(...items.map(i => i.v)); const rowH = 30, W = 360;
  return `<div style="display:grid;gap:9px">${items.map(it => `<div><div style="display:flex;justify-content:space-between;font-size:13px;color:var(--steel);margin-bottom:4px"><span>${esc(it.label)}</span><span style="color:var(--head);font-family:var(--font-cond);font-weight:600;font-size:15px">${it.v}</span></div>
    <div style="height:7px;border-radius:4px;background:var(--tint-2);overflow:hidden"><div style="height:100%;width:${Math.max(3, it.v / max * 100)}%;border-radius:4px;background:linear-gradient(90deg,var(--petrol-2),var(--ok))"></div></div></div>`).join("")}</div>`;
}
/* Relógio, contagens regressivas e tempos relativos atualizam a cada segundo, sem redesenhar a tela */
function hms(ms) { const s = Math.floor(Math.abs(ms) / 1000), h = Math.floor(s / 3600); if (h >= 100) return dur(Math.abs(ms) / H); return `${pad(h)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; }
function tickLive() {
  const now = Date.now();
  const clk = document.getElementById("live-clock"); if (clk) { const d = new Date(); clk.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
  document.querySelectorAll("[data-deadline]").forEach(el => {
    const dl = t(el.dataset.deadline), rem = dl - now, used = (now - t(el.dataset.open)) / Math.max(1, dl - t(el.dataset.open));
    const esc_ = escalonar(el.dataset.hid) / 100;
    const st = rem < 0 ? "late" : used >= esc_ ? "warn" : "";
    const v = el.querySelector(".cd-v"), l = el.querySelector(".cd-l"), tm = el.querySelector(".cd-time"), bar = el.querySelector(".cd-bar");
    if (v) v.textContent = (rem < 0 ? "+" : "") + hms(rem);
    if (l) l.textContent = rem < 0 ? "vencido há" : "restante";
    if (tm) tm.className = "cd-time " + st;
    if (bar) { bar.className = "cd-bar " + st; bar.firstElementChild.style.width = Math.min(100, Math.max(2, used * 100)) + "%"; }
  });
  document.querySelectorAll("[data-rel]").forEach(el => { el.textContent = rel(el.dataset.rel); });
}
setInterval(tickLive, 1000);

/* ---------- Chamados ---------- */
function hotelOptions(sel) { return scope().hoteis.map(id => `<option value="${id}" ${sel === id ? "selected" : ""}>${esc(IDX.hotel[id].nome)}</option>`).join(""); }
function chamadosFiltrados() {
  const f = UI.f.ch;
  let list = scoped(DB.chamados);
  if (f.hotel) list = list.filter(c => c.hotel_id === f.hotel);
  if (f.status === "abertos") list = list.filter(c => OPEN.includes(c.status));
  else if (f.status === "vencidos") list = list.filter(c => OPEN.includes(c.status) && slaInfo(c).state === "late");
  else if (f.status) list = list.filter(c => c.status === f.status);
  if (f.prio) list = list.filter(c => c.prioridade === f.prio);
  if (f.cat) list = list.filter(c => c.categoria_id === f.cat);
  if (f.q) { const q = f.q.toLowerCase(); list = list.filter(c => (c.id + " " + c.titulo + " " + IDX.local[c.local_id].nome).toLowerCase().includes(q)); }
  if (f.status === "abertos" || f.status === "vencidos") list.sort((a, b) => t(a.prazo_sla) - t(b.prazo_sla));
  return list;
}
function pageChamados() {
  const f = UI.f.ch, list = chamadosFiltrados();
  const per = 25, pages = Math.max(1, Math.ceil(list.length / per)); f.page = Math.min(f.page, pages - 1);
  const rows = list.slice(f.page * per, f.page * per + per);
  const showHotel = scope().hoteis.length > 1;
  return `
  <div class="filters">
    <input type="search" placeholder="Buscar por número, título ou UH" value="${esc(f.q)}" data-f="ch.q" aria-label="Buscar chamados">
    ${showHotel ? `<select data-f="ch.hotel" aria-label="Hotel"><option value="">Todos os hotéis</option>${hotelOptions(f.hotel)}</select>` : ""}
    <select data-f="ch.status" aria-label="Situação">
      ${[["abertos", "Em aberto"], ["vencidos", "Vencidos"], ["", "Todos"], ...["Aberto", "Em atendimento", "Aguardando peça", "Aguardando aceite", "Encerrado", "Cancelado"].map(s => [s, s])].map(([v, l]) => `<option value="${v}" ${f.status === v ? "selected" : ""}>${l}</option>`).join("")}
    </select>
    <select data-f="ch.prio" aria-label="Prioridade"><option value="">Todas as prioridades</option>${PRIOS.map(p => `<option ${f.prio === p ? "selected" : ""}>${p}</option>`).join("")}</select>
    <select data-f="ch.cat" aria-label="Categoria"><option value="">Todas as categorias</option>${DB.categorias.map(c => `<option value="${c.id}" ${f.cat === c.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select>
    <div style="flex:1"></div>
    <button class="btn" data-act="csv-ch">Exportar CSV</button>
    ${role() !== "tec" && role() !== "loc" ? `<button class="btn primary" data-act="novo-ch">Abrir chamado</button>` : ""}
  </div>
  <div class="panel"><div class="table-wrap"><table>
    <thead><tr><th>Chamado</th><th>O que aconteceu</th>${showHotel ? "<th>Hotel</th>" : ""}<th>Local</th><th>Prioridade</th><th>Situação</th><th>SLA</th><th>Técnico</th><th>Aberto</th></tr></thead>
    <tbody>${rows.map(c => `<tr class="click" data-act="open-ch" data-id="${c.id}">
      <td><span class="id">${c.id}</span></td><td>${esc(c.titulo)}${c.triagem ? ' <span class="badge b-amber">Triagem</span>' : ""}</td>${showHotel ? `<td class="small">${esc(IDX.hotel[c.hotel_id].nome)}</td>` : ""}
      <td class="small">${esc(IDX.local[c.local_id].nome)}</td><td>${prio(c.prioridade)}</td><td>${statusBadge(c.status)}</td><td>${tag(c)}</td>
      <td class="small">${c.tecnico_id ? esc(nomeUser(c.tecnico_id)) : '<span class="muted">Sem técnico</span>'}</td><td class="small muted" style="white-space:nowrap">${rel(c.aberto_em)}</td></tr>`).join("") || `<tr><td colspan="9" class="empty">Nenhum chamado com esses filtros. Limpe a busca ou escolha outra situação.</td></tr>`}</tbody>
  </table></div>
  <div class="pager" style="padding:10px 14px">${list.length} chamados<span class="row"><button class="btn sm" data-act="page" data-k="ch" data-d="-1" ${f.page === 0 ? "disabled" : ""}>Anterior</button><span>Página ${f.page + 1} de ${pages}</span><button class="btn sm" data-act="page" data-k="ch" data-d="1" ${f.page >= pages - 1 ? "disabled" : ""}>Próxima</button></span></div></div>`;
}
function executorDe(c) { return c.tecnico_id && (!c.executado_por || c.executado_por.tipo === "interna") ? c.tecnico_id : null; }
function drawerChamado(c) {
  const h = IDX.hotel[c.hotel_id], l = IDX.local[c.local_id], a = c.ativo_id ? IDX.ativo[c.ativo_id] : null;
  const pol = slaEfetivo(c.hotel_id, c.prioridade);
  const uh = l.tipo === "uh" ? DB.statusUH[l.id] : null;
  const dono = IDX.donoDe[l.id] ? IDX.prop[IDX.donoDe[l.id]].nome : null;
  const ed = canEdit() && OPEN.includes(c.status);
  const tecs = DB.tecnicos.filter(x => x.hotel_id === c.hotel_id);
  const acts = [];
  const souExecutor = executorDe(c) === UI.persona;
  if (ed) {
    if (c.status === "Aberto") acts.push(`<button class="btn primary" data-act="ch-st" data-id="${c.id}" data-st="Em atendimento" ${c.tecnico_id ? "" : "disabled title='Atribua um técnico antes'"}>Iniciar atendimento</button>`);
    if (c.status === "Em atendimento") acts.push(`<button class="btn primary" data-act="ch-st" data-id="${c.id}" data-st="Aguardando aceite">Concluir serviço</button>`, `<button class="btn" data-act="ch-st" data-id="${c.id}" data-st="Aguardando peça">Aguardar peça</button>`);
    if (c.status === "Aguardando peça") acts.push(`<button class="btn primary" data-act="ch-st" data-id="${c.id}" data-st="Em atendimento">Retomar atendimento</button>`);
    if (c.status === "Aguardando aceite") acts.push(`<button class="btn primary" data-act="aceite" data-id="${c.id}" ${souExecutor ? "disabled title='Quem executou não aceita o próprio serviço'" : ""}>Registrar aceite</button>`, `<button class="btn" data-act="ch-st" data-id="${c.id}" data-st="Em atendimento">Reabrir</button>`);
    acts.push(`<button class="btn danger" data-act="ch-st" data-id="${c.id}" data-st="Cancelado">Cancelar chamado</button>`);
  }
  const ui = c.uh_indisp, uiH = ui ? ((ui.fim ? t(ui.fim) : Date.now()) - t(ui.inicio)) / H : 0;
  const cod = c.codigos;
  return `
  <div class="drawer-h"><button class="close" data-act="close" aria-label="Fechar">×</button>
    <span class="id">${c.id}</span><h2>${esc(c.titulo)}</h2>
    <div class="row">${statusBadge(c.status)} ${prio(c.prioridade)} ${tag(c)}${c.impacto_hospede ? ' <span class="badge b-amber">Impacto no hóspede</span>' : ""}</div></div>
  <div class="drawer-b">
    <dl class="kv">
      <dt>Hotel</dt><dd>${esc(h.nome)} <span class="muted small">(${esc(IDX.band[h.bandeira_id].nome)}, ${esc(h.modelo.toLowerCase())})</span></dd>
      <dt>Local</dt><dd>${esc(l.nome)}${l.andar ? `, ${l.andar}º andar` : ""}${l.edificacao ? `, ${esc(l.edificacao)}` : ""}${uh ? ` <span class="badge ${uh === "Bloqueada" ? "b-red" : uh === "Ocupada" ? "b-amber" : "b-green"}">${uh}</span> <span class="muted small">no PMS</span>` : ""}</dd>
      ${dono ? `<dt>Proprietário da UH</dt><dd>${esc(dono)}</dd>` : ""}
      <dt>Ativo</dt><dd>${a ? `<a href="#" data-act="open-at" data-id="${a.id}">${esc(a.nome)}</a> <span class="muted small">${a.id}</span>` : '<span class="muted">Não vinculado</span>'}</dd>
      <dt>Categoria</dt><dd>${esc(catNome(c.categoria_id))}${c.categoria_id && calComercial(c.categoria_id) ? ' <span class="muted small">(relógio em horário comercial)</span>' : ""}</dd>
      <dt>Origem</dt><dd>${esc(c.origem || "—")}${c.solicitante && c.solicitante !== c.origem ? ` <span class="muted small">(${esc(c.solicitante)})</span>` : ""}</dd>
      <dt>Aberto em</dt><dd>${fmtDT(c.aberto_em)} <span class="muted small">(${rel(c.aberto_em)})</span></dd>
      <dt>Prazo do SLA</dt><dd>${fmtDT(c.prazo_sla)} <span class="muted small">${c.sla_h} h, regra de ${esc(pol.origem === "Grupo" ? "grupo" : pol.origem)}</span></dd>
      <dt>Técnico</dt><dd>${ed ? `<span class="row"><select id="atrib" aria-label="Técnico"><option value="">Selecionar</option>${tecs.map(x => `<option value="${x.id}" ${x.id === c.tecnico_id ? "selected" : ""}>${esc(x.nome)} (${esc(x.especialidade)})</option>`).join("")}</select><button class="btn sm" data-act="atribuir" data-id="${c.id}">Atribuir</button></span>` : esc(c.tecnico_id ? nomeUser(c.tecnico_id) : "—")}</dd>
      ${c.executado_por ? `<dt>Executado por</dt><dd>${esc(nomeExec(c.executado_por))}</dd>` : ""}
      ${c.responsavel_custo ? `<dt>Responsável pelo custo</dt><dd><span class="badge ${c.responsavel_custo === "Locador" ? "b-blue" : "b-grey"}">${esc(c.responsavel_custo)}</span> <span class="muted small">matriz do arrendamento${c.locador_notificado_em ? `, locador notificado em ${fmtDT(c.locador_notificado_em)}` : ""}</span></dd>` : ""}
      ${c.status === "Encerrado" ? `<dt>Custo informado</dt><dd>${c.custo != null ? brl(c.custo) : "Não informado"}</dd>${cod ? `<dt>Códigos</dt><dd class="small">Falha: ${esc(cod.falha)}. Causa: ${esc(cod.causa)}. Solução: ${esc(cod.solucao)}.</dd>` : ""}` : ""}
    </dl>
    ${uh ? `<div class="readonly-note">${icon("integ")}<span>Status da UH lido do PMS há ${rel(DB.integracao.views[2].ultima).replace("há ", "")}. A Central só lê o PMS: o bloqueio da UH continua sendo feito no PMS pela recepção.</span></div>` : ""}
    ${l.tipo === "uh" && c.status !== "Cancelado" && (ui || ed) ? `<div class="parada ${ui && !ui.fim ? "on" : ""}" id="uh-indisp"><div><strong>${ui ? (ui.fim ? "UH ficou indisponível" : "UH indisponível") : "UH disponível"}</strong><div class="small muted">${ui ? `${ui.fim ? `De ${fmtDT(ui.inicio)} a ${fmtDT(ui.fim)}` : `Desde ${fmtDT(ui.inicio)}`}: ${dur(uiH)}. Conta em UH-dias perdidos por manutenção.` : "Registre se a UH saiu de venda por causa deste problema."}</div></div>${ed ? `<button class="btn sm" data-act="uh-indisp" data-id="${c.id}">${ui && !ui.fim ? "Registrar UH liberada" : ui ? "Reabrir período" : "Registrar UH indisponível"}</button>` : ""}</div>` : ""}
    ${c.triagem && ed ? `<div class="triage"><h3 style="margin-top:0">Triagem</h3><p class="small muted" style="margin:0 0 10px">Quem abriu informou só o local e o problema. Classifique para definir a prioridade e o prazo.</p>
      <div class="two"><div class="field"><label for="tr-cat">Categoria</label><select id="tr-cat"><option value="">Selecione</option>${DB.categorias.map(k => `<option value="${k.id}">${esc(k.nome)}</option>`).join("")}</select></div>
      <div class="field"><label for="tr-prio">Prioridade</label><select id="tr-prio"><option value="auto">Padrão da categoria</option>${PRIOS.map(p => `<option>${p}</option>`).join("")}</select></div></div>
      <div class="row"><button class="btn primary" data-act="triar" data-id="${c.id}">Classificar chamado</button><span class="small muted" id="tr-hint"></span></div></div>` : ""}
    ${a && OPEN.includes(c.status) ? (() => { const pa = paradaAberta(a.id); return `<div class="parada ${pa ? "on" : ""}" id="parada"><div><strong>${pa ? "Equipamento parado" : "Equipamento operando"}</strong><div class="small muted">${pa ? `Desde ${fmtDT(pa.inicio)}, há ${dur((Date.now() - t(pa.inicio)) / H)}. Conta no histórico de indisponibilidade do ativo.` : "Registre se o problema deixou o equipamento fora de operação."}</div></div>${ed ? `<button class="btn sm" data-act="parada" data-id="${c.id}">${pa ? "Registrar retorno à operação" : "Registrar parada"}</button>` : ""}</div>`; })() : ""}
    ${acts.length ? `<h3>Ações</h3><div class="row">${acts.join("")}</div>${c.status === "Aguardando aceite" && souExecutor ? `<div class="readonly-note warn">${icon("pol")}<span>Você executou este serviço, então não pode aceitá-lo. O aceite fica com o solicitante, outro gerente do hotel ou, na falta dele, a gestão do CSC.</span></div>` : ""}` : isOwner() ? `<div class="readonly-note">${role() === "loc" ? "O locador acompanha o que o contrato põe sob a responsabilidade dele, sem editar." : "Proprietários acompanham os chamados das próprias UHs, sem editar."}</div>` : ""}
    <h3>Fotos</h3><div class="photos">${Array.from({ length: c.fotos }, (_, i) => `<div class="photo">Foto ${i + 1}<br>${i === 0 ? "antes" : "depois"}</div>`).join("") || '<span class="muted small">Nenhuma foto anexada.</span>'}</div>
    ${c.aceite ? `<h3>Aceite</h3><div class="sig-view">${c.aceite.img ? `<img src="${c.aceite.img}" alt="Assinatura de ${esc(c.aceite.por)}">` : c.aceite.assinatura ? `<svg viewBox="0 0 220 60" aria-hidden="true"><path d="M8 44c14-22 24-32 32-30s-6 30 4 30 14-20 22-20 2 18 12 18 12-14 20-14 6 10 14 10 18-8 30-8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>` : '<span class="muted small">Aceite sem assinatura</span>'}<div class="small"><strong>${esc(c.aceite.por)}</strong><br><span class="muted">${fmtDT(c.aceite.t)}${c.aceite.assinatura || c.aceite.img ? ", assinado no celular" : ""}</span></div></div>` : ""}
    <h3>Histórico</h3>
    <ul class="timeline">${[...c.eventos].reverse().map(e => `<li class="${e.tipo === "sistema" ? "sys" : ""}"><div>${esc(e.txt)}</div><div class="when">${fmtDT(e.t)}${e.por ? ", por " + esc(e.por) : ""}</div></li>`).join("")}</ul>
    ${!isOwner() && role() !== "tec" ? `<div class="field"><label for="coment">Comentário</label><textarea id="coment" placeholder="Escreva uma atualização para a equipe"></textarea></div><button class="btn" data-act="comentar" data-id="${c.id}">Adicionar comentário</button>` : ""}
  </div>`;
}
function logEvent(c, tipo, txt) {
  const por = persona().nome;
  c.eventos.push({ t: new Date().toISOString(), tipo, txt, por });
  DB.auditoria.unshift({ t: new Date().toISOString(), usuario: por, entidade: "Chamado", registro: c.id, hotel_id: c.hotel_id, acao: txt });
}
function setStatus(c, st) {
  const now = new Date().toISOString();
  if (st === "Em atendimento" && !c.atendido_em) c.atendido_em = now;
  if (st === "Encerrado") c.encerrado_em = now;
  if ((st === "Encerrado" || st === "Cancelado") && c.ativo_id) { const pa = paradaAberta(c.ativo_id); if (pa) { pa.fim = now; IDX.ativo[c.ativo_id].status = "Operando"; } }
  if (st === "Cancelado") c.encerrado_em = now;
  if ((st === "Encerrado" || st === "Cancelado") && c.uh_indisp && !c.uh_indisp.fim) c.uh_indisp.fim = now;
  c.status = st;
  logEvent(c, "status", st === "Aguardando aceite" ? "Serviço concluído, aguardando aceite do solicitante" : st === "Encerrado" ? "Encerrado com aceite do solicitante" : st);
  const o = DB.os.find(x => x.chamado_id === c.id);
  if (st === "Em atendimento" && !o) {
    const nid = nextId("OS", DB.os);
    const nos = { id: nid, origem: "corretiva", chamado_id: c.id, plano_id: null, hotel_id: c.hotel_id, local_id: c.local_id, ativo_id: c.ativo_id, titulo: c.titulo, responsavel_id: c.tecnico_id, status: "Em execução", programada_para: now, inicio: now, fim: null, horas: null, checklist: [], materiais: "", executado_por: { tipo: "interna" }, responsavel_custo: c.responsavel_custo,
      transicoes: [{ de: null, para: "Criada", t: now, por: persona().nome }, { de: "Criada", para: "Em execução", t: now, por: persona().nome }] };
    DB.os.push(nos); IDX.os[nid] = nos;
  }
  if (o && st === "Aguardando peça" && o.status !== "Concluída") transicaoOS(o, "Aguardando peça");
  if (o && st === "Em atendimento" && o.status !== "Em execução") transicaoOS(o, o.status === "Concluída" ? "Reaberta" : "Em execução");
  if (o && st === "Em atendimento") o.status = "Em execução";
  if (o && (st === "Encerrado" || st === "Aguardando aceite") && o.status !== "Concluída") { transicaoOS(o, "Concluída"); o.status = "Concluída"; o.fim = now; o.horas = Math.round((t(now) - t(o.inicio)) / H * 10) / 10; }
}
/* Transições da OS: tabela só de inserção, fonte do MTTR e da Intelligence */
function transicoesOS(o) {
  if (o.transicoes) return o.transicoes;
  const out = [{ de: null, para: o.origem === "preventiva" ? "Programada" : "Criada", t: o.origem === "preventiva" ? new Date(t(o.programada_para) - 20 * D).toISOString() : (o.inicio || o.programada_para), por: o.origem === "preventiva" ? "Sistema (plano preventivo)" : "Sistema" }];
  if (o.status === "Atrasada") out.push({ de: "Programada", para: "Atrasada", t: new Date(t(o.programada_para) + 4 * H).toISOString(), por: "Sistema" });
  if (o.inicio) out.push({ de: out[out.length - 1].para, para: "Em execução", t: o.inicio, por: nomeUser(o.responsavel_id) });
  if (o.fim) out.push({ de: "Em execução", para: "Concluída", t: o.fim, por: nomeUser(o.responsavel_id) });
  return out;
}
function transicaoOS(o, para) { o.transicoes = transicoesOS(o).slice(); const de = o.transicoes[o.transicoes.length - 1].para; o.transicoes.push({ de, para, t: new Date().toISOString(), por: persona().nome }); }

/* Novo chamado: abertura mínima (local, descrição e foto); a classificação é opcional */
function modalNovoChamado(pre = {}) {
  const s = scope(), hs = s.hoteis, hid = pre.hotel || hs[0];
  UI.ncFotos = 0;
  return `<div class="modal-bg" data-act="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="nc-t">
    <div class="modal-h" id="nc-t">Abrir chamado</div>
    <div class="modal-b">
      <div class="two">
        <div class="field"><label for="nc-hotel">Hotel</label><select id="nc-hotel">${hs.map(id => `<option value="${id}" ${id === hid ? "selected" : ""}>${esc(IDX.hotel[id].nome)}</option>`).join("")}</select></div>
        <div class="field"><label for="nc-local">Onde</label><select id="nc-local"></select></div>
      </div>
      <div class="field"><label for="nc-desc">O que aconteceu</label><textarea id="nc-desc" placeholder="Ex.: o ar-condicionado não gela e está pingando"></textarea></div>
      <div class="field"><label>Fotos</label><div class="photos" id="nc-photos"><button class="photo add" data-act="nc-foto" type="button">${icon("cam")}<span>Adicionar foto</span></button></div></div>
      <label class="inline-check"><input type="checkbox" id="nc-parado"> O equipamento parou de funcionar</label>
      <label class="inline-check"><input type="checkbox" id="nc-hosp"> Afeta o hóspede</label>
      <label class="inline-check" id="nc-uh-wrap"><input type="checkbox" id="nc-uh"> A UH precisa sair de venda</label>
      <details class="more" id="nc-more"><summary>Classificar agora (opcional)</summary>
        <div class="two" style="margin-top:10px">
          <div class="field"><label for="nc-cat">Categoria</label><select id="nc-cat"><option value="">Deixar para a triagem</option>${DB.categorias.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join("")}</select></div>
          <div class="field"><label for="nc-prio">Prioridade</label><select id="nc-prio"><option value="auto">Padrão da categoria</option>${PRIOS.map(p => `<option>${p}</option>`).join("")}</select></div>
        </div>
        <div class="field"><label for="nc-sol">Quem está abrindo</label><select id="nc-sol">${["Recepção", "Governança", "Hóspede (via recepção)", "A&B", "Gerência", role() === "prop" ? "Proprietário" : null].filter(Boolean).map(x => `<option ${role() === "prop" && x === "Proprietário" ? "selected" : ""}>${x}</option>`).join("")}</select></div>
      </details>
      <div class="readonly-note" id="nc-sla"></div>
    </div>
    <div class="modal-f"><button class="btn" data-act="modal-close">Cancelar</button><button class="btn primary" data-act="nc-save">Abrir chamado</button></div>
  </div></div>`;
}
function ncPrio() {
  const hid = $("#nc-hotel").value, cat = $("#nc-cat").value, sel = $("#nc-prio").value;
  const p = sel !== "auto" ? sel : cat ? prioPadrao(cat, hid) : "Média";
  return { hid, cat, sel, p, e: slaEfetivo(hid, p) };
}
function updateNovoChamado() {
  const s = scope(), loc = $("#nc-local"), hid = $("#nc-hotel").value;
  if (loc.dataset.h !== hid) {
    const ls = DB.locais.filter(l => l.hotel_id === hid && (!s.locais || s.locais.includes(l.id)));
    loc.innerHTML = ls.map(l => `<option value="${l.id}">${esc(l.nome)}${l.edificacao ? ", " + esc(l.edificacao) : ""}</option>`).join(""); loc.dataset.h = hid;
  }
  const w = $("#nc-uh-wrap"); if (w) w.style.display = (IDX.local[loc.value] || {}).tipo === "uh" ? "" : "none";
  const x = ncPrio(), reg = x.e.origem === "Grupo" ? "grupo" : x.e.origem;
  const txt = !x.cat && x.sel === "auto" ? `Sem categoria, o CSC classifica na triagem. Até lá vale a prioridade Média: prazo de <strong>${x.e.h} h</strong>, pela regra de ${esc(reg)}.`
    : x.sel === "auto" ? `Prioridade padrão para ${esc(catNome(x.cat).toLowerCase())}: ${x.p}. Prazo de <strong>${x.e.h} h</strong>, pela regra de ${esc(reg)}.`
    : `Prioridade ${x.p}: prazo de <strong>${x.e.h} h</strong>, pela regra de ${esc(reg)}.`;
  $("#nc-sla").innerHTML = `${icon("pol")}<span>${txt} Tudo definido em Políticas, sem regra fixa no código.</span>`;
}
function salvarNovoChamado() {
  const desc = $("#nc-desc").value.trim();
  if (!desc) { $("#nc-desc").focus(); toast("Descreva o que aconteceu para abrir o chamado"); return; }
  const x = ncPrio(), now = Date.now(), lid = $("#nc-local").value;
  const first = desc.split(/[.!?\n]/)[0].trim(), titulo = (first.length > 70 ? first.slice(0, 67) + "…" : first).replace(/^./, m => m.toUpperCase());
  const at = x.cat ? DB.ativos.find(a => a.local_id === lid && a.categoria_id === x.cat) : null;
  const sol = $("#nc-sol").value, parado = $("#nc-parado").checked, hosp = $("#nc-hosp").checked, uhOff = $("#nc-uh").checked && IDX.local[lid].tipo === "uh";
  const c = {
    id: nextId("CH", DB.chamados), hotel_id: x.hid, local_id: lid, ativo_id: at ? at.id : null, categoria_id: x.cat || null, titulo,
    descricao: desc, prioridade: x.p, status: "Aberto", aberto_em: new Date(now).toISOString(), triagem: !x.cat,
    prazo_sla: new Date(prazoDe(x.cat, now, x.e.h)).toISOString(), sla_h: x.e.h, atendido_em: null, encerrado_em: null, tecnico_id: null,
    solicitante: sol, eventos: [], fotos: UI.ncFotos, origem: { "Recepção": "Recepção", "Governança": "Governança", "Hóspede (via recepção)": "Hóspede, pela recepção", "Proprietário": "Proprietário" }[sol] || "Área operacional",
    impacto_hospede: hosp || sol === "Hóspede (via recepção)", uh_indisp: uhOff ? { inicio: new Date(now).toISOString(), fim: null } : null
  };
  const resp = DB.responsabilidade.find(r => r.hotel_id === x.hid && r.categoria_id === x.cat); if (resp) c.responsavel_custo = resp.responsavel;
  c.eventos.push({ t: c.aberto_em, tipo: "abertura", txt: "Chamado aberto por " + sol + (UI.ncFotos ? `, com ${UI.ncFotos} ${UI.ncFotos > 1 ? "fotos" : "foto"}` : ""), por: persona().nome });
  c.eventos.push({ t: c.aberto_em, tipo: "sistema", txt: x.cat ? `Prazo de SLA definido: ${x.e.h} h (prioridade ${x.p}${x.sel === "auto" ? ", padrão da categoria" : ""})` : `Aguardando triagem. Prazo provisório: ${x.e.h} h (prioridade Média)` });
  if (parado) {
    if (at) { DB.ativo_parada.push({ id: "PA-" + (DB.ativo_parada.length + 1), ativo_id: at.id, chamado_id: c.id, inicio: c.aberto_em, fim: null, motivo: titulo }); at.status = "Parado"; c.eventos.push({ t: c.aberto_em, tipo: "sistema", txt: "Parada do equipamento registrada" }); }
    else c.eventos.push({ t: c.aberto_em, tipo: "sistema", txt: "Solicitante informou equipamento parado; vincular o ativo na triagem" });
  }
  if (uhOff) c.eventos.push({ t: c.aberto_em, tipo: "sistema", txt: "Período de UH indisponível iniciado" });
  notificarLocador(c);
  DB.chamados.unshift(c); IDX.ch[c.id] = c;
  DB.auditoria.unshift({ t: c.aberto_em, usuario: persona().nome, entidade: "Chamado", registro: c.id, hotel_id: x.hid, acao: "Chamado aberto: " + titulo });
  save(); closeModal(); toast(`Chamado ${c.id} aberto`); go("chamados", { id: c.id });
}
function triar(c) {
  const cat = $("#tr-cat").value, sel = $("#tr-prio").value;
  if (!cat) { $("#tr-cat").focus(); toast("Escolha a categoria para classificar"); return false; }
  const p = sel === "auto" ? prioPadrao(cat, c.hotel_id) : sel, e = slaEfetivo(c.hotel_id, p);
  c.categoria_id = cat; c.prioridade = p; c.sla_h = e.h; c.prazo_sla = new Date(prazoDe(cat, t(c.aberto_em), e.h)).toISOString(); c.triagem = false;
  const resp = DB.responsabilidade.find(r => r.hotel_id === c.hotel_id && r.categoria_id === cat); c.responsavel_custo = resp ? resp.responsavel : undefined;
  const at = DB.ativos.find(a => a.local_id === c.local_id && a.categoria_id === cat); if (at) c.ativo_id = at.id;
  logEvent(c, "sistema", `Triagem: ${catNome(cat)}, prioridade ${p}${sel === "auto" ? " (padrão da categoria)" : ""}. Prazo de ${e.h} h${calComercial(cat) ? " em horário comercial" : ""}, regra de ${e.origem === "Grupo" ? "grupo" : e.origem}`);
  notificarLocador(c);
  save(); return true;
}
function notificarLocador(c) {
  if (c.responsavel_custo !== "Locador" || c.locador_notificado_em) return;
  c.locador_notificado_em = new Date().toISOString();
  c.eventos.push({ t: c.locador_notificado_em, tipo: "sistema", txt: "Locador notificado: categoria sob responsabilidade dele no contrato" });
}

/* Aceite: quem executou não aceita; registra quem executou, custo, códigos e a assinatura */
function modalAceite(c) {
  const cd = DB.codigos[c.categoria_id] || DB.codigos._, obrig = polGrupo().codigos_obrigatorios;
  const forns = DB.fornecedores.filter(f => f.ativo);
  const ex = c.executado_por || { tipo: "interna" };
  const sel = (id, arr) => `<select id="${id}"><option value="">${obrig ? "Selecione" : "Não informar"}</option>${arr.map(x => `<option>${esc(x)}</option>`).join("")}</select>`;
  return `<div class="modal-bg" data-act="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="ac-t">
    <div class="modal-h" id="ac-t">Aceite do serviço ${c.id}</div>
    <div class="modal-b">
      <p class="small muted" style="margin-top:0">${esc(c.titulo)}. ${esc(IDX.hotel[c.hotel_id].nome)}, ${esc(IDX.local[c.local_id].nome)}.</p>
      <div class="two">
        <div class="field"><label for="ac-exec">Executado por</label><select id="ac-exec"><option value="interna" ${ex.tipo === "interna" ? "selected" : ""}>Equipe interna${c.tecnico_id ? " (" + esc(nomeUser(c.tecnico_id)) + ")" : ""}</option>${forns.map(f => `<option value="${f.id}" ${ex.fornecedor_id === f.id ? "selected" : ""}>${esc(f.nome)}</option>`).join("")}</select></div>
        <div class="field"><label for="ac-custo">Custo informado (R$)</label><input id="ac-custo" type="number" min="0" step="10" inputmode="decimal" aria-describedby="ac-custo-d"><div class="small muted" id="ac-custo-d" style="margin-top:4px">Em branco, fica como não informado; 0 é custo zero.</div></div>
      </div>
      <div class="field"><label>Códigos de manutenção ${obrig ? "(obrigatórios pela política)" : "(opcionais pela política)"}</label><div class="three">${sel("ac-falha", cd.falha)}${sel("ac-causa", cd.causa)}${sel("ac-sol", cd.solucao)}</div><div class="small muted" style="margin-top:4px">Falha, causa e solução, do catálogo de ${esc(catNome(c.categoria_id).toLowerCase())}.</div></div>
      <div class="field"><label for="ac-sig">Assinatura de quem aceita: ${esc(c.solicitante === "Hóspede (via recepção)" ? "Recepção" : c.solicitante)}</label><canvas id="ac-sig" class="sig-pad" width="640" height="180" aria-label="Área para assinatura"></canvas><div class="row" style="justify-content:space-between"><span class="small muted">Assine com o dedo no celular ou com o mouse.</span><button class="btn sm" data-act="ac-limpar" type="button">Limpar</button></div></div>
    </div>
    <div class="modal-f"><button class="btn" data-act="modal-close">Cancelar</button><button class="btn primary" data-act="ac-save" data-id="${c.id}">Aceitar e encerrar</button></div>
  </div></div>`;
}
function ligarAssinatura(cv) {
  const g = cv.getContext("2d"); let desenhando = false;
  g.lineWidth = 3.2; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--head").trim() || "#fff";
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  cv.addEventListener("pointerdown", e => { desenhando = true; cv.setPointerCapture(e.pointerId); const [x, y] = pos(e); g.beginPath(); g.moveTo(x, y); cv.dataset.ok = "1"; });
  cv.addEventListener("pointermove", e => { if (!desenhando) return; const [x, y] = pos(e); g.lineTo(x, y); g.stroke(); });
  cv.addEventListener("pointerup", () => { desenhando = false; });
  cv.__g = g;
}
function salvarAceite(c) {
  const obrig = polGrupo().codigos_obrigatorios, cv = $("#ac-sig");
  const falha = $("#ac-falha").value, causa = $("#ac-causa").value, solu = $("#ac-sol").value;
  if (obrig && !(falha && causa && solu)) { toast("A política exige falha, causa e solução para encerrar"); return false; }
  if (!cv.dataset.ok) { toast("Peça a assinatura de quem está aceitando o serviço"); return false; }
  const exv = $("#ac-exec").value, bruto = $("#ac-custo").value.trim(), custo = bruto === "" ? null : parseFloat(bruto);
  if (custo !== null && !(custo >= 0)) { toast("Informe um custo de zero ou mais, ou deixe em branco"); return false; }
  c.executado_por = exv === "interna" ? { tipo: "interna" } : { tipo: "fornecedor", fornecedor_id: exv };
  c.custo = custo; if (falha || causa || solu) c.codigos = { falha: falha || "—", causa: causa || "—", solucao: solu || "—" };
  const quem = c.solicitante === "Hóspede (via recepção)" ? "Recepção" : c.solicitante;
  c.aceite = { t: new Date().toISOString(), por: quem, assinatura: true, img: cv.toDataURL("image/png") };
  const o = DB.os.find(x => x.chamado_id === c.id); if (o) o.executado_por = c.executado_por;
  logEvent(c, "sistema", `Aceite assinado por ${quem}. Executado por ${nomeExec(c.executado_por)}${custo !== null ? ", custo informado de " + brl(custo) : ", custo não informado"}`);
  setStatus(c, "Encerrado"); save(); return true;
}
function closeModal() { const m = document.querySelector(".modal-bg"); if (m) m.remove(); }

/* ---------- Checklist tipado (sim/não e medição com faixa) ---------- */
const numBR = v => String(v).replace(".", ",");
function checklistHtml(o, ed, pre) {
  return o.checklist.map((c, i) => c.tipo === "lista"
    ? `<div class="check-item med ${c.valor ? "okm" : ""}"><div class="med-t"><label for="${pre}-${o.id}-${i}">${esc(c.t)}</label><div class="med-f">Lista de opções</div></div><div class="med-in"><select id="${pre}-${o.id}-${i}" data-act="${pre}-list" data-id="${o.id}" data-i="${i}" ${ed ? "" : "disabled"}><option value="">Escolha</option>${c.opcoes.map(x => `<option ${c.valor === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div></div>`
    : c.tipo === "data"
    ? `<div class="check-item med ${c.valor ? "okm" : ""}"><div class="med-t"><label for="${pre}-${o.id}-${i}">${esc(c.t)}</label><div class="med-f">Data</div></div><div class="med-in"><input type="date" id="${pre}-${o.id}-${i}" data-act="${pre}-date" data-id="${o.id}" data-i="${i}" value="${c.valor || ""}" ${ed ? "" : "disabled"}></div></div>`
    : c.tipo === "foto"
    ? `<div class="check-item med ${c.ok ? "okm" : ""}"><div class="med-t"><span>${esc(c.t)}</span><div class="med-f">Foto obrigatória${c.ok ? ": anexada" : ""}</div></div><div class="med-in"><button type="button" class="btn sm" data-act="${pre}-fotoit" data-id="${o.id}" data-i="${i}" ${ed && !c.ok ? "" : "disabled"}>${c.ok ? "Foto anexada" : icon("cam") + " Tirar foto"}</button></div></div>`
    : c.tipo === "medicao"
    ? `<div class="check-item med ${c.fora ? "fora" : c.valor != null ? "okm" : ""}"><div class="med-t"><label for="${pre}-${o.id}-${i}">${esc(c.t)}</label><div class="med-f">Faixa aceitável: ${numBR(c.min)} a ${numBR(c.max)}${c.unidade ? " " + c.unidade : ""}${c.fora ? ". Fora da faixa" : ""}</div></div>
       <div class="med-in"><input type="number" step="0.1" inputmode="decimal" id="${pre}-${o.id}-${i}" data-act="${pre}-med" data-id="${o.id}" data-i="${i}" value="${c.valor ?? ""}" ${ed ? "" : "disabled"} aria-label="${esc(c.t)}"><span>${esc(c.unidade)}</span></div></div>`
    : `<label class="check-item"><input type="checkbox" data-act="${pre}-chk" data-id="${o.id}" data-i="${i}" ${c.ok ? "checked" : ""} ${ed ? "" : "disabled"}><span>${esc(c.t)}</span></label>`).join("");
}
function setMedicao(o, i, v) {
  const c = o.checklist[i], n = parseFloat(String(v).replace(",", "."));
  c.valor = isNaN(n) ? null : n; c.fora = c.valor != null && (c.valor < c.min || c.valor > c.max);
}
const itemFeito = c => c.tipo === "medicao" ? c.valor != null : c.tipo === "lista" || c.tipo === "data" ? !!c.valor : !!c.ok;
const checklistPendente = o => o.checklist.some(c => !itemFeito(c));

/* ---------- Ordens de serviço ---------- */
function pageOS() {
  const f = UI.f.os;
  let list = scoped(DB.os);
  if (f.origem) list = list.filter(o => o.origem === f.origem);
  if (f.status) list = list.filter(o => o.status === f.status); else list = list.filter(o => o.status !== "Programada" || t(o.programada_para) < Date.now() + D);
  if (f.hotel) list = list.filter(o => o.hotel_id === f.hotel);
  list.sort((a, b) => t(b.programada_para) - t(a.programada_para));
  const per = 25, pages = Math.max(1, Math.ceil(list.length / per)); f.page = Math.min(f.page, pages - 1);
  const rows = list.slice(f.page * per, f.page * per + per);
  const showHotel = scope().hoteis.length > 1;
  return `<div class="filters">
    <select data-f="os.origem" aria-label="Origem"><option value="">Corretivas e preventivas</option><option value="corretiva" ${f.origem === "corretiva" ? "selected" : ""}>Corretivas</option><option value="preventiva" ${f.origem === "preventiva" ? "selected" : ""}>Preventivas</option></select>
    <select data-f="os.status" aria-label="Situação"><option value="">Todas até amanhã</option>${["Programada", "Em execução", "Atrasada", "Concluída"].map(s => `<option ${f.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
    ${showHotel ? `<select data-f="os.hotel" aria-label="Hotel"><option value="">Todos os hotéis</option>${hotelOptions(f.hotel)}</select>` : ""}
  </div>
  <div class="panel"><div class="table-wrap"><table><thead><tr><th>OS</th><th>Serviço</th><th>Origem</th>${showHotel ? "<th>Hotel</th>" : ""}<th>Responsável</th><th>Programada</th><th>Situação</th><th class="num">Horas</th></tr></thead>
  <tbody>${rows.map(o => `<tr class="click" data-act="open-os" data-id="${o.id}"><td><span class="id">${o.id}</span></td><td>${esc(o.titulo)}</td><td><span class="badge ${o.origem === "preventiva" ? "b-blue" : "b-amber"}">${o.origem === "preventiva" ? "Preventiva" : "Corretiva"}</span></td>${showHotel ? `<td class="small">${esc(IDX.hotel[o.hotel_id].nome)}</td>` : ""}<td class="small">${esc(nomeUser(o.responsavel_id))}</td><td class="small">${fmtDT(o.programada_para)}</td><td>${statusBadge(o.status)}</td><td class="num">${o.horas != null ? String(o.horas).replace(".", ",") : "—"}</td></tr>`).join("") || `<tr><td colspan="8" class="empty">Nenhuma ordem de serviço com esses filtros.</td></tr>`}</tbody></table></div>
  <div class="pager" style="padding:10px 14px">${list.length} ordens<span class="row"><button class="btn sm" data-act="page" data-k="os" data-d="-1" ${f.page === 0 ? "disabled" : ""}>Anterior</button><span>Página ${f.page + 1} de ${pages}</span><button class="btn sm" data-act="page" data-k="os" data-d="1" ${f.page >= pages - 1 ? "disabled" : ""}>Próxima</button></span></div></div>`;
}
function drawerOS(o) {
  const ed = canEdit() && o.status !== "Concluída";
  const pl = o.plano_id ? IDX.plano[o.plano_id] : null;
  return `<div class="drawer-h"><button class="close" data-act="close" aria-label="Fechar">×</button><span class="id">${o.id}</span><h2>${esc(o.titulo)}</h2>
    <div class="row">${statusBadge(o.status)} <span class="badge ${o.origem === "preventiva" ? "b-blue" : "b-amber"}">${o.origem === "preventiva" ? "Preventiva" : "Corretiva"}</span></div></div>
  <div class="drawer-b"><dl class="kv">
    <dt>Hotel</dt><dd>${esc(IDX.hotel[o.hotel_id].nome)}</dd><dt>Local</dt><dd>${esc(IDX.local[o.local_id].nome)}</dd>
    <dt>Ativo</dt><dd>${o.ativo_id ? `<a href="#" data-act="open-at" data-id="${o.ativo_id}">${esc(IDX.ativo[o.ativo_id].nome)}</a>` : "—"}</dd>
    ${pl ? `<dt>Plano</dt><dd>${esc(pl.nome)}, a cada ${pl.periodicidade_dias} dias</dd>` : ""}
    ${o.chamado_id ? `<dt>Chamado</dt><dd><a href="#" data-act="open-ch" data-id="${o.chamado_id}">${o.chamado_id}</a></dd>` : ""}
    <dt>Responsável</dt><dd>${esc(nomeUser(o.responsavel_id))}</dd><dt>Programada</dt><dd>${fmtDT(o.programada_para)}</dd>
    <dt>Execução</dt><dd>${o.inicio ? fmtDT(o.inicio) : "—"}${o.fim ? " até " + fmtDT(o.fim) : ""}</dd>
    <dt>Horas apontadas</dt><dd>${o.horas != null ? String(o.horas).replace(".", ",") + " h" : "—"}</dd>
    ${o.executado_por ? `<dt>Executado por</dt><dd>${esc(nomeExec(o.executado_por))}</dd>` : ""}
    ${o.responsavel_custo ? `<dt>Responsável pelo custo</dt><dd><span class="badge ${o.responsavel_custo === "Locador" ? "b-blue" : "b-grey"}">${esc(o.responsavel_custo)}</span></dd>` : ""}
    ${o.materiais ? `<dt>Materiais</dt><dd>${esc(o.materiais)}</dd>` : ""}
  </dl>
  ${o.checklist.length ? `<h3>Checklist</h3>${checklistHtml(o, ed, "os")}${o.checklist.some(c => c.fora) ? `<div class="readonly-note warn">${icon("pol")}<span>${o.checklist.filter(c => c.fora).length} medição fora da faixa, registrada no histórico do ativo.</span></div>` : ""}` : ""}
  <div class="row" style="margin-top:14px">${ed ? `<button class="btn primary" data-act="os-concluir" data-id="${o.id}">Concluir OS</button>` : ""}<button class="btn" data-act="os-print" data-id="${o.id}">Imprimir OS</button></div>
  <h3>Transições</h3><p class="small muted" style="margin-top:0">Cada mudança de estado, quando e por quem. Só é possível acrescentar; é a base do tempo médio de reparo e da Intelligence.</p>
  <div class="table-wrap"><table><tbody>${transicoesOS(o).map(x => `<tr><td class="small" style="white-space:nowrap">${fmtDT(x.t)}</td><td class="small">${x.de ? esc(x.de) + " → " : ""}<strong>${esc(x.para)}</strong></td><td class="small muted">${esc(x.por)}</td></tr>`).join("")}</tbody></table></div>
  </div>`;
}
function imprimirOS(o) {
  const c = o.chamado_id ? IDX.ch[o.chamado_id] : null, h = IDX.hotel[o.hotel_id];
  const item = x => x.tipo === "medicao" ? `${esc(x.t)}: ${x.valor == null ? "—" : numBR(x.valor) + " " + esc(x.unidade)} (faixa ${numBR(x.min)} a ${numBR(x.max)})${x.fora ? " — FORA DA FAIXA" : ""}` : x.tipo === "lista" || x.tipo === "data" ? `${esc(x.t)}: ${esc(x.valor || "—")}` : `${x.ok ? "☑" : "☐"} ${esc(x.t)}`;
  const el = document.createElement("div"); el.id = "print-area";
  el.innerHTML = `<h1>Ordem de serviço ${o.id}</h1><p>${esc(DEMO_CONFIG.produto)} · ${esc(DB.tenant.nome)} · ${esc(h.nome)}</p>
    <table><tr><th>Serviço</th><td>${esc(o.titulo)}</td></tr><tr><th>Origem</th><td>${o.origem === "preventiva" ? "Preventiva" : "Corretiva" + (c ? ", chamado " + c.id : "")}</td></tr>
    <tr><th>Local</th><td>${esc(IDX.local[o.local_id].nome)}</td></tr><tr><th>Ativo</th><td>${o.ativo_id ? esc(IDX.ativo[o.ativo_id].nome) + " (" + o.ativo_id + ")" : "—"}</td></tr>
    <tr><th>Responsável</th><td>${esc(nomeUser(o.responsavel_id))}</td></tr><tr><th>Executado por</th><td>${esc(nomeExec(o.executado_por))}</td></tr>
    <tr><th>Execução</th><td>${o.inicio ? fmtDT(o.inicio) : "—"}${o.fim ? " até " + fmtDT(o.fim) : ""}, ${o.horas != null ? numBR(o.horas) + " h" : "—"}</td></tr>
    ${c && c.custo != null ? `<tr><th>Custo informado</th><td>${brl(c.custo)}</td></tr>` : ""}</table>
    ${o.checklist.length ? `<h2>Checklist</h2><ul>${o.checklist.map(x => `<li>${item(x)}</li>`).join("")}</ul>` : ""}
    <h2>Fotos</h2><p>${c ? c.fotos : o.fotos || 0} foto(s) anexada(s), marcadas como antes ou depois.</p>
    <h2>Aceite</h2>${c && c.aceite ? `<p>${esc(c.aceite.por)}, ${fmtDT(c.aceite.t)}</p>${c.aceite.img ? `<img src="${c.aceite.img}" style="height:70px">` : "<p>Assinado no celular.</p>"}` : "<p>Pendente.</p>"}
    <p class="foot">Impresso em ${fmtDT(new Date().toISOString())} por ${esc(persona().nome)}. ${esc(DEMO_CONFIG.aviso)}.</p>`;
  document.body.appendChild(el); window.print(); setTimeout(() => el.remove(), 500);
}
function concluirOS(o) {
  const now = new Date();
  if (checklistPendente(o)) { toast("Preencha todas as medições e marque os itens do checklist para concluir a OS"); return false; }
  o.status = "Concluída"; o.inicio = o.inicio || new Date(now - 1.2 * H).toISOString(); o.fim = now.toISOString(); o.horas = o.horas || 1.2;
  DB.auditoria.unshift({ t: o.fim, usuario: persona().nome, entidade: "OS", registro: o.id, hotel_id: o.hotel_id, acao: "OS concluída: " + o.titulo });
  save(); return true;
}

/* ---------- Preventiva ---------- */
function pagePreventiva() {
  const oss = scoped(DB.os).filter(o => o.origem === "preventiva");
  const now = Date.now(), d30 = now - 30 * D;
  const planos = DB.planos.map(p => {
    const po = oss.filter(o => o.plano_id === p.id);
    const due = po.filter(o => t(o.programada_para) >= d30 && t(o.programada_para) <= now && o.status !== "Programada");
    const ok = due.filter(o => o.status === "Concluída").length;
    const ativosCob = new Set(po.map(o => o.ativo_id)).size;
    const prox = po.filter(o => o.status === "Programada").sort((a, b) => t(a.programada_para) - t(b.programada_para))[0];
    return { p, ativosCob, pct: due.length ? Math.round(ok / due.length * 100) : null, late: due.length - ok, prox };
  }).filter(x => x.ativosCob);
  // Calendário
  const base = UI.cal ? new Date(UI.cal) : new Date(); base.setDate(1); base.setHours(0, 0, 0, 0);
  const y = base.getFullYear(), m = base.getMonth();
  const first = new Date(y, m, 1), startDow = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  const hf = UI.calHotel === null ? scope().hoteis[0] : UI.calHotel;
  const calOs = hf ? oss.filter(o => o.hotel_id === hf) : oss;
  const evLabel = o => (hf ? "" : IDX.hotel[o.hotel_id].nome.replace(/^(Hotel|Suítes) /, "") + ": ") + IDX.ativo[o.ativo_id].nome;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(`<div class="day out"></div>`);
  for (let d = 1; d <= days; d++) {
    const ds = new Date(y, m, d).getTime(), de = ds + D;
    const evs = calOs.filter(o => t(o.programada_para) >= ds && t(o.programada_para) < de);
    const max = 3;
    cells.push(`<div class="day ${ds === today.getTime() ? "today" : ""}"><div class="dn">${d}</div>${evs.slice(0, max).map(o => `<button class="ev ${o.status === "Concluída" ? "ok" : o.status === "Atrasada" ? "late" : "plan"}" data-act="open-os" data-id="${o.id}" title="${esc(IDX.hotel[o.hotel_id].nome + ": " + o.titulo)}">${esc(evLabel(o))}</button>`).join("")}${evs.length > max ? `<span class="ev more">mais ${evs.length - max}</span>` : ""}</div>`);
  }
  while (cells.length % 7) cells.push(`<div class="day out"></div>`);
  const mes = base.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return `
  <div class="panel"><div class="panel-h"><h2>Planos preventivos</h2><span class="hint">Definidos por categoria de ativo no grupo; cada hotel herda e pode ajustar a data.</span></div>
  <div class="panel-b table-wrap"><table><thead><tr><th>Plano</th><th>Categoria</th><th class="num">Periodicidade</th><th class="num">Ativos cobertos</th><th>Próxima OS</th><th class="num">Em dia (30 dias)</th></tr></thead>
  <tbody>${planos.map(x => `<tr><td><span class="id">${x.p.id}</span> ${esc(x.p.nome)}<div class="small muted">${x.p.checklist.length} itens de checklist</div></td><td class="small">${esc(IDX.cat[x.p.categoria_id].nome)}</td><td class="num">${x.p.periodicidade_dias} dias</td><td class="num">${x.ativosCob}</td><td class="small">${x.prox ? fmtDT(x.prox.programada_para) : "—"}</td><td class="num">${x.pct == null ? "—" : `<span class="badge ${x.pct >= 95 ? "b-green" : x.pct >= 85 ? "b-amber" : "b-red"}">${x.pct}%</span>`}${x.late ? `<div class="small muted">${x.late} atrasadas</div>` : ""}</td></tr>`).join("")}</tbody></table></div></div>
  <div class="panel" style="margin-top:18px"><div class="panel-h"><h2 style="text-transform:none">Calendário de ${mes}</h2><div class="spacer"></div>
    ${scope().hoteis.length > 1 ? `<select data-act="cal-hotel" aria-label="Hotel do calendário"><option value="">Todos os hotéis</option>${hotelOptions(hf)}</select>` : ""}
    <button class="btn sm" data-act="cal" data-d="-1">Mês anterior</button><button class="btn sm" data-act="cal" data-d="0">Hoje</button><button class="btn sm" data-act="cal" data-d="1">Próximo mês</button></div>
  <div class="panel-b"><div class="legend" style="margin:0 0 8px"><span style="--c:#3DD68C">Concluída</span><span style="--c:#FF5A5F">Atrasada</span><span style="--c:#5CC8E0">Programada</span></div>
  <div class="cal">${["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(d => `<div class="dow">${d}</div>`).join("")}${cells.join("")}</div>
  <p class="small muted">As OS preventivas são geradas automaticamente a partir dos planos. Reprogramar exige justificativa, registrada na auditoria.</p></div></div>`;
}

/* ---------- Ativos ---------- */
function qrSvg(seed, size = 64) {
  let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const r = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
  const n = 21, c = size / n; let out = "";
  const finder = (x, y) => `<rect x="${x * c}" y="${y * c}" width="${7 * c}" height="${7 * c}" fill="#16232A"/><rect x="${(x + 1) * c}" y="${(y + 1) * c}" width="${5 * c}" height="${5 * c}" fill="#fff"/><rect x="${(x + 2) * c}" y="${(y + 2) * c}" width="${3 * c}" height="${3 * c}" fill="#16232A"/>`;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if ((x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)) continue;
    if (r() > 0.52) out += `<rect x="${x * c}" y="${y * c}" width="${c}" height="${c}" fill="#16232A"/>`;
  }
  return `<svg class="qr" viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px" aria-label="QR code do ativo"><rect width="${size}" height="${size}" fill="#fff"/>${out}${finder(0, 0)}${finder(14, 0)}${finder(0, 14)}</svg>`;
}
function pageAtivos() {
  const f = UI.f.at;
  let list = scoped(DB.ativos);
  if (f.hotel) list = list.filter(a => a.hotel_id === f.hotel);
  if (f.cat) list = list.filter(a => a.categoria_id === f.cat);
  if (f.crit) list = list.filter(a => String(a.criticidade) === f.crit);
  if (f.q) { const q = f.q.toLowerCase(); list = list.filter(a => (a.id + " " + a.nome + " " + a.fabricante + " " + IDX.local[a.local_id].nome).toLowerCase().includes(q)); }
  const per = 25, pages = Math.max(1, Math.ceil(list.length / per)); f.page = Math.min(f.page, pages - 1);
  const rows = list.slice(f.page * per, f.page * per + per);
  const now = Date.now();
  const showHotel = scope().hoteis.length > 1;
  return `<div class="filters">
    <input type="search" placeholder="Buscar por código, nome ou fabricante" value="${esc(f.q)}" data-f="at.q" aria-label="Buscar ativos">
    ${showHotel ? `<select data-f="at.hotel" aria-label="Hotel"><option value="">Todos os hotéis</option>${hotelOptions(f.hotel)}</select>` : ""}
    <select data-f="at.cat" aria-label="Categoria"><option value="">Todas as categorias</option>${DB.categorias.map(c => `<option value="${c.id}" ${f.cat === c.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select>
    <select data-f="at.crit" aria-label="Criticidade"><option value="">Toda criticidade</option>${[5, 4, 3, 2, 1].map(c => `<option value="${c}" ${f.crit === String(c) ? "selected" : ""}>${c} · ${esc(critNome(c))}</option>`).join("")}</select>
  </div>
  <div class="panel"><div class="table-wrap"><table><thead><tr><th>Código</th><th>Ativo</th><th>Categoria</th>${showHotel ? "<th>Hotel</th>" : ""}<th>Local</th><th>Criticidade</th><th>Próxima preventiva</th><th class="num">Chamados em 90 dias</th></tr></thead>
  <tbody>${rows.map(a => {
    const prox = DB.os.filter(o => o.ativo_id === a.id && o.status === "Programada").sort((x, y) => t(x.programada_para) - t(y.programada_para))[0];
    const late = DB.os.some(o => o.ativo_id === a.id && o.status === "Atrasada");
    const nch = DB.chamados.filter(c => c.ativo_id === a.id && t(c.aberto_em) > now - 90 * D).length;
    return `<tr class="click" data-act="open-at" data-id="${a.id}"><td><span class="id">${a.id}</span></td><td>${esc(a.nome)}${a.status === "Parado" ? ' <span class="badge b-red">Parado</span>' : ""}<div class="small muted">${esc(a.fabricante)}${a.modelo ? ", " + esc(a.modelo) : ""}</div></td><td class="small">${esc(IDX.cat[a.categoria_id].nome)}</td>${showHotel ? `<td class="small">${esc(IDX.hotel[a.hotel_id].nome)}</td>` : ""}<td class="small">${esc(IDX.local[a.local_id].nome)}</td><td>${critBadge(a.criticidade)}</td><td class="small">${late ? '<span class="badge b-red">Atrasada</span>' : prox ? fmtD(prox.programada_para) : '<span class="muted">Sem plano</span>'}</td><td class="num">${nch}</td></tr>`;
  }).join("") || `<tr><td colspan="8" class="empty">Nenhum ativo com esses filtros.</td></tr>`}</tbody></table></div>
  <div class="pager" style="padding:10px 14px">${list.length} ativos<span class="row"><button class="btn sm" data-act="page" data-k="at" data-d="-1" ${f.page === 0 ? "disabled" : ""}>Anterior</button><span>Página ${f.page + 1} de ${pages}</span><button class="btn sm" data-act="page" data-k="at" data-d="1" ${f.page >= pages - 1 ? "disabled" : ""}>Próxima</button></span></div></div>`;
}
function drawerAtivo(a) {
  const par = DB.ativo_parada.filter(p => p.ativo_id === a.id).sort((x, y) => y.inicio.localeCompare(x.inicio));
  const hist = [
    ...DB.chamados.filter(c => c.ativo_id === a.id).map(c => ({ t: c.aberto_em, id: c.id, txt: c.titulo, st: c.status, act: "open-ch" })),
    ...DB.os.filter(o => o.ativo_id === a.id && o.status !== "Programada").map(o => ({ t: o.programada_para, id: o.id, txt: o.origem === "preventiva" ? "Preventiva" : "Corretiva", st: o.status, act: "open-os" })),
    ...par.map(p => ({ t: p.inicio, id: p.chamado_id, txt: `Parada${p.fim ? " de " + dur((t(p.fim) - t(p.inicio)) / H) : ", em andamento"}`, st: p.fim ? "Encerrado" : "Aberto", act: "open-ch" }))
  ].sort((x, y) => y.t.localeCompare(x.t)).slice(0, 12);
  const planos = DB.planos.filter(p => p.categoria_id === a.categoria_id);
  const d90 = Date.now() - 90 * D, indisp = par.reduce((s, p) => s + Math.max(0, (Math.min(Date.now(), p.fim ? t(p.fim) : Date.now()) - Math.max(d90, t(p.inicio))) / H), 0);
  const gar = a.garantia_ate && t(a.garantia_ate) > Date.now();
  const meds = DB.os.filter(o => o.ativo_id === a.id && o.status === "Concluída").flatMap(o => o.checklist.filter(c => c.tipo === "medicao" && c.valor != null).map(c => ({ ...c, t0: o.fim })));
  const foraMed = meds.filter(m => m.fora).length;
  return `<div class="drawer-h"><button class="close" data-act="close" aria-label="Fechar">×</button><span class="id">${a.id}</span><h2>${esc(a.nome)}</h2><div class="row"><span class="badge ${a.status === "Parado" ? "b-red" : "b-green"}">${a.status}</span>${critBadge(a.criticidade)}${(() => { const sc = iaGravado(a.id); return sc && ["csc", "band", "hotel"].includes(role()) ? `<a href="#/inteligencia?ativo=${a.id}" class="badge ${sc.score >= polGrupo().inteligencia.limite_atencao ? "b-amber" : "b-outline"}" style="text-decoration:none" title="Ver a atenção do ativo no HubKeep Intelligence">Atenção ${sc.score}/100</a>` : ""; })()}</div></div>
  <div class="drawer-b"><div class="row" style="align-items:flex-start;gap:18px"><div class="qr-card">${qrSvg(a.qr, 96)}</div><dl class="kv" style="flex:1">
    <dt>Etiqueta</dt><dd>${a.qr}</dd><dt>Categoria</dt><dd>${esc(IDX.cat[a.categoria_id].nome)}</dd><dt>Fabricante e modelo</dt><dd>${esc(a.fabricante)}${a.modelo ? ", " + esc(a.modelo) : ""}</dd>
    <dt>Número de série</dt><dd>${esc(a.numero_serie || "—")}</dd><dt>Garantia</dt><dd>${a.garantia_ate ? `<span class="badge ${gar ? "b-green" : "b-grey"}">${gar ? "Vigente" : "Vencida"}</span> ${gar ? "até" : "em"} ${fmtD(a.garantia_ate)}` : "—"}</dd>
    <dt>Hotel</dt><dd>${esc(IDX.hotel[a.hotel_id].nome)}</dd><dt>Local</dt><dd>${esc(IDX.local[a.local_id].nome)}</dd><dt>Compra e instalação</dt><dd>${fmtD(a.comprado_em)}, instalado em ${fmtD(a.instalado_em)}</dd>
    <dt>Planos</dt><dd>${planos.length ? planos.map(p => esc(p.nome)).join(", ") : "Nenhum"}</dd></dl></div>
  <div class="grid g-3 mini-kpis"><div><b>${dur(indisp).replace(" min", " min")}</b><span>parado em 90 dias</span></div><div><b>${DB.chamados.filter(c => c.ativo_id === a.id && t(c.aberto_em) > d90).length}</b><span>chamados em 90 dias</span></div><div><b>${meds.length ? foraMed : "—"}</b><span>medições fora da faixa</span></div></div>
  <h3>Documentos</h3><div class="docs">${(a.anexos || []).map(d => `<span class="doc">${icon("audit")}<span>${esc(d.nome)}<small>${esc(d.tipo)}${d.validade ? `, validade ${fmtD(d.validade)}` : ""}</small></span></span>`).join("") || '<span class="muted small">Nenhum documento anexado.</span>'}</div>
  <p class="small muted">O técnico lê a etiqueta no celular para ver esta ficha, abrir chamado ou executar a preventiva deste ativo.</p>
  <h3>Histórico do ativo</h3>
  <div class="table-wrap"><table><tbody>${hist.map(x => `<tr class="click" data-act="${x.act}" data-id="${x.id}"><td class="small">${fmtD(x.t)}</td><td><span class="id">${x.id}</span></td><td class="small">${esc(x.txt)}</td><td>${statusBadge(x.st)}</td></tr>`).join("") || `<tr><td class="empty">Sem histórico ainda.</td></tr>`}</tbody></table></div></div>`;
}

/* ---------- Implantação de ativos ---------- */
const IMP_EXEMPLO = () => {
  const h = "h6", loc = n => (DB.locais.find(l => l.hotel_id === h && l.nome === n) || {}).id;
  return [
    ["Elevador social 1", "c1", "Casa de máquinas", "Otis", "MA-03"], ["Elevador social 2", "c1", "Casa de máquinas", "Otis", "MA-03"], ["Elevador de serviço", "c1", "Casa de máquinas", "Atlas Schindler", "MA-03"],
    ["Chiller principal", "c2", "Cobertura", "Carrier", "MA-04"], ["Gerador de emergência", "c3", "Subsolo técnico", "Cummins", "MA-05"], ["Bomba de recalque 1", "c5", "Subsolo técnico", "KSB", "MA-06"],
    ["Bomba de recalque 2", "c5", "Casa de bombas", "KSB", "MA-06"], ["Câmara fria de carnes", "c8", "Cozinha", "Danfoss", "MA-07"], ["Câmara fria de laticínios", "c8", "Cozinha", "Danfoss", "MA-07"],
    ["Split do salão de eventos", "c7", "Salão de eventos", "Daikin", "MA-02"], ["Split da academia", "", "Academia", "LG", ""], ["Filtro da piscina", "c9", "Piscina", "Dancor", "MA-08"]
  ].map(([nome, cat, local, fab, mod], i) => ({ linha: i + 2, nome, cat, local, fab, mod, local_id: loc(local), erro: !cat ? "Categoria em branco" : !loc(local) ? `Local "${local}" não existe no PMS` : null }));
};
function pageImplantacao() {
  const s = scope(), imp = DB.implantacao.filter(x => s.hoteis.includes(x.hotel_id));
  const prev = imp.reduce((a, x) => a + x.previstos, 0), cad = imp.reduce((a, x) => a + x.cadastrados, 0), etq = imp.reduce((a, x) => a + x.etiquetados, 0);
  const completos = imp.filter(x => x.cadastrados >= x.previstos).length;
  const caps = DB.capturas_celular.filter(c => s.hoteis.includes(c.hotel_id));
  const U = UI.imp;
  const rows = imp.map(x => { const p = Math.min(100, Math.round(x.cadastrados / x.previstos * 100)), st = p >= 100 ? ["Completo", "b-green"] : p > 0 ? ["Em andamento", "b-amber"] : ["Não iniciado", "b-grey"];
    return `<tr><td>${esc(IDX.hotel[x.hotel_id].nome)}<div class="small muted">${x.onda}${IDX.hotel[x.hotel_id].piloto ? ": " + esc(IDX.hotel[x.hotel_id].piloto.toLowerCase()) : ""}</div></td><td><div class="slabar"><div class="trk"><b style="width:${p}%;background:${p >= 100 ? "var(--ok)" : p > 0 ? "var(--amber)" : "var(--dim)"}"></b></div><span>${p}%</span></div></td><td class="num">${x.cadastrados} de ${x.previstos}</td><td class="num">${x.etiquetados}</td><td><span class="badge ${st[1]}">${st[0]}</span></td><td>${x.cadastrados > x.etiquetados ? `<button class="btn sm" data-act="imp-print" data-id="${x.hotel_id}">Imprimir ${x.cadastrados - x.etiquetados} etiquetas</button>` : '<span class="small muted">Etiquetas em dia</span>'}</td></tr>`; }).join("");
  const exemplo = U && U.preview ? U.preview : null;
  const importPanel = exemplo ? `<div class="table-wrap"><table><thead><tr><th class="num">Linha</th><th>Ativo</th><th>Local</th><th>Modelo aplicado</th><th>Situação</th></tr></thead><tbody>${exemplo.map(r => `<tr><td class="num">${r.linha}</td><td>${esc(r.nome)}<div class="small muted">${esc(r.fab)}</div></td><td class="small">${esc(r.local)}</td><td class="small">${r.mod ? esc(IDX.modelo[r.mod].nome) : "—"}</td><td>${r.erro ? `<span class="badge b-red">${esc(r.erro)}</span>` : '<span class="badge b-green">Pronto</span>'}</td></tr>`).join("")}</tbody></table></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="imp-import">Importar ${exemplo.filter(r => !r.erro).length} ativos válidos</button><span class="small muted">As ${exemplo.filter(r => r.erro).length} linhas com erro ficam para correção, sem travar o restante.</span></div>`
    : `<p class="small" style="margin-top:0">Envie a planilha de inventário do hotel. A Central valida cada linha contra os locais do PMS e aplica o modelo de ativo, que já traz plano preventivo e checklist.</p>
      ${U && U.done ? `<div class="readonly-note ok">${icon("os")}<span>${U.done}</span></div>` : ""}
      <button class="btn primary" data-act="imp-load">Carregar planilha de exemplo (Hotel Joinville)</button>`;
  return `<div class="grid g-4" style="margin-bottom:16px">
    <div class="panel inst"><div class="lab">Hotéis com inventário completo</div><div class="val">${completos}<small>de ${imp.length}</small></div><div class="foot">Os 4 hotéis do piloto entram completos, começando pelos ativos críticos.</div></div>
    <div class="panel inst"><div class="lab">Ativos cadastrados</div><div class="val">${cad}<small>de ${prev}</small></div><div class="foot">${Math.round(cad / Math.max(1, prev) * 100)}% do inventário previsto.</div></div>
    <div class="panel inst"><div class="lab">Etiquetas QR impressas</div><div class="val">${etq}</div><div class="foot">${cad - etq} ativos aguardando etiqueta.</div></div>
    <div class="panel inst"><div class="lab">Cadastros do celular</div><div class="val">${caps.length}</div><div class="foot">Aguardando revisão do CSC.</div></div>
  </div>
  <div class="grid g-3-1" style="align-items:start">
    <div class="panel"><div class="panel-h"><h2>Inventário por hotel</h2><span class="hint">O rollout avança em ondas; cada hotel começa pelos ativos críticos.</span></div><div class="panel-b table-wrap"><table><thead><tr><th>Hotel</th><th>Progresso</th><th class="num">Cadastrados</th><th class="num">Etiquetados</th><th>Situação</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>
    <div class="panel"><div class="panel-h"><h2>Cadastrados pelo celular</h2><span class="hint">O técnico fotografa o equipamento e a placa</span></div><div class="panel-b" style="padding-top:0">
      ${caps.map(c => `<div class="cap"><div class="photos">${Array.from({ length: c.foto }, (_, i) => `<div class="photo" style="width:64px;height:52px">${i === 0 ? "Placa" : "Foto " + (i + 1)}</div>`).join("")}</div>
        <div><strong>${esc(IDX.cat[c.categoria_id].nome)}</strong><div class="small muted">${esc(IDX.hotel[c.hotel_id].nome)}, ${esc(c.local)}. ${esc(c.fabricante)}${c.modelo ? " " + esc(c.modelo) : ", modelo a confirmar"}</div></div>
        ${canEdit() ? `<button class="btn sm primary" data-act="imp-approve" data-id="${c.id}">Aprovar cadastro</button>` : ""}</div>`).join("") || '<div class="empty">Nenhum cadastro aguardando revisão.</div>'}
    </div></div>
  </div>
  <div class="grid g-2" style="margin-top:16px;align-items:start">
    <div class="panel"><div class="panel-h"><h2>Importar planilha</h2></div><div class="panel-b">${importPanel}</div></div>
    <div class="panel"><div class="panel-h"><h2>Modelos de ativo</h2><span class="hint">Um modelo traz plano preventivo e checklist prontos</span></div><div class="panel-b table-wrap"><table><thead><tr><th>Modelo</th><th>Plano aplicado</th><th class="num">Itens</th></tr></thead><tbody>
      ${DB.modelos_ativo.map(m => { const pl = IDX.plano[m.plano_id]; return `<tr><td>${esc(m.nome)}<div class="small muted">${esc(IDX.cat[m.categoria_id].nome)}, ${esc(m.fabricante)}</div></td><td class="small">${esc(pl.nome)}, a cada ${pl.periodicidade_dias} dias</td><td class="num">${pl.checklist.length}</td></tr>`; }).join("")}
    </tbody></table></div></div>
  </div>
  ${role() === "csc" ? pacotesHtml() : ""}`;
}
const PASSOS = [["licenca", "Ativar o hotel com licença", "Admin do grupo"], ["pacote", "Aplicar o pacote da bandeira", "Modelos, checklists e planos copiados"], ["locais", "Ler UHs e áreas do PMS", "Conector do sistema hoteleiro"], ["usuarios", "Convidar usuários e papéis", "Implantador, com validade"], ["ativos", "Carregar os ativos críticos", "Planilha ou celular"], ["etiquetas", "Imprimir e colar as etiquetas", "QR em lote"]];
function pacotesHtml() {
  const card = ab => {
    const pk = DB.pacotes.find(p => p.bandeira_id === ab.bandeira_id), b = IDX.band[ab.bandeira_id];
    const feitos = PASSOS.filter(p => ab.passos[p[0]]).length;
    return `<div class="panel" style="padding:16px 18px"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><strong style="font-size:16px">${esc(ab.nome)}</strong><div class="small muted">${esc(ab.cidade)}/${ab.uf}, ${ab.uhs} UHs, ${esc(b.nome)}, ${esc(ab.modelo.toLowerCase())}. Abertura: ${esc(ab.previsao)}.</div></div><span class="badge ${feitos === PASSOS.length ? "b-green" : feitos ? "b-amber" : "b-grey"}">${feitos} de ${PASSOS.length}</span></div>
      <ol class="steps">${PASSOS.map(([k, l, d]) => `<li class="${ab.passos[k] ? "done" : ""}"><span>${esc(l)}<small>${ab.passos[k] ? "Feito em " + fmtDT(ab.passos[k]) : esc(d)}</small></span></li>`).join("")}</ol>
      ${!ab.passos.pacote ? `<button class="btn primary" data-act="pkg-apply" data-id="${ab.id}" ${ab.passos.licenca ? "" : "disabled title='Ative o hotel com licença antes'"}>Aplicar pacote ${esc(b.nome)} ${esc(pk.versao)}</button>` : `<div class="readonly-note ok">${icon("os")}<span>Pacote ${esc(pk.versao)} aplicado: ${pk.modelos.length} modelos de ativo, ${pk.planos.length} planos preventivos e ${pk.planos.reduce((a, id) => a + IDX.plano[id].checklist.length, 0)} itens de checklist. Falta só o levantamento dos ativos.</span></div>`}</div>`;
  };
  return `<div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Pacote da bandeira e hotel novo em 1 dia</h2><span class="hint">Meta do piloto: hotel novo implantado em até 1 dia a partir do pacote, sem contar o levantamento de ativos</span></div>
  <div class="panel-b"><div class="grid g-2" style="align-items:start">${DB.aberturas.map(card).join("")}</div>
  <div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>Pacote</th><th>Versão</th><th class="num">Modelos de ativo</th><th class="num">Planos preventivos</th><th class="num">Itens de checklist</th><th>Atualizado</th></tr></thead><tbody>
  ${DB.pacotes.map(p => `<tr><td>${esc(IDX.band[p.bandeira_id].nome)}</td><td><span class="id" style="font-size:13px">${esc(p.versao)}</span></td><td class="num">${p.modelos.length}</td><td class="num">${p.planos.length}</td><td class="num">${p.planos.reduce((a, id) => a + IDX.plano[id].checklist.length, 0)}</td><td class="small">${fmtD(p.atualizado_em)}</td></tr>`).join("")}</tbody></table></div></div></div>`;
}
function novoAtivo(hid, lid, cat, nome, fab, modelo) {
  const n = Math.max(...DB.ativos.map(x => +x.id.split("-")[1])) + 1, h = IDX.hotel[hid];
  const a = { id: "AT-" + String(n).padStart(4, "0"), hotel_id: hid, local_id: lid, categoria_id: cat, nome, fabricante: fab, modelo, numero_serie: cat.toUpperCase() + String(100000 + n * 7), garantia_ate: new Date(Date.now() + 730 * D).toISOString(), anexos: [], criticidade: IDX.cat[cat].critica ? 4 : 3, comprado_em: new Date(Date.now() - 30 * D).toISOString(), instalado_em: new Date().toISOString(), qr: "EGV-" + h.cod_totvs + "-" + String(n).padStart(4, "0"), status: "Operando" };
  DB.ativos.push(a); IDX.ativo[a.id] = a;
  const im = DB.implantacao.find(x => x.hotel_id === hid); if (im) im.cadastrados++;
  return a;
}

/* ---------- Hotéis ---------- */
const MATRIZ_MODELOS = [
  ["Próprio", "Total, a central despacha", "Alçadas internas", "P&L do grupo", "Não há", "Despacho, SLA, preventiva", "Sim"],
  ["Administrado", "Operação do grupo, ativo do proprietário", "Alçadas e aprovação do proprietário acima de limite", "P&L do hotel, com rateio da central", "Proprietário vê só o seu ativo, sem editar", "Igual ao próprio, com prestação de contas", "Sim; aprovação do proprietário na fase 2"],
  ["Arrendado", "Operação do grupo, imóvel do locador", "Conforme o contrato", "Arrendatária ou locador, por categoria", "Locador vê o que é dele", "Despacho e matriz de responsabilidade", "Sim, versão mínima"],
  ["Afiliado", "Do hoteleiro", "Não se aplica", "O hoteleiro", "Não há", "Auditoria de padrão e conformidade", "Depois do MVP"]
];
const modeloBadge = m => `<span class="badge ${m === "Próprio" ? "b-outline" : m === "Administrado" ? "b-blue" : m === "Arrendado" ? "b-amber" : "b-grey"}">${esc(m)}</span>`;
function pageHoteis() {
  const s = scope(), chs = scoped(DB.chamados), ed = role() === "csc";
  const bands = DB.bandeiras.filter(b => DB.hoteis.some(h => h.bandeira_id === b.id && s.hoteis.includes(h.id)));
  const nAt = hid => DB.ativos.filter(a => a.hotel_id === hid).length;
  const arr = DB.hoteis.filter(h => h.modelo === "Arrendado" && s.hoteis.includes(h.id));
  const resp = (hid, cat) => (DB.responsabilidade.find(r => r.hotel_id === hid && r.categoria_id === cat) || {}).responsavel;
  return `<div class="grid g-3-1">
  <div class="panel"><div class="panel-h"><h2>${esc(DB.tenant.nome)}</h2><span class="hint">Grupo, bandeiras e hotéis, com o modelo contratual de cada um. Hotéis e UHs vêm do PMS.</span></div><div class="panel-b">
  <ul class="tree"><li><div class="node"><strong>${esc(DB.tenant.nome)}</strong><span class="muted small">${s.hoteis.length} hotéis visíveis</span></div><ul>
  ${bands.map(b => `<li><div class="node"><strong>${esc(b.nome)}</strong>${b.condo ? '<span class="badge b-blue">condo-hotel</span>' : ""}</div><ul>
    ${DB.hoteis.filter(h => h.bandeira_id === b.id && s.hoteis.includes(h.id)).map(h => {
      const ab = chs.filter(c => c.hotel_id === h.id && OPEN.includes(c.status)).length;
      return `<li><div class="node"><a href="#" data-act="goto-hotel" data-id="${h.id}">${esc(h.nome)}</a>${modeloBadge(h.modelo)}${h.piloto ? `<span class="badge b-green" title="${esc(h.piloto)}">Piloto</span>` : ""}<span class="small muted">${h.cidade}/${h.uf}, ${h.uhs} UHs, ${nAt(h.id)} ativos, ${ab} chamados abertos</span><span class="badge b-outline">${h.cod_totvs}</span></div></li>`;
    }).join("")}</ul></li>`).join("")}
  </ul></li></ul></div></div>
  <div><div class="panel"><div class="panel-h"><h2>Piloto</h2><span class="hint">4 hotéis que cobrem a matriz</span></div><div class="panel-b" style="padding-top:0"><table><tbody>
    ${DB.hoteis.filter(h => h.piloto).map(h => `<tr><td>${esc(h.nome)}<div class="small muted">${esc(h.piloto)}</div></td><td>${modeloBadge(h.modelo)}</td></tr>`).join("")}</tbody></table></div></div>
  <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Proprietários e locadores</h2></div><div class="panel-b">
  <p class="small" style="margin-top:0">No administrado, o proprietário vê só as próprias UHs. No arrendado, o locador vê o que o contrato põe sob a responsabilidade dele. Os dois só leem.</p>
  <table><tbody>${DB.proprietarios.map(p => { const n = DB.localProprietario.filter(x => x.proprietario_id === p.id && s.hoteis.includes(IDX.local[x.local_id].hotel_id)).length; return n ? `<tr><td>${esc(p.nome)}</td><td class="num small">${n} UHs</td></tr>` : ""; }).join("")}
  ${DB.usuarios.filter(u => u.papel === "Locador" && s.hoteis.includes(u.escopo.id)).map(u => `<tr><td>${esc(u.nome)} <span class="badge b-amber">Locador</span></td><td class="num small">${esc(IDX.hotel[u.escopo.id].nome.replace(/^Hotel /, ""))}</td></tr>`).join("")}</tbody></table></div></div></div></div>
  <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Matriz de modelos de empreendimento</h2><span class="hint">O modelo contratual define quem manda, quem aprova e quem paga</span></div><div class="panel-b table-wrap"><table><thead><tr><th>Modelo</th><th>Controle operacional</th><th>Aprovação de gastos</th><th>Quem paga</th><th>Visão de terceiros</th><th>Papel da central</th><th>No MVP</th></tr></thead><tbody>
  ${MATRIZ_MODELOS.map(r => `<tr><td>${modeloBadge(r[0])}</td>${r.slice(1).map((x, i) => `<td class="small">${i === 5 ? `<span class="badge ${x === "Sim" ? "b-green" : x.startsWith("Sim") ? "b-blue" : "b-grey"}">${esc(x)}</span>` : esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>
  ${arr.length ? `<div class="panel" style="margin-top:16px" id="matriz-resp"><div class="panel-h"><h2>Matriz de responsabilidade dos arrendados</h2><span class="hint">Por hotel e categoria: quem responde pelo custo. A OS já nasce marcada, e o locador é notificado com data registrada.</span></div><div class="panel-b table-wrap"><table class="sla-grid"><thead><tr><th>Categoria</th>${arr.map(h => `<th>${esc(h.nome.replace(/^Hotel /, ""))}</th>`).join("")}</tr></thead><tbody>
    ${DB.categorias.map(c => `<tr><td>${esc(c.nome)}</td>${arr.map(h => { const v = resp(h.id, c.id); return `<td>${ed ? `<select data-act="resp" data-h="${h.id}" data-cat="${c.id}" aria-label="Responsável por ${esc(c.nome)} em ${esc(h.nome)}"><option ${v === "Arrendatária" ? "selected" : ""}>Arrendatária</option><option ${v === "Locador" ? "selected" : ""}>Locador</option></select>` : `<span class="badge ${v === "Locador" ? "b-blue" : "b-grey"}">${esc(v || "—")}</span>`}</td>`; }).join("")}</tr>`).join("")}
  </tbody></table></div></div>` : ""}`;
}

/* ---------- Fornecedores ---------- */
function pageFornecedores() {
  const s = scope(), d90 = Date.now() - 90 * D, chs = scoped(DB.chamados).filter(c => t(c.aberto_em) > d90);
  const ed = ["csc", "band"].includes(role());
  return `<div class="filters"><p class="small muted" style="margin:0;max-width:80ch">Cadastro mínimo, no lugar do nome em texto livre. Quem executou entra na OS e no aceite, e alimenta custos e indicadores. O portal do fornecedor fica para a fase 2.</p><div style="flex:1"></div>${ed ? `<button class="btn primary" data-act="forn-novo">Cadastrar fornecedor</button>` : ""}</div>
  <div class="panel"><div class="table-wrap"><table><thead><tr><th>Fornecedor</th><th>CNPJ</th><th>Contato</th><th>Categorias</th><th class="num">Serviços em 90 dias</th><th class="num">Custo informado</th></tr></thead><tbody>
  ${DB.fornecedores.map(f => { const cs = chs.filter(c => c.executado_por && c.executado_por.fornecedor_id === f.id); const custo = cs.reduce((a, c) => a + (c.custo || 0), 0);
    return `<tr><td><strong>${esc(f.nome)}</strong></td><td class="small"><span class="id" style="font-size:13px">${esc(f.cnpj)}</span></td><td class="small">${esc(f.telefone)}<div class="muted">${esc(f.email)}</div></td><td class="small">${f.categorias.map(c => esc(IDX.cat[c].nome)).join(", ") || "—"}</td><td class="num">${cs.length}</td><td class="num">${custo ? brl(custo) : "—"}</td></tr>`; }).join("")}
  </tbody></table></div></div>`;
}
function modalFornecedor() {
  return `<div class="modal-bg" data-act="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="fo-t"><div class="modal-h" id="fo-t">Cadastrar fornecedor</div><div class="modal-b">
    <div class="field"><label for="fo-nome">Nome</label><input id="fo-nome" placeholder="Razão social ou nome fantasia"></div>
    <div class="two"><div class="field"><label for="fo-cnpj">CNPJ</label><input id="fo-cnpj" placeholder="00.000.000/0000-00" inputmode="numeric"></div><div class="field"><label for="fo-tel">Telefone</label><input id="fo-tel" placeholder="(00) 0000-0000"></div></div>
    <div class="field"><label for="fo-mail">E-mail</label><input id="fo-mail" type="email" placeholder="contato@fornecedor.com.br"></div>
    <div class="field"><label for="fo-cat">Categoria principal</label><select id="fo-cat">${DB.categorias.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join("")}</select></div>
  </div><div class="modal-f"><button class="btn" data-act="modal-close">Cancelar</button><button class="btn primary" data-act="forn-save">Cadastrar</button></div></div></div>`;
}

/* ---------- Políticas ---------- */
function pagePoliticas() {
  const ed = role() === "csc";
  const pg = DB.politicas.find(p => p.escopo_tipo === "grupo");
  const polOf = (tipo, id) => DB.politicas.find(p => p.escopo_tipo === tipo && p.escopo_id === id);
  const s = scope();
  const cell = (tipo, id, pr, inherited) => {
    const p = polOf(tipo, id); const own = p && p.sla[pr];
    return `<td class="num">${ed ? `<input type="number" min="0.5" step="0.5" value="${own || ""}" placeholder="${inherited}" class="${own ? "" : "inherit"}" data-act="sla" data-tipo="${tipo}" data-id="${id}" data-pr="${pr}" aria-label="SLA ${pr}">` : own ? `<span class="eff">${own} h</span>` : `<span class="muted">${inherited} h</span>`}</td>`;
  };
  const rows = [];
  rows.push(`<tr class="grp"><td><strong>Grupo</strong><div class="src">${esc(DB.tenant.nome)}</div></td>${PRIOS.map(pr => `<td class="num">${ed ? `<input type="number" min="0.5" step="0.5" value="${pg.sla[pr]}" data-act="sla" data-tipo="grupo" data-id="t1" data-pr="${pr}" aria-label="SLA ${pr} do grupo">` : `<span class="eff">${pg.sla[pr]} h</span>`}</td>`).join("")}</tr>`);
  DB.bandeiras.filter(b => DB.hoteis.some(h => h.bandeira_id === b.id && s.hoteis.includes(h.id))).forEach(b => {
    rows.push(`<tr><td style="padding-left:20px"><strong>${esc(b.nome)}</strong><div class="src">bandeira</div></td>${PRIOS.map(pr => cell("bandeira", b.id, pr, pg.sla[pr])).join("")}</tr>`);
    DB.hoteis.filter(h => h.bandeira_id === b.id && s.hoteis.includes(h.id)).forEach(h => {
      rows.push(`<tr><td style="padding-left:40px">${esc(h.nome)}<div class="src">hotel</div></td>${PRIOS.map(pr => { const e = slaEfetivo(h.id, pr); const pb = polOf("bandeira", b.id); const inh = (pb && pb.sla[pr]) || pg.sla[pr]; return cell("hotel", h.id, pr, inh); }).join("")}</tr>`);
    });
  });
  return `<div class="panel"><div class="panel-h"><h2>Prazo de atendimento por prioridade</h2><span class="hint">Horas até concluir o serviço. A regra mais específica vence: hotel, depois bandeira, depois grupo.</span></div>
  <div class="panel-b">
  ${ed ? `<div class="readonly-note">${icon("pol")}<span>Campos em cinza mostram o valor herdado. Preencha para criar uma exceção; apague para voltar a herdar. Novos chamados já usam o valor alterado, e a mudança fica na auditoria.</span></div>` : `<div class="readonly-note">Somente o Admin do grupo altera políticas. Você vê as regras que valem para o seu escopo.</div>`}
  <div class="table-wrap"><table class="sla-grid"><thead><tr><th>Escopo</th>${PRIOS.map(p => `<th class="num">${p}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>
  <h3>Prioridade padrão e relógio por categoria</h3>
  <p class="small muted" style="margin-top:0">Quem abre o chamado não precisa escolher a prioridade. Ela vem da categoria, e o CSC ajusta na triagem se precisar. O relógio define se o prazo corre 24 horas por dia ou só no expediente do hotel: elevador parado conta sempre; pintura conta em horário comercial.</p>
  <div class="table-wrap"><table class="sla-grid"><thead><tr><th>Categoria</th><th>Prioridade padrão</th><th class="num">Prazo no grupo</th><th>Relógio do SLA</th></tr></thead><tbody>
  ${DB.categorias.map(cat => { const pp = pg.prio_padrao[cat.id] || "Média", com = calComercial(cat.id); return `<tr><td>${esc(cat.nome)}${cat.critica ? ' <span class="badge b-outline">crítico</span>' : ""}</td><td>${ed ? `<select data-act="prio-pad" data-cat="${cat.id}" aria-label="Prioridade padrão de ${esc(cat.nome)}">${PRIOS.map(p => `<option ${p === pp ? "selected" : ""}>${p}</option>`).join("")}</select>` : prio(pp)}</td><td class="num">${pg.sla[pp]} h</td><td>${ed ? `<select data-act="relogio" data-cat="${cat.id}" aria-label="Relógio de ${esc(cat.nome)}"><option value="24" ${com ? "" : "selected"}>24 horas, 7 dias</option><option value="com" ${com ? "selected" : ""}>Horário comercial</option></select>` : com ? "Horário comercial" : "24 horas, 7 dias"}</td></tr>`; }).join("")}
  </tbody></table></div>
  <h3>Outras regras</h3><dl class="kv">
    <dt>Expediente</dt><dd>${esc(pg.expediente)}, no fuso de cada hotel</dd>
    <dt>Feriados</dt><dd>${esc(pg.feriados)}</dd>
    <dt>Escalonamento</dt><dd>Alerta de prazo perto de vencer e aviso à central ao atingir ${pg.escalonar_em}% do prazo; Hotel São Paulo Paulista usa 70%</dd>
    <dt>Aceite</dt><dd>Encerra com aceite e assinatura. Quem executou não aceita o próprio serviço; sem outro gerente no hotel, decide o Gestor CSC ou o Admin do grupo</dd>
    <dt>Códigos de manutenção</dt><dd>${ed ? `<label class="inline-check" style="margin:0"><input type="checkbox" data-act="cod-obrig" ${pg.codigos_obrigatorios ? "checked" : ""}> Exigir falha, causa e solução no aceite</label>` : pg.codigos_obrigatorios ? "Obrigatórios no aceite" : "Opcionais no aceite"} <span class="muted small">(padrão: desligado)</span></dd>
    <dt>Criticidade do ativo</dt><dd>${[5, 4, 3, 2, 1].map(n => critBadge(n)).join(" ")} <span class="muted small">escala fixa de 1 a 5, nomes configuráveis</span></dd>
  </dl>
  </div></div>`;
}
function setSla(tipo, id, pr, val) {
  let p = DB.politicas.find(x => x.escopo_tipo === tipo && x.escopo_id === id);
  const v = parseFloat(val);
  if (!p) { p = { id: "po" + (DB.politicas.length + 10), escopo_tipo: tipo, escopo_id: id, sla: {}, horario: null, escalonar_em: null }; DB.politicas.push(p); }
  const antes = p.sla[pr];
  if (!v || v <= 0) { if (tipo === "grupo") { toast("O grupo precisa ter um prazo para cada prioridade"); render(); return; } delete p.sla[pr]; }
  else p.sla[pr] = v;
  const nome = tipo === "grupo" ? "grupo" : tipo === "bandeira" ? IDX.band[id].nome : IDX.hotel[id].nome;
  DB.auditoria.unshift({ t: new Date().toISOString(), usuario: persona().nome, entidade: "Política", registro: p.id, hotel_id: tipo === "hotel" ? id : null, acao: `SLA ${pr} em ${nome}: ${antes ? antes + " h" : "herdado"} para ${p.sla[pr] ? p.sla[pr] + " h" : "herdado"}` });
  save(); toast(`Prazo de ${pr.toLowerCase()} em ${nome} atualizado`); render();
}

/* ---------- Integração ---------- */
function pageIntegracao() {
  const ig = DB.integracao;
  const uhs = DB.locais.filter(l => l.tipo === "uh").length;
  const fichas = (ig.fichas || []).map(f => ({ ...f, idade: (Date.now() - t(f.ultimo_contato)) / 60e3 }));
  const stale = ig.views.filter(v => v.status !== "ok").length + fichas.filter(f => f.idade > f.limite_min).length;
  return `<div class="readonly-note" style="margin-top:0">${icon("integ")}<span><strong>Somente leitura.</strong> O HubKeep lê views criadas pelo cliente no PMS, com um usuário restrito a elas, e grava uma cópia em área própria. O produto funciona sem integração: o sistema hoteleiro só acrescenta contexto. Escrever no PMS só entra com mecanismo homologado pelo fornecedor do PMS, por escrito.</span></div>
  <div class="grid g-4" style="margin:14px 0 18px">
    <div class="panel kpi good"><div class="v">${DB.hoteis.length}</div><div class="l">Hotéis mapeados</div><div class="d">Código PMS ligado ao hotel na Central</div></div>
    <div class="panel kpi good"><div class="v">${uhs.toLocaleString("pt-BR")}</div><div class="l">UHs mapeadas</div><div class="d">Sem recadastro manual</div></div>
    <div class="panel kpi"><div class="v">${rel(ig.views[2].ultima).replace("há ", "")}</div><div class="l">Idade do status das UHs</div><div class="d">Atraso máximo monitorado: 5 minutos</div></div>
    <div class="panel kpi ${stale ? "warn" : "good"}"><div class="v">${stale}</div><div class="l">Fontes com dado desatualizado</div><div class="d">A Central segue com o último dado e avisa na tela</div></div>
  </div>
  <div class="panel"><div class="panel-h"><h2>Views lidas</h2><span class="hint">${esc(ig.conexao)}</span><div class="spacer"></div>${proximaLeitura(ig.views)}</div>
  <div class="panel-b table-wrap"><table><thead><tr><th>View</th><th>Conteúdo</th><th>Frequência</th><th>Última leitura</th><th class="num">Linhas</th><th>Situação</th></tr></thead><tbody>
  ${ig.views.map(v => `<tr><td><span class="id">${v.nome}</span></td><td class="small">${esc(v.conteudo)}</td><td class="small">${v.frequencia}</td><td class="small">${fmtDT(v.ultima)} <span class="muted">(${rel(v.ultima)})</span></td><td class="num">${v.linhas.toLocaleString("pt-BR")}</td><td>${v.status === "ok" ? '<span class="badge b-green">Em dia</span>' : '<span class="badge b-amber">Atrasada</span>'}</td></tr>`).join("")}
  </tbody></table></div></div>
  <div class="panel" style="margin-top:18px"><div class="panel-h"><h2>Ficha de conexão por hotel</h2><span class="hint">Agente instalado na rede do cliente, com saída só por HTTPS. Painel de saúde do conector.</span></div>
  <div class="panel-b table-wrap"><table><thead><tr><th>Hotel</th><th>Código PMS</th><th>Agente</th><th>Último contato</th><th class="num">Limite</th><th>Situação</th></tr></thead><tbody>
  ${fichas.filter(f => scope().hoteis.includes(f.hotel_id)).map(f => `<tr><td>${esc(IDX.hotel[f.hotel_id].nome)}</td><td class="small"><span class="id" style="font-size:13px">${IDX.hotel[f.hotel_id].cod_totvs}</span></td><td class="small">${esc(f.agente)}</td><td class="small" data-rel="${f.ultimo_contato}">${rel(f.ultimo_contato)}</td><td class="num small">${f.limite_min} min</td><td>${f.idade > f.limite_min ? '<span class="badge b-amber">Dado desatualizado</span>' : '<span class="badge b-green">Em dia</span>'}</td></tr>`).join("")}
  </tbody></table><p class="small muted">O PMS usado pelo cliente está a confirmar: se for instalado, vale o agente; se for em nuvem, a leitura passa a ser pela API do fornecedor do PMS.</p></div></div>
  <div class="grid g-2" style="margin-top:18px">
  <div class="panel"><div class="panel-h"><h2>Últimas execuções</h2></div><div class="panel-b table-wrap"><table><tbody>${ig.execucoes.map(e => `<tr style="white-space:nowrap"><td class="small">${fmtDT(e.t)}</td><td class="small"><span class="id" style="font-size:13px">${e.view}</span></td><td class="small num">${e.linhas} linhas</td><td class="small num">${e.duracao_s} s</td><td class="small">${e.resultado === "Sucesso" ? '<span class="badge b-green">Sucesso</span>' : `<span class="badge b-red">Falha</span> ${esc(e.resultado.replace("Falha: ", ""))}`}</td></tr>`).join("")}</tbody></table></div></div>
  <div class="panel"><div class="panel-h"><h2>O que a Central faz e não faz</h2></div><div class="panel-b">
    <table><thead><tr><th>Operação</th><th>Situação</th></tr></thead><tbody>
    <tr><td>Ler hotéis, UHs e proprietários</td><td><span class="badge b-green">Ativo</span></td></tr>
    <tr><td>Ler status de ocupação e bloqueios de UH</td><td><span class="badge b-green">Ativo</span></td></tr>
    <tr><td>Registrar o período de UH indisponível e os UH-dias perdidos</td><td><span class="badge b-green">Ativo</span></td></tr>
    <tr><td>Avisar quando há OS com impacto na UH e ela não está bloqueada</td><td><span class="badge b-blue">Primeira entrega pós-MVP</span></td></tr>
    <tr><td>Bloquear ou liberar UH direto no PMS</td><td><span class="badge b-grey">Desligado até homologação</span></td></tr>
    <tr><td>Gravar em tabelas do PMS</td><td><span class="badge b-red">Não permitido</span></td></tr>
    </tbody></table></div></div></div>`;
}

/* A leitura do PMS segue a frequência de cada view; a Central não força leitura.
   A próxima é a mais cedo entre as views que ainda não passaram do horário (a
   atrasada já aparece como "Atrasada" na tabela). */
const FREQ_MIN = f => /diária/i.test(f) ? 1440 : +((/(\d+)\s*min/.exec(f) || [])[1] || 0);
function proximaLeitura(views) {
  const agora = Date.now();
  const faltam = views.map(v => t(v.ultima) + FREQ_MIN(v.frequencia) * 60e3 - agora).filter(ms => ms > 0);
  if (!faltam.length) return "";
  return `<span class="hint">Próxima leitura em ${Math.max(1, Math.ceil(Math.min(...faltam) / 60e3))} min</span>`;
}

/* ---------- Usuários ---------- */
function escopoTxt(e) {
  if (e.tipo === "grupo") return "Grupo inteiro";
  if (e.tipo === "bandeira") return IDX.band[e.id].nome;
  if (e.tipo === "hotel") return IDX.hotel[e.id].nome;
  if (e.tipo === "locador") return IDX.hotel[e.id].nome + " (categorias do locador)";
  return DB.localProprietario.filter(x => x.proprietario_id === e.id).length + " UHs próprias";
}
function pageUsuarios() {
  const us = DB.usuarios;
  const demo = ["u1", "u2", "u3", "u4", "u5", "u90"];
  const PAPEIS = [["Admin do grupo", "Grupo", "Ativa hotéis (consome licença), bandeiras, usuários e papéis, políticas; único que desativa membros"], ["Gestor CSC", "Grupo ou bandeira", "Triagem, despacho, acompanhamento e indicadores; decide o aceite quando não há outro gerente"], ["Implantador", "Hotel, com validade obrigatória", "Cadastra locais, ativos, QR e usuários abaixo dele; não ativa hotel nem libera licença"], ["Gerente do hotel", "Hotel", "Operação do hotel, triagem, aceite e reabertura"], ["Técnico", "Hotel", "Executa a OS no app, inclusive sem rede"], ["Solicitante", "Hotel", "Abre chamados e aceita o serviço do chamado que abriu"], ["Proprietário ou locador", "UHs próprias ou hotel inteiro", "Somente leitura do que é dele: chamados, OS, ativos, anexos dos seus locais, histórico"]];
  return `<div class="panel"><div class="panel-h"><h2>Perfis para a demonstração</h2><span class="hint">Troque o perfil para ver o mesmo sistema com outro escopo de dados.</span></div><div class="panel-b table-wrap"><table><thead><tr><th>Pessoa</th><th>Papel</th><th>Escopo</th><th></th></tr></thead><tbody>
  ${demo.map(id => { const u = IDX.user[id]; return `<tr><td><span class="row"><span class="avatar">${initials(u.nome)}</span>${esc(u.nome)}</span></td><td>${esc(u.papel)}</td><td>${esc(escopoTxt(u.escopo))}</td><td><button class="btn sm" data-act="as" data-id="${id}" ${id === UI.persona ? "disabled" : ""}>${id === UI.persona ? "Perfil atual" : "Ver como"}</button></td></tr>`; }).join("")}
  </tbody></table>
  <h3>Papéis do produto</h3>
  <div class="table-wrap"><table><thead><tr><th>Papel</th><th>Escopo</th><th>O que faz</th></tr></thead><tbody>${PAPEIS.map(p => `<tr><td><strong>${esc(p[0])}</strong></td><td class="small">${esc(p[1])}</td><td class="small">${esc(p[2])}</td></tr>`).join("")}</tbody></table></div>
  <p class="small muted">Valem para todos: quem executa o serviço não aceita o próprio serviço; o proprietário não lê políticas, anexos do hotel nem movimentações de ativos no MVP.</p>
  <h3>Como o isolamento funciona</h3>
  <p class="small" style="max-width:76ch">Cada acesso é concedido a um escopo: grupo, bandeira, hotel ou UHs de um proprietário. O banco de dados filtra cada consulta pelo escopo de quem pergunta, com segurança por linha (RLS). Um erro de tela não expõe dados de outro hotel. Mais de 500 testes de isolamento e de regras quebram a integração contínua se alguém furar uma regra.</p></div></div>
  <div class="panel" style="margin-top:18px"><div class="panel-h"><h2>Todos os usuários</h2><span class="hint">${us.length} pessoas</span></div><div class="panel-b table-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Escopo</th></tr></thead><tbody>
  ${us.map(u => `<tr><td>${esc(u.nome)}</td><td class="small muted">${esc(u.email)}</td><td class="small">${esc(u.papel)}</td><td class="small">${esc(escopoTxt(u.escopo))}${u.valido_ate ? ` <span class="badge b-amber">até ${fmtD(u.valido_ate)}</span>` : ""}</td></tr>`).join("")}</tbody></table></div></div>`;
}

/* ---------- Auditoria ---------- */
function auditoriaFiltrada() {
  const s = scope(), f = UI.f.au;
  let list = DB.auditoria.filter(a => audVisivel(a, s));
  if (isOwner()) list = list.filter(a => a.entidade === "Chamado" && IDX.ch[a.registro] && scoped([IDX.ch[a.registro]]).length);
  if (f.ent) list = list.filter(a => a.entidade === f.ent);
  if (f.hotel) list = list.filter(a => a.hotel_id === f.hotel);
  if (f.q) { const q = f.q.toLowerCase(); list = list.filter(a => (a.usuario + " " + a.registro + " " + a.acao).toLowerCase().includes(q)); }
  return list;
}
function pageAuditoria() {
  const f = UI.f.au, list = auditoriaFiltrada(), per = 30, pages = Math.max(1, Math.ceil(list.length / per)); f.page = Math.min(f.page, pages - 1);
  const ents = [...new Set(DB.auditoria.map(a => a.entidade))].sort();
  return `<div class="filters">
    <input type="search" placeholder="Buscar por pessoa, registro ou texto" value="${esc(f.q)}" data-f="au.q" aria-label="Buscar na auditoria">
    <select data-f="au.ent" aria-label="Tipo de registro"><option value="">Todos os registros</option>${ents.map(e => `<option ${f.ent === e ? "selected" : ""}>${esc(e)}</option>`).join("")}</select>
    ${scope().hoteis.length > 1 ? `<select data-f="au.hotel" aria-label="Hotel"><option value="">Todos os hotéis</option>${hotelOptions(f.hotel)}</select>` : ""}
    <div style="flex:1"></div><button class="btn" data-act="csv-au">Exportar CSV</button></div>
  <div class="panel"><div class="panel-h"><h2>Quem mudou o quê</h2><span class="hint">Registro permanente, só de leitura, de alterações em chamados, OS, ativos, políticas e acessos</span></div><div class="panel-b table-wrap"><table><thead><tr><th>Quando</th><th>Quem</th><th>Registro</th><th>Hotel</th><th>O que mudou</th></tr></thead><tbody>
  ${list.slice(f.page * per, f.page * per + per).map(a => `<tr><td class="small">${fmtDT(a.t)}</td><td class="small">${esc(a.usuario)}</td><td class="small">${esc(a.entidade)} <span class="id" style="font-size:13px">${esc(a.registro)}</span></td><td class="small">${a.hotel_id ? esc(IDX.hotel[a.hotel_id].nome) : "Grupo"}</td><td class="small">${esc(a.acao)}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">Nenhum registro com esses filtros.</td></tr>`}
  </tbody></table><div class="pager">${list.length} registros<span class="row"><button class="btn sm" data-act="page" data-k="au" data-d="-1" ${f.page === 0 ? "disabled" : ""}>Anterior</button><span>Página ${f.page + 1} de ${pages}</span><button class="btn sm" data-act="page" data-k="au" data-d="1" ${f.page >= pages - 1 ? "disabled" : ""}>Próxima</button></span></div></div></div>`;
}

/* ---------- App do técnico ---------- */
const TEC = "u4";
function phoneScreen() {
  const P = UI.phone, now = Date.now();
  const hojeFim = new Date(); hojeFim.setHours(23, 59, 59, 999);
  const osHoje = DB.os.filter(o => o.responsavel_id === TEC && o.origem === "preventiva" && (o.status === "Atrasada" || (o.status === "Programada" && t(o.programada_para) <= +hojeFim))).sort((a, b) => t(a.programada_para) - t(b.programada_para));
  const chs = DB.chamados.filter(c => c.tecnico_id === TEC && ["Aberto", "Em atendimento", "Aguardando peça"].includes(c.status)).sort((a, b) => t(a.prazo_sla) - t(b.prazo_sla));
  const net = `<div class="m-net ${P.offline ? "off" : ""}"><span>${P.offline ? `Sem conexão${P.pend ? `, ${P.pend} ${P.pend > 1 ? "ações" : "ação"} para enviar` : ""}` : "Conectado e sincronizado"}</span><button class="btn sm" data-act="ph-net" style="padding:1px 8px;font-size:11.5px">${P.offline ? "Reconectar" : "Simular sem sinal"}</button></div>`;
  let head = `<div class="m-head"><div class="t">Olá, Paulo</div><div class="s">Hotel Curitiba Batel</div></div>`;
  let body = "";
  if (P.view && P.view.startsWith("OS-")) {
    const o = IDX.os[P.view];
    head = `<div class="m-head"><button data-act="ph-back" style="background:none;border:none;color:#A9C8CC;padding:0;cursor:pointer">Voltar</button><div class="t">${esc(o.titulo.split(" — ")[0])}</div><div class="s">${esc(IDX.ativo[o.ativo_id].nome)}, ${esc(IDX.local[o.local_id].nome)}</div></div>`;
    const done = o.status === "Concluída";
    body = `<div class="m-card" style="cursor:default"><div class="r" style="margin:0">${statusBadge(o.status)}<span class="small muted">${o.id}</span></div></div>
      <div class="m-card" style="cursor:default"><div class="t">Checklist</div>${checklistHtml(o, !done, "ph")}</div>
      <div class="m-card" style="cursor:default"><div class="t">Fotos</div><div class="photos" style="margin-top:8px">${Array.from({ length: o.fotos || 0 }, (_, i) => `<div class="photo" style="width:70px;height:56px">Foto ${i + 1}</div>`).join("")}${done ? "" : `<button class="photo" data-act="ph-foto" data-id="${o.id}" style="width:70px;height:56px;cursor:pointer">Tirar foto</button>`}</div></div>
      ${done ? `<div class="m-card" style="cursor:default"><div class="t">Concluída às ${fmtDT(o.fim).slice(6)}</div><div class="s">${o.horas} h apontadas</div></div>` : `<button class="m-btn p" data-act="ph-concluir" data-id="${o.id}">Concluir OS</button>`}`;
  } else if (P.view && P.view.startsWith("CH-")) {
    const c = IDX.ch[P.view];
    head = `<div class="m-head"><button data-act="ph-back" style="background:none;border:none;color:#A9C8CC;padding:0;cursor:pointer">Voltar</button><div class="t">${esc(c.titulo)}</div><div class="s">${esc(IDX.local[c.local_id].nome)}</div></div>`;
    body = `<div class="m-card" style="cursor:default"><div class="r" style="margin:0">${prio(c.prioridade)}${tag(c)}</div><div class="s" style="margin-top:8px">${esc(c.descricao)}</div>${DB.statusUH[c.local_id] ? `<div class="s">UH ${DB.statusUH[c.local_id].toLowerCase()} no PMS</div>` : ""}</div>
      <div class="m-card" style="cursor:default"><div class="t">Situação: ${esc(c.status)}</div><div class="s">Aberto ${rel(c.aberto_em)} por ${esc(c.solicitante)}</div></div>
      ${c.status === "Aberto" ? `<button class="m-btn p" data-act="ph-ch" data-id="${c.id}" data-st="Em atendimento">Iniciar atendimento</button>` : ""}
      ${c.status === "Em atendimento" ? `<button class="m-btn p" data-act="ph-ch" data-id="${c.id}" data-st="Aguardando aceite">Concluir serviço</button><button class="m-btn s" data-act="ph-ch" data-id="${c.id}" data-st="Aguardando peça">Aguardar peça</button>` : ""}
      ${c.status === "Aguardando peça" ? `<button class="m-btn p" data-act="ph-ch" data-id="${c.id}" data-st="Em atendimento">Retomar atendimento</button>` : ""}`;
  } else if (P.tab === "hoje") {
    body = `<div class="small muted" style="margin:2px 2px 8px">Chamados atribuídos a você</div>
      ${chs.map(c => `<div class="m-card" data-act="ph-open" data-id="${c.id}"><div class="t">${esc(c.titulo)}</div><div class="s">${esc(IDX.local[c.local_id].nome)}, ${esc(c.status.toLowerCase())}</div><div class="r">${prio(c.prioridade)}${tag(c)}</div></div>`).join("") || `<div class="m-card" style="cursor:default"><div class="s">Nenhum chamado com você agora.</div></div>`}
      <div class="small muted" style="margin:12px 2px 8px">Preventivas de hoje</div>
      ${osHoje.map(o => `<div class="m-card" data-act="ph-open" data-id="${o.id}"><div class="t">${esc(o.titulo.split(" — ")[0])}</div><div class="s">${esc(IDX.ativo[o.ativo_id].nome)}, ${o.status === "Atrasada" ? "atrasada desde " + fmtD(o.programada_para).slice(0, 5) : "às " + fmtDT(o.programada_para).slice(6)}</div><div class="r">${statusBadge(o.status)}<span class="small muted">${o.checklist.filter(itemFeito).length} de ${o.checklist.length} itens</span></div></div>`).join("") || `<div class="m-card" style="cursor:default"><div class="s">Preventivas do dia concluídas.</div></div>`}`;
  } else if (P.tab === "abrir") {
    if (!P.scan) body = `<div class="m-card" style="cursor:default;text-align:center;padding:26px 12px"><div class="t">Leia a etiqueta do ativo</div><div class="s" style="margin:6px 0 14px">Aponte a câmera para o QR code colado no equipamento</div><div style="display:grid;place-items:center">${qrSvg("scan-demo", 120)}</div><button class="m-btn p" data-act="ph-scan">Ler etiqueta</button></div><div class="small muted" style="padding:0 4px">Sem etiqueta? Abra o chamado pela UH ou pela área.</div>`;
    else { const a = IDX.ativo[P.scan]; body = `<div class="m-card" style="cursor:default"><div class="t">${esc(a.nome)}</div><div class="s">${a.id}, ${esc(IDX.local[a.local_id].nome)}</div></div>
      <div class="m-card" style="cursor:default"><div class="field"><label for="ph-t">O que aconteceu</label><select id="ph-t"><option>Ruído anormal</option><option>Parado</option><option>Vazamento</option><option>Alarme ativo</option></select></div><div class="field" style="margin:0"><label for="ph-p">Prioridade</label><select id="ph-p">${PRIOS.map(p => `<option ${p === "Alta" ? "selected" : ""}>${p}</option>`).join("")}</select></div></div>
      <button class="m-btn p" data-act="ph-abrir">Abrir chamado</button><button class="m-btn s" data-act="ph-scan-cancel">Cancelar</button>`; }
  } else {
    const feitas = DB.os.filter(o => o.responsavel_id === TEC && o.status === "Concluída" && t(o.fim) > now - 7 * D).sort((a, b) => t(b.fim) - t(a.fim));
    body = `<div class="small muted" style="margin:2px 2px 8px">Concluídas nos últimos 7 dias</div>${feitas.map(o => `<div class="m-card" data-act="ph-open" data-id="${o.id}"><div class="t">${esc(o.titulo.split(" — ")[0])}</div><div class="s">${fmtDT(o.fim)}, ${o.horas} h</div></div>`).join("") || `<div class="m-card"><div class="s">Nada concluído nesta semana ainda.</div></div>`}`;
  }
  const tabs = [["hoje", "Meu dia"], ["abrir", "Abrir chamado"], ["hist", "Histórico"]].map(([k, l]) => `<button class="${P.tab === k && !P.view ? "on" : ""}" data-act="ph-tab" data-k="${k}">${l}</button>`).join("");
  return `<div class="m-status"><span>${pad(new Date().getHours())}:${pad(new Date().getMinutes())}</span><span>${P.offline ? "sem sinal" : "4G"}</span></div>${head}${net}<div class="m-body">${body}</div><div class="m-tabs">${tabs}</div>`;
}
function pageTecnico() {
  return `<div class="phone-stage"><div class="phone" aria-label="Simulação do app no celular"><div class="screen" id="phone">${phoneScreen()}</div></div>
  ${role() === "tec" ? "" : `<div class="phone-notes panel" style="padding:18px 22px"><h2 style="font-family:var(--font-cond);font-weight:600;margin:0 0 8px">O dia do técnico</h2>
    <p class="small muted" style="margin-top:0">Visão de Paulo Mendes, técnico do Hotel Curitiba Batel. O app é instalado pelo navegador, sem loja de aplicativos.</p>
    <ul class="small">
      <li>A fila junta chamados atribuídos e preventivas do dia, na ordem do prazo.</li>
      <li>O checklist vem do plano preventivo; a OS só conclui com todos os itens marcados.</li>
      <li>Use “Simular sem sinal” e conclua uma tarefa: o app guarda a ação e envia ao reconectar. Casa de máquinas costuma não ter sinal.</li>
      <li>Em “Abrir chamado”, a leitura da etiqueta preenche hotel, local e ativo.</li>
      <li>Tudo o que Paulo faz aparece na hora no painel do CSC e na auditoria.</li>
    </ul></div>`}</div>`;
}
function phoneAction(fn) {
  fn();
  if (UI.phone.offline) UI.phone.pend++;
  save(); const ph = $("#phone"); if (ph) ph.innerHTML = phoneScreen();
}

/* ---------- Indicadores (1c) ---------- */
const sobreposicaoH = (ini, fim, a, b) => Math.max(0, (Math.min(fim, b) - Math.max(ini, a)) / H);
function uhDias(chs, from, to) { return chs.reduce((acc, c) => c.uh_indisp ? acc + sobreposicaoH(t(c.uh_indisp.inicio), c.uh_indisp.fim ? t(c.uh_indisp.fim) : Date.now(), from, to) / 24 : acc, 0); }
function indicadoresDe(chs, oss, from, to) {
  const open = chs.filter(c => OPEN.includes(c.status));
  const s = slaWin(chs, from, to), mttr = mttrWin(chs, from, to), pv = prevWin(oss, from, to);
  const concl = oss.filter(o => o.status === "Concluída" && o.fim && t(o.fim) >= from && t(o.fim) < to);
  const prevN = concl.filter(o => o.origem === "preventiva").length, corrN = concl.filter(o => o.origem === "corretiva").length;
  const enc = chs.filter(c => c.status === "Encerrado" && t(c.encerrado_em) >= from && t(c.encerrado_em) < to);
  const novos = chs.filter(c => t(c.aberto_em) >= from && t(c.aberto_em) < to);
  return { backlog: open.length, sla: s.pct, mttr, pv: pv.pct, razao: corrN ? prevN / corrN : null, prevN, corrN, uhd: uhDias(chs, from, to), custo: enc.reduce((a, c) => a + (c.custo || 0), 0), hosp: novos.length ? novos.filter(c => c.impacto_hospede).length / novos.length * 100 : null, novos: novos.length };
}
function pageIndicadores() {
  const chs = scoped(DB.chamados), oss = scoped(DB.os), sc = scope(), now = Date.now(), from = now - 30 * D;
  const k = indicadoresDe(chs, oss, from, now), kp = indicadoresDe(chs, oss, from - 30 * D, from);
  const mttrTxt = v => v == null ? "—" : v < 24 ? fmt1(v) + "<small>h</small>" : fmt1(v / 24) + "<small>dias</small>";
  const box = (lab, val, foot, delta = "") => `<div class="panel inst"><div class="lab">${lab}</div><div class="val">${val}</div>${delta}<div class="foot">${foot}</div></div>`;
  const dlt = (a, b, unit, good) => deltaHtml(a != null && b != null ? a - b : null, unit, good, "vs. 30 dias antes");
  // backlog por idade
  const open = chs.filter(c => OPEN.includes(c.status));
  const faixas = [["Até 1 dia", 0, 1], ["1 a 3 dias", 1, 3], ["3 a 7 dias", 3, 7], ["7 a 30 dias", 7, 30], ["Mais de 30 dias", 30, 1e9]];
  const fx = faixas.map(([l, a, b]) => ({ l, n: open.filter(c => { const d = (now - t(c.aberto_em)) / D; return d >= a && d < b; }).length }));
  const fmax = Math.max(1, ...fx.map(x => x.n));
  const backlogIdade = `<div style="display:grid;gap:10px">${fx.map((x, i) => `<div><div style="display:flex;justify-content:space-between;font-size:13px;color:var(--steel);margin-bottom:4px"><span>${x.l}</span><span style="color:var(--head);font-family:var(--font-cond);font-weight:600;font-size:15px">${x.n}</span></div><div style="height:8px;border-radius:4px;background:var(--tint-2);overflow:hidden"><div style="height:100%;width:${Math.max(2, x.n / fmax * 100)}%;border-radius:4px;background:${i < 2 ? "var(--ok)" : i < 3 ? "var(--amber)" : "var(--red)"}"></div></div></div>`).join("")}</div>`;
  // comparação na mesma bandeira
  const bands = DB.bandeiras.filter(b => DB.hoteis.some(h => h.bandeira_id === b.id && sc.hoteis.includes(h.id)));
  const bsel = UI.f.ind.band && bands.some(b => b.id === UI.f.ind.band) ? UI.f.ind.band : bands[0].id;
  const hs = DB.hoteis.filter(h => h.bandeira_id === bsel && sc.hoteis.includes(h.id)).map(h => { const x = indicadoresDe(chs.filter(c => c.hotel_id === h.id), oss.filter(o => o.hotel_id === h.id), from, now); return { h, x, por100: chs.filter(c => c.hotel_id === h.id && t(c.aberto_em) >= from).length / h.uhs * 100 }; });
  const best = (f, hi) => { const v = hs.map(f).filter(x => x != null); return v.length ? (hi ? Math.max(...v) : Math.min(...v)) : null; };
  const bSla = best(r => r.x.sla, true), bMttr = best(r => r.x.mttr, false), bUhd = best(r => r.x.uhd, false), bPv = best(r => r.x.pv, true);
  const mark = (v, b) => v != null && b != null && Math.abs(v - b) < 1e-9 ? ' class="num best"' : ' class="num"';
  const comp = `<div class="table-wrap"><table><thead><tr><th>Hotel</th><th class="num">SLA</th><th class="num">MTTR</th><th class="num">Backlog</th><th class="num">Preventiva em dia</th><th class="num">UH-dias perdidos</th><th class="num">Chamados por 100 UHs</th></tr></thead><tbody>
    ${hs.map(r => `<tr><td>${esc(r.h.nome)}<div class="small muted">${esc(r.h.modelo)}, ${r.h.uhs} UHs</div></td><td${mark(r.x.sla, bSla)}>${r.x.sla == null ? "—" : fmt1(r.x.sla) + "%"}</td><td${mark(r.x.mttr, bMttr)}>${r.x.mttr == null ? "—" : r.x.mttr < 24 ? fmt1(r.x.mttr) + " h" : fmt1(r.x.mttr / 24) + " d"}</td><td class="num">${r.x.backlog}</td><td${mark(r.x.pv, bPv)}>${r.x.pv == null ? "—" : fmt1(r.x.pv) + "%"}</td><td${mark(r.x.uhd, bUhd)}>${fmt1(r.x.uhd)}</td><td class="num">${fmt1(r.por100)}</td></tr>`).join("")}</tbody></table></div><p class="small muted">Em destaque, o melhor resultado da bandeira em cada coluna. Hotéis só se comparam dentro da mesma bandeira.</p>`;
  // produtividade por equipe e hotel
  const concl = oss.filter(o => o.status === "Concluída" && o.fim && t(o.fim) >= from);
  const porTec = {}; concl.forEach(o => { const key = (o.executado_por && o.executado_por.tipo === "fornecedor" ? "f:" + o.executado_por.fornecedor_id : "t:" + o.responsavel_id) + "@" + o.hotel_id; const r = porTec[key] = porTec[key] || { key, n: 0, prev: 0, corr: 0, ok: 0, hotel: o.hotel_id }; r.n++; if (o.origem === "preventiva") r.prev++; else { r.corr++; const c = IDX.ch[o.chamado_id]; if (c && c.encerrado_em && t(c.encerrado_em) <= t(c.prazo_sla)) r.ok++; } });
  const prod = Object.values(porTec).sort((a, b) => b.n - a.n).slice(0, 12);
  const quem = k => { const id = k.split("@")[0]; return id.startsWith("f:") ? esc(IDX.forn[id.slice(2)].nome) + ' <span class="badge b-grey">fornecedor</span>' : esc(nomeUser(id.slice(2))); };
  const prodHtml = `<div class="table-wrap"><table><thead><tr><th>Quem executou</th><th>Hotel</th><th class="num">OS concluídas</th><th class="num">Preventivas</th><th class="num">Corretivas</th><th class="num">Corretivas no prazo</th></tr></thead><tbody>${prod.map(r => `<tr><td>${quem(r.key)}</td><td class="small">${esc(IDX.hotel[r.hotel].nome)}</td><td class="num">${r.n}</td><td class="num">${r.prev}</td><td class="num">${r.corr}</td><td class="num">${r.corr ? Math.round(r.ok / r.corr * 100) + "%" : "—"}</td></tr>`).join("")}</tbody></table></div>`;
  return `<div class="filters"><p class="small muted" style="margin:0">Últimos 30 dias, no escopo de ${esc(sc.label)}. Todos os números saem das transições das OS e dos chamados.</p><div style="flex:1"></div><button class="btn" data-act="csv-ind">Exportar CSV</button></div>
  <div class="grid g-4" id="ind-kpis" style="margin-bottom:16px">
    ${box("Backlog", k.backlog, "Chamados em aberto agora.")}
    ${box("SLA cumprido", (k.sla == null ? "—" : fmt1(k.sla)) + "<small>%</small>", "Encerrados no prazo. Meta de 90%.", dlt(k.sla, kp.sla, " p.p.", true))}
    ${box("Tempo médio de reparo", mttrTxt(k.mttr), "Da abertura ao encerramento.", deltaHtml(k.mttr != null && kp.mttr ? (k.mttr - kp.mttr) / kp.mttr * 100 : null, "%", false, "vs. 30 dias antes"))}
    ${box("Preventiva em dia", (k.pv == null ? "—" : fmt1(k.pv)) + "<small>%</small>", "Meta de 95%.", dlt(k.pv, kp.pv, " p.p.", true))}
    ${box("Preventiva por corretiva", k.razao == null ? "—" : fmt1(k.razao) + "<small>: 1</small>", `${k.prevN} preventivas e ${k.corrN} corretivas concluídas.`)}
    ${box("UH-dias perdidos", fmt1(k.uhd), "UHs fora de venda por manutenção, somadas em dias.", dlt(k.uhd, kp.uhd, "", false))}
    ${box("Impacto no hóspede", (k.hosp == null ? "—" : Math.round(k.hosp)) + "<small>%</small>", `Dos ${k.novos} chamados abertos no período.`)}
    ${box("Custo informado", brl(k.custo), "Somado no aceite dos chamados encerrados.")}
  </div>
  <div class="grid g-3-1" style="align-items:start">
    <div class="panel" id="ind-comp"><div class="panel-h"><h2>Comparação entre hotéis da mesma bandeira</h2><div class="spacer"></div><select data-act="ind-band" aria-label="Bandeira">${bands.map(b => `<option value="${b.id}" ${b.id === bsel ? "selected" : ""}>${esc(b.nome)}</option>`).join("")}</select></div><div class="panel-b">${comp}</div></div>
    <div class="panel" id="ind-idade"><div class="panel-h"><h2>Backlog por idade</h2></div><div class="panel-b">${backlogIdade}</div></div>
  </div>
  <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Produtividade por equipe e hotel</h2><span class="hint">OS concluídas em 30 dias, equipe interna e fornecedores</span></div><div class="panel-b">${prodHtml}</div></div>`;
}

/* ---------- HubKeep Intelligence (módulo opcional) ---------- */
/* Fórmulas do 1.0 aprovadas em 08/10/2026, com as respostas aprovadas em 10/10/2026 (packages/inteligencia): atenção v2,
   reincidência v1, efetividade v2 e padrão sistêmico v2. O cálculo é repetido aqui em JavaScript só para a demonstração;
   os dados são fictícios. */
const IA_FAIXAS = [[0, "Normal"], [30, "Observar"], [50, "Atenção"], [70, "Alta atenção"], [85, "Crítico"]];
const iaFaixa = v => v === null ? "Dados insuficientes" : IA_FAIXAS.filter(f => v >= f[0]).pop()[1];
const iaRazao = (x, ref) => ref > 0 ? Math.min(1, Math.max(0, x / ref)) : x > 0 ? 1 : 0;
/* O componente sem dado não soma e o peso dele é dividido entre os presentes, na proporção dos pesos. */
function iaCombinar(partes) {
  const pres = partes.filter(p => p.valor !== null && p.peso > 0), soma = pres.reduce((s, p) => s + p.peso, 0);
  const comp = partes.map(p => { const ef = p.valor !== null && soma > 0 ? p.peso / soma : 0, v = p.valor === null ? null : Math.min(1, Math.max(0, p.valor)); return { ...p, valor: v, pesoEf: ef, pontos: (v || 0) * ef * 100 }; });
  const valor = soma > 0 ? Math.round(comp.reduce((s, c) => s + c.pontos, 0)) : null;
  return { valor, faixa: iaFaixa(valor), comp };
}
/* Índice por ativo, para o job simulado calcular 90 dias sem varrer todos os chamados e OS a cada ativo. */
function iaIndice() {
  const por = (xs, k) => { const m = {}; xs.forEach(x => { if (x[k]) (m[x[k]] = m[x[k]] || []).push(x); }); return m; };
  return { ch: por(DB.chamados, "ativo_id"), par: por(DB.ativo_parada, "ativo_id"), prev: por(DB.os.filter(o => o.origem === "preventiva"), "ativo_id"), custo: {}, med: {} };
}
function iaReincidencia(a, now, ix) {
  const ini = now - 90 * D;
  const todas = (ix ? ix.ch[a.id] || [] : DB.chamados.filter(c => c.ativo_id === a.id)).filter(c => c.status !== "Cancelado" && t(c.aberto_em) <= now).sort((x, y) => t(x.aberto_em) - t(y.aberto_em));
  const jan = todas.filter(c => t(c.aberto_em) > ini), n = jan.length;
  const ints = jan.slice(1).map((c, i) => (t(c.aberto_em) - t(jan[i].aberto_em)) / D), med = ints.length ? ints.reduce((s, x) => s + x, 0) / ints.length : null;
  const reab = jan.reduce((s, c) => s + (c.reaberturas || 0), 0);
  const cods = jan.filter(c => c.codigos && c.codigos.falha), cont = {};
  cods.forEach(c => { cont[c.codigos.falha] = (cont[c.codigos.falha] || 0) + 1; });
  const [cod, vezes] = Object.entries(cont).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0] || [null, 0];
  const voltas = jan.filter(c => { const ant = todas.filter(x => t(x.aberto_em) < t(c.aberto_em)).pop(); if (!ant || !ant.encerrado_em || t(ant.encerrado_em) > now) return false; const d = (t(c.aberto_em) - t(ant.encerrado_em)) / D; return d >= 0 && d <= 30; }).length;
  return iaCombinar([
    { k: "corretivas", peso: 0.30, valor: iaRazao(n, 5), medido: `${n} ${n === 1 ? "corretiva" : "corretivas"} nos últimos 90 dias` },
    { k: "intervalo", peso: 0.15, valor: med === null ? 0 : 1 - iaRazao(med, 30), medido: med === null ? "Sem intervalo a medir" : `Intervalo médio de ${fmt1(med)} dias entre as falhas` },
    { k: "reaberturas", peso: 0.15, valor: iaRazao(reab, 3), medido: `${reab} ${reab === 1 ? "reabertura" : "reaberturas"} na janela` },
    { k: "mesma_falha", peso: 0.15, valor: cods.length === 0 ? null : vezes >= 2 ? vezes / cods.length : 0, medido: cods.length ? `A mesma falha em ${vezes} de ${cods.length} corretivas com código` : "Sem corretiva com código de falha" },
    { k: "apos_corretiva", peso: 0.15, valor: iaRazao(voltas, Math.max(n - 1, 1)), medido: `${voltas} ${voltas === 1 ? "falha voltou" : "falhas voltaram"} em até 30 dias depois da corretiva anterior` },
    { k: "apos_preventiva", peso: 0.10, valor: null, medido: "Sem dado" }
  ]);
}
/* Disponibilidade de cada componente da atenção (respostas aprovadas em 10/10/2026):
   - tempo parado e impacto no hóspede sempre disponíveis: o que não foi marcado é "não teve";
   - garantia sem a data conta como não vencida;
   - custo informado vale quando pelo menos 50% das corretivas encerradas do grupo, em 12 meses, têm o custo (fixo na
     fórmula); abaixo disso, sem dado em todos os hotéis. Disponível, o ativo soma só as corretivas com o dado;
   - medições valem nos ativos das categorias com item de medição no plano; abaixo do mínimo da política, contribuem 0. */
const IA_MIN_CUSTO_NO_GRUPO = 0.5;
function iaCustoNoGrupo(now) {
  const enc = DB.chamados.filter(c => c.status === "Encerrado" && c.encerrado_em && t(c.encerrado_em) > now - 365 * D && t(c.encerrado_em) <= now);
  const inf = enc.filter(c => c.custo != null).length;
  return { enc: enc.length, inf, pct: enc.length ? Math.round(inf / enc.length * 1000) / 10 : null, ok: enc.length > 0 && inf / enc.length >= IA_MIN_CUSTO_NO_GRUPO };
}
const iaCategoriaComMedicao = cat => DB.planos.some(p => p.categoria_id === cat && p.checklist.some(i => i.tipo === "medicao"));
/* Preventiva atrasada no dia do cálculo: no dia de hoje vale a situação da OS; num dia passado, a OS já programada
   que ainda não tinha terminado. */
const iaAtrasadaEm = (o, now) => now >= Date.now() - D ? o.status === "Atrasada" : t(o.programada_para) < now && (o.status === "Atrasada" || (!!o.fim && t(o.fim) > now));
/* Atenção de um ativo num momento. Sem `now`, é o cálculo de agora (o recálculo da página do insight); o job simulado
   passa o dia e o índice. Só entram fatos até o momento do cálculo. */
function intelAtivo(a, now = Date.now(), ix = null) {
  const pol = ix ? ix.pol || (ix.pol = polGrupo().inteligencia) : polGrupo().inteligencia, P = pol.pesos, d90 = now - 90 * D, d12m = now - 365 * D;
  const rei = iaReincidencia(a, now, ix), grupo = ix ? (ix.custo[now] = ix.custo[now] || iaCustoNoGrupo(now)) : iaCustoNoGrupo(now), minMed = pol.min_medicoes || 3;
  const chs = (ix ? ix.ch[a.id] || [] : DB.chamados.filter(c => c.ativo_id === a.id)).filter(c => c.status !== "Cancelado" && t(c.aberto_em) <= now), ch90 = chs.filter(c => t(c.aberto_em) > d90);
  const horas = (ix ? ix.par[a.id] || [] : DB.ativo_parada.filter(p => p.ativo_id === a.id)).reduce((s, p) => s + sobreposicaoH(t(p.inicio), p.fim ? t(p.fim) : now, d90, now), 0);
  const imp = ch90.length ? Math.round(ch90.filter(c => c.impacto_hospede === true).length / ch90.length * 100) : 0;
  const encA = chs.filter(c => c.status === "Encerrado" && c.encerrado_em && t(c.encerrado_em) > d12m && t(c.encerrado_em) <= now), infA = encA.filter(c => c.custo != null);
  const custo = grupo.ok ? infA.reduce((s, c) => s + c.custo, 0) : null;
  const prevs = ix ? ix.prev[a.id] || [] : DB.os.filter(o => o.origem === "preventiva" && o.ativo_id === a.id), atras = prevs.length ? prevs.some(o => iaAtrasadaEm(o, now)) : null;
  let med = 0, fora = 0;
  prevs.filter(o => o.status === "Concluída" && o.fim && t(o.fim) > d90 && t(o.fim) <= now).forEach(o => o.checklist.filter(c => c.tipo === "medicao").forEach(c => { med++; if (c.fora) fora++; }));
  const comMed = ix ? (ix.med[a.categoria_id] ??= iaCategoriaComMedicao(a.categoria_id)) : iaCategoriaComMedicao(a.categoria_id), poucas = comMed && med < minMed;
  const garV = a.garantia_ate ? t(a.garantia_ate) < now : false, garDias = garV ? Math.floor((now - t(a.garantia_ate)) / D) : 0;
  const sc = iaCombinar([
    { k: "reincidencia", nome: "Reincidência de falhas", peso: P.reincidencia / 100, valor: rei.valor === null ? null : rei.valor / 100, medido: rei.valor === null ? "Sem dado" : `Reincidência de falhas em ${rei.valor}` },
    { k: "parada", nome: "Tempo parado", peso: P.parada / 100, valor: iaRazao(horas, pol.limite_horas_paradas), medido: `${fmt1(horas)} horas parado na janela` },
    { k: "impacto_hospede", nome: "Impacto em hóspedes", peso: P.impacto_hospede / 100, valor: iaRazao(imp, 100), medido: ch90.length ? `${imp}% dos chamados afetaram hóspedes; o que não foi marcado conta como não` : "Nenhum chamado na janela" },
    { k: "criticidade", nome: "Criticidade", peso: P.criticidade / 100, valor: a.criticidade ? iaRazao(a.criticidade, 5) : null, medido: a.criticidade ? `Criticidade ${a.criticidade} de 5` : "Sem dado" },
    { k: "custo", nome: "Custo informado", peso: P.custo / 100, valor: custo === null ? null : iaRazao(custo, pol.limite_custo_12m),
      medido: custo === null ? `O custo foi informado em ${grupo.pct === null ? 0 : fmt1(grupo.pct)}% das corretivas encerradas do grupo nos últimos 12 meses, menos que os ${IA_MIN_CUSTO_NO_GRUPO * 100}% necessários: sem dado em todos os hotéis`
        : `Custo informado de ${brl(custo)} em 12 meses; custo informado em ${infA.length} de ${encA.length} ${encA.length === 1 ? "corretiva encerrada" : "corretivas encerradas"}` },
    { k: "preventiva_atrasada", nome: "Preventiva atrasada", peso: P.preventiva_atrasada / 100, valor: atras === null ? null : atras ? 1 : 0, medido: atras === null ? "Sem dado" : atras ? "Preventiva atrasada" : "Preventivas em dia" },
    { k: "medicoes", nome: "Medições fora da faixa", peso: P.medicoes / 100, valor: !comMed ? null : poucas ? 0 : iaRazao(fora, med),
      medido: !comMed ? "O plano da categoria não tem item de medição" : poucas ? `${med === 0 ? "Nenhuma medição" : med === 1 ? "1 medição" : med + " medições"} na janela, abaixo do mínimo de ${minMed}: o componente conta 0` : `${fora} ${fora === 1 ? "medição" : "medições"} fora da faixa, entre ${med} feitas` },
    { k: "garantia", nome: "Garantia vencida", peso: P.garantia / 100, valor: garV ? 1 : 0, medido: !a.garantia_ate ? "Sem a data de fim da garantia: conta como não vencida" : garV ? `Garantia vencida há ${garDias} ${garDias === 1 ? "dia" : "dias"}` : "Garantia vigente" },
    { k: "uh_dias", nome: "UH-dias indisponíveis", peso: P.uh_dias / 100, valor: null, medido: "Sem origem do dado ainda" }
  ]);
  return { a, comp: sc.comp, score: sc.valor, faixa: sc.faixa, n90: ch90.length, horas: Math.round(horas * 10) / 10, imp };
}
/* Ciclo de vida do insight (ADR-033, packages/inteligencia/src/insight.ts): estados, ações e quem decide. O score sugere e
   a pessoa decide: o job só abre ou atualiza; toda transição é de uma pessoa. Resolver e descartar pedem nota (1 a 500). */
const IA_TIPOS = { atencao_ativo: "Ativo pede atenção", sistemico: "Possível problema sistêmico" };
const IA_ESTADOS = { novo: "Novo", em_revisao: "Em revisão", aceito: "Aceito", em_acao: "Em ação", monitorando: "Monitorando", resolvido: "Resolvido", descartado: "Descartado" };
const IA_ABERTOS = ["novo", "em_revisao", "aceito", "em_acao", "monitorando"];
const IA_ACOES = {
  revisar: { rot: "Revisar", de: ["novo"], para: "em_revisao" },
  aceitar: { rot: "Aceitar", de: ["novo", "em_revisao"], para: "aceito" },
  agir: { rot: "Agir", de: ["aceito"], para: "em_acao" },
  monitorar: { rot: "Monitorar", de: ["em_acao"], para: "monitorando" },
  resolver: { rot: "Resolver", de: ["aceito", "em_acao", "monitorando"], para: "resolvido", nota: true },
  descartar: { rot: "Descartar", de: ["novo", "em_revisao", "aceito"], para: "descartado", nota: true }
};
const IA_MOTIVOS = { nao_relevante: "Não relevante", substituido: "Substituído por outro insight" };
const iaAberto = i => IA_ABERTOS.includes(i.estado);
const IA_COMP_NOMES = { reincidencia: "Reincidência de falhas", parada: "Tempo parado", impacto_hospede: "Impacto em hóspedes", criticidade: "Criticidade", custo: "Custo informado", preventiva_atrasada: "Preventiva atrasada", medicoes: "Medições fora da faixa", garantia: "Garantia vencida", uh_dias: "UH-dias indisponíveis" };
/* O resultado gravado de hoje para um ativo (seed.js guarda a composição em listas, para caber no navegador). */
function iaGravado(aid) {
  const g = DB.ia.hoje[aid]; if (!g) return null;
  return { score: g[0], faixa: iaFaixa(g[0]), horas: g[2], impacto: g[3], comp: g[1].map(([k, peso, valor, pesoEf, pontos, medido]) => ({ k, nome: IA_COMP_NOMES[k], peso, valor, pesoEf, pontos, medido })) };
}
/* Aplica a ação de uma pessoa. Quem decide primeiro vira o responsável (simplificação do mock). */
function iaAplicar(ins, acao, usuario_id, quando, { nota = null, motivo = null } = {}) {
  const A = IA_ACOES[acao], de = ins.estado;
  ins.estado = A.para; ins.responsavel_id = ins.responsavel_id || usuario_id;
  if (acao === "resolver" || acao === "descartar") ins.encerrado_em = quando;
  if (acao === "descartar") ins.motivo_descarte = motivo;
  ins.historico.push({ t: quando, tipo: "acao", acao, de, para: A.para, usuario_id, nota: nota || null, motivo: motivo || null });
}
/* Quem lê: quem tem acesso a todos os hotéis do insight (hotel_ids <@ hoteis_leitura), como a RLS da app.insight. */
const iaVisiveis = () => { const hs = scope().hoteis; return DB.insights.filter(i => i.hotel_ids.every(h => hs.includes(h))); };
const iaEscopoTxt = i => i.alcance.tipo === "hotel" ? IDX.hotel[i.hotel_ids[0]].nome : `${i.hotel_ids.length} hotéis ${i.alcance.bandeira_id ? "da bandeira " + IDX.band[i.alcance.bandeira_id].nome : "do grupo"}`;
const iaTitulo = i => i.tipo === "sistemico" ? i.evidencia.titulo : IDX.ativo[i.escopo.ativo_id].nome;
const iaFaixaCls = f => ({ "Crítico": "b-red", "Alta atenção": "b-amber", "Atenção": "b-amber", "Observar": "b-blue" })[f] || "b-grey";
const iaEstadoCls = e => ({ novo: "b-amber", em_revisao: "b-blue", aceito: "b-blue", em_acao: "b-blue", monitorando: "b-green", resolvido: "b-outline", descartado: "b-outline" })[e];
/* "Substitui o insight X" e "Substituído pelo insight Y", calculados pelo vínculo (substituidoPor, no motor). Só cita o
   insight que quem lê também enxerga. */
function iaSubstituicao(i) {
  const vis = new Set(iaVisiveis().map(x => x.id)), ant = i.anterior_id && IDX.ins[i.anterior_id];
  const subst = ant && vis.has(ant.id) && (!ant.encerrado_em || t(ant.encerrado_em) > t(i.aberto_em)) ? ant.id : null;
  const novo = DB.insights.filter(x => x.anterior_id === i.id && vis.has(x.id) && (!i.encerrado_em || t(x.aberto_em) < t(i.encerrado_em))).sort((x, y) => t(y.aberto_em) - t(x.aberto_em))[0];
  return { substitui: subst, substituidoPor: novo ? novo.id : null };
}
function iaDecidir(i, acao, extra = {}) {
  const now = new Date().toISOString(), de = i.estado;
  iaAplicar(i, acao, UI.persona, now, extra);
  DB.auditoria.unshift({ t: now, usuario: persona().nome, entidade: "Insight", registro: i.id, hotel_id: i.alcance.tipo === "hotel" ? i.hotel_ids[0] : null, hotel_ids: i.hotel_ids,
    acao: `${IA_ACOES[acao].rot}: ${IA_ESTADOS[de]} para ${IA_ESTADOS[i.estado]}${extra.motivo ? ` (${IA_MOTIVOS[extra.motivo]})` : ""}${extra.nota ? `. Nota: ${extra.nota}` : ""}` });
  UI.iaForm = null; save(); toast(`${i.id}: ${IA_ESTADOS[i.estado].toLowerCase()}`); render();
}
const audVisivel = (a, s) => (!a.hotel_id || s.hoteis.includes(a.hotel_id)) && (!a.hotel_ids || a.hotel_ids.every(h => s.hoteis.includes(h)));
/* Efetividade v2: a mesma janela antes e depois da intervenção. Fala em variação observada, nunca em causa.
   Sem base de comparação prevalece sobre janela incompleta (10/10/2026): é definitivo no dia da intervenção. */
const IA_EF = { reducao_observada: ["Redução observada", "b-green"], reducao_parcial: ["Redução parcial", "b-amber"], sem_mudanca_relevante: ["Sem mudança relevante", "b-grey"], aumento_observado: ["Aumento observado", "b-red"], sem_base_de_comparacao: ["Sem base de comparação", "b-grey"], janela_incompleta: ["Janela incompleta", "b-blue"] };
function efetividade(scopeChs) {
  const pol = polGrupo().inteligencia.efetividade, now = Date.now(), J = pol.janela_dias * D;
  return scopeChs.filter(c => c.intervencao).map(c => {
    const t0 = t(c.encerrado_em || c.aberto_em), fimD = Math.min(t0 + J, now);
    const cor = DB.chamados.filter(x => x.ativo_id === c.ativo_id && x.status !== "Cancelado"), par = (antes, depois) => ({ antes, depois, v: antes === 0 ? null : Math.round((depois - antes) / antes * 1000) / 10 });
    const paradas = DB.ativo_parada.filter(p => p.ativo_id === c.ativo_id), hp = (i, f) => paradas.reduce((s, p) => s + sobreposicaoH(t(p.inicio), p.fim ? t(p.fim) : now, i, f), 0);
    const ch = par(cor.filter(x => t(x.aberto_em) >= t0 - J && t(x.aberto_em) < t0).length, cor.filter(x => t(x.aberto_em) >= t0 && t(x.aberto_em) < fimD).length), hr = par(hp(t0 - J, t0), hp(t0, fimD));
    const dias = Math.max(0, Math.floor((now - t0) / D));
    let r, expl;
    if (ch.v === null || ch.antes < pol.min_chamados_antes) { r = "sem_base_de_comparacao"; expl = `Houve menos de ${pol.min_chamados_antes} chamados nos ${pol.janela_dias} dias antes da intervenção. Esse resultado já vale no dia da intervenção e não muda quando a janela terminar.`; }
    else if (now < t0 + J) { r = "janela_incompleta"; expl = `Passaram ${dias} de ${pol.janela_dias} dias depois da intervenção.`; }
    else if (-ch.v >= pol.reducao_observada) { r = "reducao_observada"; expl = `Os chamados caíram ${pol.reducao_observada}% ou mais em relação aos ${pol.janela_dias} dias antes.`; }
    else if (-ch.v >= pol.reducao_parcial) { r = "reducao_parcial"; expl = `Os chamados caíram de ${pol.reducao_parcial}% a menos de ${pol.reducao_observada}% em relação aos ${pol.janela_dias} dias antes.`; }
    else if (ch.v >= pol.aumento_observado) { r = "aumento_observado"; expl = `Os chamados subiram ${pol.aumento_observado}% ou mais em relação aos ${pol.janela_dias} dias antes.`; }
    else { r = "sem_mudanca_relevante"; expl = `Os chamados variaram menos que os limites de redução (${pol.reducao_parcial}%) e de aumento (${pol.aumento_observado}%).`; }
    return { c, ch, hr, res: IA_EF[r], expl, completa: now >= t0 + J };
  });
}
/* Padrão sistêmico v2: só o mesmo modelo vem ligado por padrão; as outras quatro regras ficam desligadas pela política (`ativa`).
   O mesmo modelo agrupa por categoria, fabricante e modelo e pede 3 hotéis, 6 chamados em 90 dias e 5 ativos; a taxa (chamados por
   ativo instalado) precisa ser de pelo menos o dobro da base, os outros modelos da mesma categoria, e nunca menos de 0,3.
   Respostas de 10/10/2026: fabricante e modelo sem maiúsculas, acentos e espaços extras; o ativo baixado antes do início da
   janela (`desativado_em`) não conta, nem no modelo nem na base; sem outro modelo na categoria, a regra não dispara.
   O resultado é sempre "possível": só uma pessoa confirma. */
function padraoSistemico(ativos, chs, now = Date.now()) {
  const pol = polGrupo().inteligencia.sistemico, uni = xs => [...new Set(xs)];
  const validos = chs.filter(c => c.status !== "Cancelado"), at = id => IDX.ativo[id];
  const falhaDe = c => (c.codigos && c.codigos.falha) || (c.ativo_id && at(c.ativo_id) ? at(c.ativo_id).categoria_id : null);
  const nome = f => (IDX.cat[f] || {}).nome || f;
  const jan = (dias, desl = 0) => c => { const fim = now - desl * D; return t(c.aberto_em) > fim - dias * D && t(c.aberto_em) <= fim; };
  const agrupar = (lista, chave) => { const m = {}; lista.forEach(c => { const k = chave(c); if (k !== null) (m[k] = m[k] || []).push(c); }); return Object.entries(m); };
  const hoteisDe = cs => uni(cs.map(c => c.hotel_id)), sinais = [];
  /* Mesmo modelo: ativo sem categoria, fabricante ou modelo fica fora da conta, inclusive da base. */
  const mm = pol.mesmo_modelo, n2 = x => (Math.round(x * 100) / 100).toLocaleString("pt-BR"), norm = s => (s || "").normalize("NFD").replace(/\p{M}/gu, "").trim().replace(/\s+/g, " ").toLowerCase();
  const grupoDe = a => a && a.categoria_id && norm(a.fabricante) && norm(a.modelo) ? a.categoria_id + "#" + norm(a.fabricante) + "|" + norm(a.modelo) : null;
  if (mm.ativa) {
    const inst = {}, cat = {}, iniMM = now - mm.janela_dias * D, naJanelaMM = a => !a.desativado_em || t(a.desativado_em) > iniMM;
    const doMM = new Set(ativos.filter(naJanelaMM).map(a => a.id));
    ativos.filter(naJanelaMM).forEach(a => { const g = grupoDe(a); if (!g) return; inst[g] = (inst[g] || 0) + 1; (cat[a.categoria_id] = cat[a.categoria_id] || { ativos: 0, chamados: 0 }).ativos++; });
    const porModelo = agrupar(validos.filter(jan(mm.janela_dias)), c => grupoDe(c.ativo_id && doMM.has(c.ativo_id) && at(c.ativo_id)));
    porModelo.forEach(([k, cs]) => { const c0 = cat[at(cs[0].ativo_id).categoria_id]; if (c0) c0.chamados += cs.length; });
    porModelo.forEach(([k, cs]) => {
      const a0 = at(cs[0].ativo_id), dist = uni(cs.map(c => c.ativo_id)).length, hs = hoteisDe(cs), c0 = cat[a0.categoria_id] || { ativos: 0, chamados: 0 };
      if (hs.length < mm.min_hoteis || cs.length < mm.min_chamados || dist < mm.min_ativos) return;
      const doModelo = inst[k] || 0, taxa = cs.length / Math.max(doModelo, dist), ativosBase = c0.ativos - doModelo;
      if (ativosBase <= 0) return; // sem outro modelo na categoria, não há com o que comparar
      const base = (c0.chamados - cs.length) / ativosBase;
      if (taxa < Math.max(mm.taxa_minima, mm.taxa_vezes_base * base)) return;
      sinais.push({ regra: "Mesmo modelo com muitos chamados", k: "mesmo_modelo", chave: k, n: cs.length, ativos: dist, hoteis: hs, taxa, base, janela: mm.janela_dias, chamados: cs.map(c => c.id).sort(), categoria_id: a0.categoria_id, titulo: `${a0.fabricante} ${a0.modelo}`, quem: `Categoria: ${nome(a0.categoria_id)}`,
        evid: `${cs.length} chamados em ${dist} ativos do mesmo modelo, em ${hs.length} hotéis, nos últimos ${mm.janela_dias} dias: ${n2(taxa)} por ativo, contra ${n2(base)} nos outros modelos da mesma categoria.` });
    });
  }
  const ma = pol.mesmo_andar;
  agrupar(ma.ativa ? validos.filter(jan(ma.janela_dias)) : [], c => { const l = IDX.local[c.local_id], f = falhaDe(c); return l && l.andar && f ? c.hotel_id + "#" + l.andar + "#" + f : null; }).forEach(([k, cs]) => {
    const dist = uni(cs.map(c => c.local_id)).length; if (dist < ma.min_locais) return;
    const [h, andar, f] = k.split("#");
    sinais.push({ regra: "Mesmo andar com a mesma falha", n: cs.length, hoteis: [h], titulo: `${IDX.hotel[h].nome}, ${andar}º andar`, quem: `Falha: ${nome(f)}`, evid: `${cs.length} chamados em ${dist} UHs, em ${ma.janela_dias} dias.` });
  });
  const ac = pol.mesma_area_comum;
  agrupar(ac.ativa ? validos.filter(jan(ac.janela_dias)) : [], c => { const l = IDX.local[c.local_id], f = falhaDe(c); return l && l.tipo === "area" && f ? c.local_id + "#" + f : null; }).forEach(([k, cs]) => {
    if (cs.length < ac.min_ocorrencias) return;
    const [lid, f] = k.split("#");
    sinais.push({ regra: "Mesma área comum com a mesma falha", n: cs.length, hoteis: [cs[0].hotel_id], titulo: `${IDX.hotel[cs[0].hotel_id].nome}, ${IDX.local[lid].nome}`, quem: `Falha: ${nome(f)}`, evid: `${cs.length} ocorrências em ${ac.janela_dias} dias.` });
  });
  const pc = x => Number.isInteger(x) ? String(x) : fmt1(x), mf = pol.mesmo_fornecedor, pct = (p, todo) => Math.round(p / todo * 1000) / 10;
  const obs = (mf.ativa ? validos : []).filter(c => c.ativo_id && c.status === "Encerrado" && t(c.encerrado_em) > now - mf.janela_dias * D && t(c.encerrado_em) <= now - mf.dias_apos * D);
  const voltou = c => validos.some(d => d.id !== c.id && d.ativo_id === c.ativo_id && t(d.aberto_em) >= t(c.encerrado_em) && t(d.aberto_em) <= t(c.encerrado_em) + mf.dias_apos * D);
  const internas = obs.filter(c => !c.executado_por || c.executado_por.tipo === "interna"), taxaInt = internas.length ? pct(internas.filter(voltou).length, internas.length) : null;
  agrupar(obs, c => c.executado_por && c.executado_por.tipo === "fornecedor" ? c.executado_por.fornecedor_id : null).forEach(([fid, cs]) => {
    if (cs.length < mf.min_concluidas) return;
    const v = cs.filter(voltou).length, taxa = pct(v, cs.length); if (taxa < mf.limiar_percentual) return;
    sinais.push({ regra: "Mesmo terceiro com muitas falhas que voltam", n: v, hoteis: hoteisDe(cs), titulo: (IDX.forn[fid] || {}).nome || "Fornecedor", quem: "Taxa de volta das OS do terceiro", evid: `${v} de ${cs.length} OS tiveram nova corretiva no mesmo ativo em até ${mf.dias_apos} dias (${pc(taxa)}%)${taxaInt === null ? "" : `, contra ${pc(taxaInt)}% da equipe interna`}.` });
  });
  const cr = pol.crescimento, chave = c => { const f = falhaDe(c); return f ? c.hotel_id + "#" + f : null; };
  const doCrescimento = cr.ativa ? validos : [];
  const ant = Object.fromEntries(agrupar(doCrescimento.filter(jan(cr.janela_dias, cr.janela_dias)), chave));
  agrupar(doCrescimento.filter(jan(cr.janela_dias)), chave).forEach(([k, cs]) => {
    const antes = (ant[k] || []).length; if (cs.length < cr.min_atual || antes === 0) return;
    const v = pct(cs.length - antes, antes); if (v < cr.percentual) return;
    const [h, f] = k.split("#");
    sinais.push({ regra: "A mesma falha crescendo", n: cs.length, hoteis: [h], titulo: `${IDX.hotel[h].nome}`, quem: `Falha: ${nome(f)}`, evid: `${cs.length} chamados em ${cr.janela_dias} dias, contra ${antes} nos ${cr.janela_dias} dias anteriores (+${pc(v)}%).` });
  });
  return sinais.sort((a, b) => b.n - a.n);
}
/* Lista de insights (proposta das telas do 1.0, decisões de 10/10/2026): o único item de menu do módulo. Lê os insights
   gravados pelo job; a efetividade fica como seção abaixo da lista. */
function pageInteligencia(params) {
  if (params.ins) return iaPaginaInsight(params.ins);
  if (params.ativo) return iaPaginaAtivo(params.ativo);
  return iaListaDeInsights();
}
function iaListaDeInsights() {
  const pol = polGrupo().inteligencia, f = UI.f.intel, vis = iaVisiveis(), abertos = vis.filter(iaAberto);
  const ordemF = x => IA_FAIXAS.findIndex(y => y[1] === x.faixa);
  let list = vis;
  if (f.estado === "abertos") list = list.filter(iaAberto); else if (f.estado) list = list.filter(i => i.estado === f.estado);
  if (f.tipo) list = list.filter(i => i.tipo === f.tipo);
  if (f.escopo === "rede") list = list.filter(i => i.alcance.tipo === "rede"); else if (f.escopo) list = list.filter(i => i.alcance.tipo === "hotel" && i.hotel_ids[0] === f.escopo);
  if (f.faixa) list = list.filter(i => i.faixa === f.faixa);
  list = list.slice().sort((a, b) => (iaAberto(b) - iaAberto(a)) || (ordemF(b) - ordemF(a)) || (t(b.ultima_deteccao_em) - t(a.ultima_deteccao_em)));
  const ef = efetividade(scoped(DB.chamados)), ia = DB.ia, multi = scope().hoteis.length > 1;
  const ind = (lab, val, foot, cls) => `<div class="panel inst ${cls || ""}"><div class="lab">${lab}</div><div class="val">${val}</div><div class="foot">${foot}</div></div>`;
  const altos = abertos.filter(i => ["Alta atenção", "Crítico"].includes(i.faixa)).length, sis = abertos.filter(i => i.tipo === "sistemico").length, semResp = abertos.filter(i => !i.responsavel_id).length;
  const linha = i => {
    const sub = iaSubstituicao(i);
    return `<tr class="click" data-act="ia-ins" data-tipo="${i.tipo}" data-id="${i.id}"><td><span class="badge ${iaFaixaCls(i.faixa)}">${esc(i.faixa)}</span></td><td><span class="id">${i.id}</span></td>
      <td><div class="small muted">${IA_TIPOS[i.tipo]}</div><a href="#/inteligencia?ins=${i.id}" style="font-weight:600;color:var(--head)">${esc(iaTitulo(i))}</a>${sub.substitui ? `<div class="small muted">Substitui o insight ${sub.substitui}</div>` : ""}${sub.substituidoPor ? `<div class="small muted">Substituído pelo insight ${sub.substituidoPor}</div>` : ""}</td>
      <td class="small">${esc(iaEscopoTxt(i))}</td><td class="num">${i.valor === null ? "—" : `<strong>${i.valor}</strong>`}</td>
      <td><span class="badge ${iaEstadoCls(i.estado)}">${IA_ESTADOS[i.estado]}</span>${i.estado === "descartado" ? `<div class="small muted">${IA_MOTIVOS[i.motivo_descarte]}</div>` : ""}</td>
      <td class="small">${i.responsavel_id ? esc(nomeUser(i.responsavel_id)) : '<span class="muted">Sem responsável</span>'}</td><td class="small">${fmtD(i.ultima_deteccao_em)}</td></tr>`;
  };
  return `<div class="ia-aviso" role="note"><strong>Prévia com dados fictícios.</strong> Os ativos, os chamados, os custos, as intervenções e os insights desta tela são inventados para a demonstração. As regras seguem o Intelligence 1.0; o módulo ainda está em desenvolvimento.</div>
  <div class="readonly-note" style="margin-top:12px">${icon("intel")}<span><strong>Módulo opcional, contratado por este grupo.</strong> Transforma os dados de manutenção em decisão: quais ativos mais falham e custam, o que mudou depois da intervenção e onde agir primeiro. Todo resultado mostra de onde veio. Correlação nunca é apresentada como causa.</span></div>
  <div class="grid g-4" style="margin:14px 0 6px">
    ${ind("Insights abertos", abertos.length, "Ainda sem decisão final, no seu escopo.")}
    ${ind("Em alta atenção ou crítico", altos, "Ativos com atenção de 70 ou mais.", altos ? "warn" : "")}
    ${ind("Possíveis problemas sistêmicos", sis, "O mesmo problema em vários hotéis.")}
    ${ind("Sem responsável", semResp, "Ninguém decidiu nada ainda.", semResp ? "warn" : "")}
  </div>
  <p class="small muted" id="ia-calc" style="margin:0 0 14px">Último cálculo do job diário: ${fmtD(ia.calculado_em)}, às ${pad(new Date(ia.calculado_em).getHours())}:00. Fórmula da atenção versão ${ia.versao_formula}, política <span class="id" style="font-size:12px">inteligencia.atencao_ativo</span> ${esc(ia.versao_politica)}, limite ${pol.limite_atencao}. O resultado gravado de cada dia não é apagado.</p>
  <div class="filters">
    <select data-f="intel.estado" aria-label="Estado"><option value="abertos" ${f.estado === "abertos" ? "selected" : ""}>Abertos</option><option value="" ${!f.estado ? "selected" : ""}>Todos os estados</option>${Object.entries(IA_ESTADOS).map(([k, v]) => `<option value="${k}" ${f.estado === k ? "selected" : ""}>${v}</option>`).join("")}</select>
    <select data-f="intel.tipo" aria-label="Tipo"><option value="">Todos os tipos</option>${Object.entries(IA_TIPOS).map(([k, v]) => `<option value="${k}" ${f.tipo === k ? "selected" : ""}>${v}</option>`).join("")}</select>
    ${multi ? `<select data-f="intel.escopo" aria-label="Escopo"><option value="">Todo o seu escopo</option><option value="rede" ${f.escopo === "rede" ? "selected" : ""}>Insights de rede</option>${hotelOptions(f.escopo)}</select>` : ""}
    <select data-f="intel.faixa" aria-label="Faixa"><option value="">Todas as faixas</option>${["Crítico", "Alta atenção", "Atenção"].map(x => `<option ${f.faixa === x ? "selected" : ""}>${x}</option>`).join("")}</select>
  </div>
  <div class="panel" id="ia-lista"><div class="table-wrap"><table><thead><tr><th>Faixa</th><th>Insight</th><th>O que é</th><th>Escopo</th><th class="num">Score</th><th>Estado</th><th>Responsável</th><th>Última detecção</th></tr></thead>
    <tbody>${list.map(linha).join("") || `<tr><td colspan="8" class="empty">${vis.length ? "Nenhum insight com esses filtros." : "Nenhum insight no seu escopo."}</td></tr>`}</tbody></table></div>
    <p class="small muted" style="margin:0;padding:10px 14px">O insight sugere onde olhar; quem decide é uma pessoa. O possível problema sistêmico não tem score e entra na faixa Atenção. Você vê só o insight cujos hotéis você enxerga por inteiro.</p></div>
  <div class="panel" style="margin-top:16px" id="intel-ef"><div class="panel-h"><h2>Efetividade das intervenções</h2><span class="hint">Chamados no mesmo ativo, ${pol.efetividade.janela_dias} dias antes e ${pol.efetividade.janela_dias} dias depois</span></div><div class="panel-b table-wrap">${iaTabelaEfetividade(ef)}</div></div>
  <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Próximas versões</h2><span class="hint">Só nesta apresentação; não faz parte do produto</span></div><div class="panel-b" style="padding-top:0"><ul class="small" style="padding-left:18px;margin:0">
    <li><strong>1.5</strong>: impacto no hóspede, com feedback por CSV, API e webhook e classificação por IA. A IA só lê texto; nunca decide causa.</li>
    <li><strong>2.0</strong>: custo, reparar ou substituir, fabricantes e fornecedores, visão de rede.</li>
    <li><strong>3.0</strong>: agrupamento semântico, anomalias e previsão, com histórico suficiente.</li></ul></div></div>`;
}
/* Quem decide (packages/inteligencia, podeDecidirInsight): no insight de hotel, o Admin do grupo, o Gestor CSC e o
   Gerente que cobrem o hotel; no de rede, só o Admin do grupo e o Gestor CSC que cobrem todos os hotéis (escopo de
   grupo, ou da bandeira quando todos os hotéis são dela). O gerente nunca decide insight de rede. */
const IA_PAPEIS_QUE_DECIDEM = ["Admin do grupo", "Gestora do CSC", "Gestor CSC da bandeira", "Gestora CSC da bandeira", "Gerente de hotel"];
function iaPodeDecidir(i) {
  const p = persona(), e = p.escopo;
  if (!IA_PAPEIS_QUE_DECIDEM.includes(p.papel) || !iaVisiveis().includes(i)) return false;
  if (i.alcance.tipo === "hotel") { const h = i.hotel_ids[0]; return e.tipo === "grupo" || (e.tipo === "bandeira" && IDX.hotel[h].bandeira_id === e.id) || (e.tipo === "hotel" && e.id === h); }
  if (p.papel === "Gerente de hotel") return false;
  return e.tipo === "grupo" || (e.tipo === "bandeira" && i.alcance.bandeira_id === e.id);
}
const iaQuemDecide = i => i.alcance.tipo === "hotel" ? `O Admin do grupo, o Gestor CSC e o Gerente que cobrem o ${IDX.hotel[i.hotel_ids[0]].nome}.`
  : `Insight de rede: só o Admin do grupo e o Gestor CSC que cobrem todos os ${i.hotel_ids.length} hotéis${i.alcance.bandeira_id ? `, com escopo de grupo ou da bandeira ${IDX.band[i.alcance.bandeira_id].nome}` : ", com escopo de grupo"}. O gerente de hotel não decide insight de rede.`;
/* Os chamados ligados ao insight: os do ativo, ou os do mesmo modelo nos hotéis do insight. Só os do escopo de quem lê. */
function iaChamadosDoInsight(i) {
  const chs = scoped(DB.chamados).filter(c => c.status !== "Cancelado" && c.ativo_id);
  if (i.tipo === "atencao_ativo") return chs.filter(c => c.ativo_id === i.escopo.ativo_id);
  const norm = s => (s || "").normalize("NFD").replace(/\p{M}/gu, "").trim().replace(/\s+/g, " ").toLowerCase();
  const chave = a => a.categoria_id + "#" + norm(a.fabricante) + "|" + norm(a.modelo);
  return chs.filter(c => i.hotel_ids.includes(c.hotel_id) && chave(IDX.ativo[c.ativo_id]) === i.escopo.chave);
}
/* Barras simples em SVG, com o resumo no aria-label; os números também ficam em texto, logo abaixo. */
function iaBarras(vals, rotulos, resumo) {
  const w = 600, h = 120, max = Math.max(1, ...vals), bw = w / vals.length;
  return `<svg viewBox="0 0 ${w} ${h + 18}" role="img" aria-label="${esc(resumo)}" style="width:100%;height:auto;display:block">
    ${vals.map((v, k) => `<rect x="${k * bw + 4}" y="${h - v / max * (h - 12)}" width="${bw - 8}" height="${v / max * (h - 12)}" rx="3" style="fill:var(--amber)"/><text x="${k * bw + bw / 2}" y="${h + 14}" text-anchor="middle" style="fill:var(--steel);font-size:11px">${rotulos[k]}</text>`).join("")}</svg>`;
}
function iaPaginaInsight(id) {
  const i = IDX.ins[id];
  const voltar = `<p style="margin:0 0 12px"><a href="#/inteligencia">← Insights</a></p>`;
  if (!i || !iaVisiveis().includes(i)) return `${voltar}<div class="panel empty">Este insight não existe ou não está no seu escopo: só quem enxerga todos os hotéis de um insight consegue abri-lo.</div>`;
  const pol = polGrupo().inteligencia, sub = iaSubstituicao(i), ant = sub.substitui && IDX.ins[sub.substitui], pode = iaPodeDecidir(i), form = UI.iaForm && UI.iaForm.id === i.id ? UI.iaForm : null;
  const at = i.tipo === "atencao_ativo" ? IDX.ativo[i.escopo.ativo_id] : null, chs = iaChamadosDoInsight(i), now = Date.now();
  // série: chamados por semana nas últimas 12 semanas
  const sem = [...Array(12)].map((_, k) => { const fim = now - (11 - k) * 7 * D, ini = fim - 7 * D; return { ini, n: chs.filter(c => t(c.aberto_em) > ini && t(c.aberto_em) <= fim).length }; });
  const rot = sem.map(x => { const d = new Date(x.ini + D); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; });
  // efetividade: intervenções nos ativos do insight, encerradas depois da primeira decisão de aceitar ou agir
  const dec = i.historico.find(h => h.tipo === "acao" && ["aceitar", "agir"].includes(h.acao));
  const ef = dec ? efetividade(chs.filter(c => c.intervencao && c.encerrado_em && t(c.encerrado_em) > t(dec.t))) : [];
  const acoes = Object.entries(IA_ACOES).filter(([, A]) => A.de.includes(i.estado));
  const ev = i.evidencia, mm = pol.sistemico.mesmo_modelo;
  const porQue = i.tipo === "sistemico"
    ? `<p style="margin-top:0"><strong>${esc(ev.regra)}.</strong> ${esc(ev.evid)}</p>
       <p class="small">A regra pede pelo menos ${mm.min_hoteis} hotéis, ${mm.min_chamados} chamados em ${mm.janela_dias} dias e ${mm.min_ativos} ativos do mesmo modelo, com uma taxa de pelo menos ${mm.taxa_vezes_base} vezes a dos outros modelos da mesma categoria, e nunca menos de ${fmt1(mm.taxa_minima)} chamado por ativo. ${esc(ev.quem)}.</p>
       <p class="small muted" style="margin-bottom:0">É um sinal, e não uma conclusão: o mesmo problema em vários lugares pode apontar para o modelo, a área ou o fornecedor. Só uma pessoa confirma.</p>`
    : `<p style="margin-top:0">Atenção <strong>${ev.valor}</strong> na última detecção (${esc(ev.faixa)}), acima do limite de ${ev.limite}. O que mais pesou:</p>
       <ul class="small" style="padding-left:18px">${ev.top.map(([n, m]) => `<li><strong>${esc(n)}</strong>: ${esc(m)}</li>`).join("")}</ul>
       <p class="small muted" style="margin-bottom:0">O score mostra o que pesou, e não a causa. A decisão de reparar ou substituir é da equipe.</p>`;
  const resumoAtivo = at ? (() => { const g = iaGravado(at.id); return `<div class="panel" style="margin-top:16px"><div class="panel-h"><h2>O ativo</h2></div><div class="panel-b" style="padding-top:0"><dl class="kv">
      <dt>Ativo</dt><dd><a href="#" data-act="open-at" data-id="${at.id}">${esc(at.nome)}</a> <span class="id">${at.id}</span></dd><dt>Hotel e local</dt><dd>${esc(IDX.hotel[at.hotel_id].nome)}, ${esc(IDX.local[at.local_id].nome)}</dd>
      <dt>Categoria</dt><dd>${esc(IDX.cat[at.categoria_id].nome)}</dd><dt>Fabricante e modelo</dt><dd>${esc(at.fabricante)}${at.modelo ? ", " + esc(at.modelo) : ""}</dd><dt>Criticidade</dt><dd>${critBadge(at.criticidade)}</dd>
      <dt>Atenção gravada hoje</dt><dd>${g ? `${g.score} (${esc(g.faixa)}). <a href="#/inteligencia?ativo=${at.id}" id="ia-ver-ativo">Ver a atenção do ativo</a>` : "—"}</dd><dt>Chamados em 90 dias</dt><dd>${chs.filter(c => t(c.aberto_em) > now - 90 * D).length}</dd></dl></div></div>`; })() : "";
  const tabelaChamados = i.tipo === "sistemico" ? (() => { const ids = new Set(ev.chamado_ids), lista = chs.filter(c => ids.has(c.id)).sort((a, b) => b.aberto_em.localeCompare(a.aberto_em)); return `<div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Chamados que levaram ao insight</h2><span class="hint">Só os dos hotéis do seu escopo</span></div><div class="panel-b table-wrap"><table><thead><tr><th>Chamado</th><th>O que aconteceu</th><th>Hotel</th><th>Ativo</th><th>Aberto em</th><th>Situação</th></tr></thead><tbody>
      ${lista.map(c => `<tr class="click" data-act="open-ch" data-id="${c.id}"><td><span class="id">${c.id}</span></td><td>${esc(c.titulo)}</td><td class="small">${esc(IDX.hotel[c.hotel_id].nome)}</td><td class="small">${esc(IDX.ativo[c.ativo_id].nome)}<div class="muted">${esc(IDX.local[c.local_id].nome)}</div></td><td class="small">${fmtD(c.aberto_em)}</td><td>${statusBadge(c.status)}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">Nenhum chamado no seu escopo.</td></tr>'}</tbody></table></div></div>`; })() : "";
  const recalc = at && UI.iaRecalc === i.id ? (() => { const r = intelAtivo(at), g = iaGravado(at.id); return `<div class="readonly-note" style="margin-top:10px"><span><strong>Recálculo de agora, com a política atual (${esc(pol.versao)}): atenção ${r.score} (${esc(r.faixa)}).</strong> Não é gravado e não muda o insight. O resultado gravado hoje às ${pad(new Date(DB.ia.calculado_em).getHours())}:00 continua valendo: ${g ? g.score : "—"}.</span></div>`; })() : "";
  const formHtml = form ? `<div class="field" style="margin-top:12px">${form.acao === "descartar" ? `<label for="ia-motivo">Motivo do descarte</label><select id="ia-motivo"><option value="nao_relevante">${IA_MOTIVOS.nao_relevante}</option><option value="substituido">${IA_MOTIVOS.substituido}</option></select>
      <p class="small muted" style="margin:6px 0 10px">"Não relevante" silencia este problema por 30 dias, a menos que a faixa suba.</p>` : ""}
      <label for="ia-nota">Nota (obrigatória)</label><textarea id="ia-nota" maxlength="500" placeholder="Por que ${form.acao === "descartar" ? "descartar" : "resolver"} este insight"></textarea></div>
      <div class="row"><button class="btn primary" data-act="ia-confirmar" data-id="${i.id}">${IA_ACOES[form.acao].rot}</button><button class="btn" data-act="ia-cancelar">Cancelar</button></div>` : "";
  const decisao = `<div class="panel" id="ia-decisao"><div class="panel-h"><h2>Decisão</h2></div><div class="panel-b" style="padding-top:0">
      <p style="margin-top:0"><span class="badge ${iaEstadoCls(i.estado)}">${IA_ESTADOS[i.estado]}</span>${i.estado === "descartado" ? ` <span class="small muted">${IA_MOTIVOS[i.motivo_descarte]}</span>` : ""}</p>
      <p class="small">Responsável: ${i.responsavel_id ? esc(nomeUser(i.responsavel_id)) : '<span class="muted">sem responsável</span>'}</p>
      ${!iaAberto(i) ? `<p class="small muted">Encerrado em ${fmtD(i.encerrado_em)}. Um problema que volta abre um insight novo, ligado a este.</p>`
        : pode ? `<div class="row" style="flex-wrap:wrap;gap:8px">${acoes.map(([k, A]) => `<button class="btn ${k === "descartar" ? "" : "primary"}" data-act="ia-acao" data-acao="${k}" data-id="${i.id}" ${form && form.acao === k ? 'aria-pressed="true"' : ""}>${A.rot}</button>`).join("")}</div>${formHtml}`
        : `<p class="small"><strong>Você não decide este insight.</strong> Pode acompanhar a evidência e o histórico.</p>`}
      <p class="small muted" style="margin-bottom:0"><strong>Quem decide:</strong> ${esc(iaQuemDecide(i))}</p></div></div>`;
  const historico = `<div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Histórico</h2></div><div class="panel-b" style="padding-top:0"><ul class="timeline">
      ${i.historico.slice().reverse().map(h => h.tipo === "job" ? `<li class="sys"><div class="when">${fmtDT(h.t)}</div>${esc(h.txt)}</li>`
        : `<li><div class="when">${fmtDT(h.t)}</div><strong>${esc(nomeUser(h.usuario_id))}</strong>: ${IA_ACOES[h.acao].rot.toLowerCase()} (${IA_ESTADOS[h.de]} → ${IA_ESTADOS[h.para]})${h.motivo ? `. Motivo: ${IA_MOTIVOS[h.motivo]}` : ""}${h.nota ? `<div class="small muted">${esc(h.nota)}</div>` : ""}</li>`).join("")}</ul></div></div>`;
  return `${voltar}<div class="ia-aviso" role="note"><strong>Prévia com dados fictícios.</strong> O insight, os chamados e as decisões são inventados para a demonstração.</div>
  <div class="panel" style="margin-top:12px" id="ia-cabecalho"><div class="panel-b">
    <div class="small muted">${IA_TIPOS[i.tipo]} <span class="id">${i.id}</span></div>
    <h2 style="margin:4px 0 6px">${esc(iaTitulo(i))} <span class="badge ${iaFaixaCls(i.faixa)}">${esc(i.faixa)}</span>${i.valor !== null ? ` <span class="badge b-outline">Score ${i.valor}</span>` : ""}</h2>
    <div class="small">${esc(iaEscopoTxt(i))}${i.alcance.tipo === "rede" ? `: ${i.hotel_ids.map(h => esc(IDX.hotel[h].nome)).join(", ")}` : ""}</div>
    <div class="small muted">Aberto em ${fmtD(i.aberto_em)}. Última detecção em ${fmtD(i.ultima_deteccao_em)}.${i.encerrado_em ? ` Encerrado em ${fmtD(i.encerrado_em)}.` : ""}</div>
    ${ant ? `<p class="small" style="margin:8px 0 0">Este insight substitui o <a href="#/inteligencia?ins=${ant.id}">${ant.id}</a>${iaAberto(ant) ? `, que continua ${IA_ESTADOS[ant.estado].toLowerCase()}` : ""}.</p>` : ""}
    ${sub.substituidoPor ? `<p class="small" style="margin:8px 0 0">Substituído pelo insight <a href="#/inteligencia?ins=${sub.substituidoPor}">${sub.substituidoPor}</a>, que inclui mais hotéis.</p>` : ""}
  </div></div>
  <div class="grid g-3-1" style="align-items:start;margin-top:16px">
    <div>
      <div class="panel" id="ia-porque"><div class="panel-h"><h2>Por que estou vendo isso?</h2></div><div class="panel-b" style="padding-top:0">${porQue}
        ${at ? `<div class="row" style="margin-top:12px"><button class="btn sm" data-act="ia-recalc" data-id="${i.id}" aria-expanded="${UI.iaRecalc === i.id}">${UI.iaRecalc === i.id ? "Esconder o recálculo" : "Recalcular com a política atual"}</button></div>${recalc}` : ""}</div></div>
      <div class="panel" style="margin-top:16px" id="ia-serie"><div class="panel-h"><h2>Chamados por semana</h2><span class="hint">Últimas 12 semanas${i.tipo === "sistemico" ? ", do mesmo modelo nos hotéis do insight que você enxerga" : ", neste ativo"}</span></div><div class="panel-b">
        ${iaBarras(sem.map(x => x.n), rot, `Chamados por semana nas últimas 12 semanas: ${sem.map(x => x.n).join(", ")}`)}
        <p class="small muted" style="margin:8px 0 0">Em números, semana a semana: ${sem.map((x, k) => `${rot[k]}: ${x.n}`).join("; ")}.</p></div></div>
      ${tabelaChamados}${resumoAtivo}
      ${ef.length ? `<div class="panel" style="margin-top:16px" id="ia-ef-insight"><div class="panel-h"><h2>Efetividade da intervenção</h2><span class="hint">Intervenção registrada depois da decisão de ${fmtD(dec.t)}</span></div><div class="panel-b table-wrap">${iaTabelaEfetividade(ef)}</div></div>` : ""}
    </div>
    <div>${decisao}${historico}</div>
  </div>`;
}
/* Atenção nos últimos 90 dias: uma linha por dia gravado, sobre as faixas e a linha do limite do insight. */
function iaGraficoAtencao(serie, limite, rotulo) {
  const w = 600, h = 160, n = serie.length, x = k => k * w / (n - 1), y = v => h - v / 100 * h;
  const faixas = IA_FAIXAS.map(([de, nome], k) => [de, (IA_FAIXAS[k + 1] || [100])[0], nome]);
  const cor = { "Normal": "transparent", "Observar": "var(--tint-2)", "Atenção": "rgba(240,165,0,.10)", "Alta atenção": "rgba(240,165,0,.18)", "Crítico": "rgba(255,90,95,.16)" };
  const pts = serie.map((v, k) => v === null ? null : `${x(k).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean).join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(rotulo)}" style="width:100%;height:160px;display:block">
    ${faixas.map(([de, ate, nome]) => `<rect x="0" y="${y(ate)}" width="${w}" height="${y(de) - y(ate)}" style="fill:${cor[nome]}"/>`).join("")}
    <line x1="0" x2="${w}" y1="${y(limite)}" y2="${y(limite)}" style="stroke:var(--amber)" stroke-width="1.5" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>
    <polyline points="${pts}" fill="none" style="stroke:var(--head)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}
/* Detalhe do ativo: a vista do score, aberta pela página do insight ou pela ficha do ativo. Não decide nada. */
function iaPaginaAtivo(id) {
  const a = IDX.ativo[id], voltar = `<p style="margin:0 0 12px"><a href="#/inteligencia">← Insights</a></p>`;
  if (!a || !scoped([a]).length) return `${voltar}<div class="panel empty">Este ativo não existe ou não está no seu escopo.</div>`;
  const pol = polGrupo().inteligencia, ia = DB.ia, g = iaGravado(a.id), serie = ia.serie[a.id] || [], lim = pol.limite_atencao;
  if (!g) return `${voltar}<div class="panel empty">Ainda não há resultado gravado para ${esc(a.nome)}: o job diário calcula o ativo novo na próxima execução.</div>`;
  const dia = k => { const d = new Date(t(ia.inicio) + k * D); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
  const vals = serie.map((v, k) => [v, k]).filter(([v]) => v !== null), min = vals.reduce((m, p) => p[0] < m[0] ? p : m, vals[0]), max = vals.reduce((m, p) => p[0] > m[0] ? p : m, vals[0]);
  const acima = vals.filter(([v]) => v >= lim).length;
  const resumo = `Atenção gravada hoje ${g.score}; mínima de ${min[0]} em ${dia(min[1])}; máxima de ${max[0]} em ${dia(max[1])}; ${acima} de ${vals.length} dias no limite de ${lim} ou acima.`;
  const comp = g.comp.filter(c => c.peso > 0), uh = g.comp.filter(c => c.peso === 0 && c.valor === null), sd = comp.filter(c => c.valor === null);
  const top = comp.filter(c => c.valor !== null && c.pontos > 0).sort((x, y) => y.pontos - x.pontos).slice(0, 3);
  const comp90 = DB.chamados.filter(c => c.ativo_id === a.id && c.status !== "Cancelado" && t(c.aberto_em) > Date.now() - 90 * D);
  const ins = iaVisiveis().filter(i => i.escopo.ativo_id === a.id).sort((x, y) => t(y.aberto_em) - t(x.aberto_em));
  const ef = efetividade(scoped(DB.chamados).filter(c => c.ativo_id === a.id));
  const ind = (lab, val, foot, cls) => `<div class="panel inst ${cls || ""}"><div class="lab">${lab}</div><div class="val">${val}</div><div class="foot">${foot}</div></div>`;
  const horas = g.horas == null ? "—" : fmt1(g.horas), imp = g.impacto == null ? "—" : g.impacto + "%";
  return `${voltar}<div class="ia-aviso" role="note"><strong>Prévia com dados fictícios.</strong> O ativo, os chamados e os resultados gravados são inventados para a demonstração.</div>
  <div class="panel" style="margin-top:12px" id="ia-ativo-cab"><div class="panel-b">
    <div class="small muted">Atenção ao ativo <span class="id">${a.id}</span></div>
    <h2 style="margin:4px 0 6px">${esc(a.nome)} <span class="badge ${iaFaixaCls(g.faixa)}">${esc(g.faixa)}</span></h2>
    <div class="small">${esc(IDX.hotel[a.hotel_id].nome)}, ${esc(IDX.local[a.local_id].nome)}. ${esc(IDX.cat[a.categoria_id].nome)}: ${esc(a.fabricante)}${a.modelo ? ", " + esc(a.modelo) : ""}.</div>
    <p class="small" style="margin:8px 0 0"><a href="#" data-act="open-at" data-id="${a.id}">Abrir a ficha do ativo</a></p></div></div>
  <div class="grid g-4" style="margin:14px 0 16px">
    ${ind("Atenção", `${g.score}<small>de 100</small>`, `${esc(g.faixa)}. O insight abre a partir de ${lim}.`, g.score >= lim ? "warn" : "")}
    ${ind("Criticidade", `${a.criticidade}<small>de 5</small>`, esc(critNome(a.criticidade)) + ".")}
    ${ind("Horas paradas", `${horas}<small>h</small>`, "Nos últimos 90 dias.")}
    ${ind("Impacto em hóspedes", imp, `Dos ${comp90.length} chamados dos últimos 90 dias.`)}
  </div>
  <div class="grid g-3-1" style="align-items:start">
    <div>
      <div class="panel" id="ia-ativo-porque"><div class="panel-h"><h2>Por que estou vendo isso?</h2></div><div class="panel-b" style="padding-top:0">
        ${top.length ? `<ul class="small" style="padding-left:18px;margin-top:0">${top.map(c => `<li><strong>${esc(c.nome)}</strong>: ${esc(c.medido)}</li>`).join("")}</ul>` : '<p class="small">Nenhum fator pesou neste score.</p>'}
        <p class="small muted" style="margin-bottom:0">O score mostra o que pesou, e não a causa. A decisão de reparar ou substituir é da equipe, na página do insight.</p></div></div>
      <div class="panel" style="margin-top:16px" id="ia-grafico"><div class="panel-h"><h2>Atenção nos últimos 90 dias</h2><span class="hint">Um valor por dia gravado, sobre as faixas; a linha tracejada é o limite do insight (${lim})</span></div><div class="panel-b">
        ${iaGraficoAtencao(serie, lim, resumo)}
        <div class="row small muted" style="justify-content:space-between;margin-top:4px"><span>${dia(0)}</span><span>${dia(serie.length - 1)}</span></div>
        <p class="small" style="margin:8px 0 0">${esc(resumo)}</p>
        <details class="small" style="margin-top:6px"><summary>Ver os ${serie.length} valores, dia a dia</summary><p class="muted" style="margin:6px 0 0">${serie.map((v, k) => `${dia(k)}: ${v === null ? "—" : v}`).join("; ")}.</p></details></div></div>
      <div class="panel" style="margin-top:16px" id="ia-composicao"><div class="panel-h"><h2>Como o score foi composto</h2></div><div class="panel-b table-wrap" style="padding-top:0">
        <table><thead><tr><th>Componente</th><th>Medido</th><th class="num">Valor</th><th class="num">Peso</th><th class="num">Peso usado</th><th class="num">Pontos</th></tr></thead><tbody>
        ${comp.map(c => c.valor === null
          ? `<tr><td>${esc(c.nome)}</td><td class="small muted">${esc(c.medido)}</td><td class="num">—</td><td class="num">${Math.round(c.peso * 100)}%</td><td class="num">—</td><td class="num">0,0</td></tr>`
          : `<tr><td>${esc(c.nome)}</td><td class="small">${esc(c.medido)}</td><td class="num">${Math.round(c.valor * 100)}</td><td class="num">${Math.round(c.peso * 100)}%</td><td class="num">${fmt1(c.pesoEf * 100)}%</td><td class="num"><strong>${fmt1(c.pontos)}</strong></td></tr>`).join("")}
        <tr><td colspan="5"><strong>Atenção</strong></td><td class="num"><strong>${g.score}</strong></td></tr></tbody></table>
        ${sd.length ? `<p class="small" style="margin:8px 0 0">Sem dado: ${sd.map(c => esc(c.nome.toLowerCase())).join(", ")}. ${sd.length === 1 ? "O peso dele" : "O peso deles"} (${Math.round(sd.reduce((s, c) => s + c.peso, 0) / comp.reduce((s, c) => s + c.peso, 0) * 100)}%) foi dividido entre os componentes que têm dado, na proporção dos pesos.</p>` : ""}
        ${uh.length ? `<p class="small muted" style="margin:6px 0 0" id="ia-uh">Ainda sem dado: ${uh.map(c => `${c.k === "uh_dias" ? "UH-dias" : esc(c.nome)} (peso 0)`).join(", ")}.</p>` : ""}</div></div>
      <div class="panel" style="margin-top:16px" id="ia-ativo-ef"><div class="panel-h"><h2>Intervenções neste ativo</h2><span class="hint">Chamados no mesmo ativo, ${pol.efetividade.janela_dias} dias antes e ${pol.efetividade.janela_dias} dias depois</span></div><div class="panel-b table-wrap">${iaTabelaEfetividade(ef, "Nenhuma intervenção marcada neste ativo.")}</div></div>
    </div>
    <div>
      <div class="panel" id="ia-gravado"><div class="panel-h"><h2>Como este resultado foi gravado</h2></div><div class="panel-b" style="padding-top:0"><dl class="kv">
        <dt>Calculado em</dt><dd>${fmtD(ia.calculado_em)}, às ${pad(new Date(ia.calculado_em).getHours())}:00</dd>
        <dt>Cálculo</dt><dd>Original, do job diário</dd>
        <dt>Fórmula</dt><dd>Atenção ao ativo, versão ${ia.versao_formula}</dd>
        <dt>Política</dt><dd><span class="id" style="font-size:12px">inteligencia.atencao_ativo</span> ${esc(ia.versao_politica)}, limite ${lim}</dd></dl>
        <p class="small muted" style="margin-bottom:0">O resultado gravado de cada dia não muda. O recálculo com a política atual fica na página do insight, sob demanda.</p></div></div>
      <div class="panel" style="margin-top:16px" id="ia-ativo-insights"><div class="panel-h"><h2>Insights deste ativo</h2></div><div class="panel-b" style="padding-top:0">
        ${ins.map(i => `<p style="margin:0 0 8px"><a href="#/inteligencia?ins=${i.id}">${i.id}</a> <span class="badge ${iaEstadoCls(i.estado)}">${IA_ESTADOS[i.estado]}</span><br><span class="small muted">Aberto em ${fmtD(i.aberto_em)}; última detecção em ${fmtD(i.ultima_deteccao_em)}.</span></p>`).join("") || '<p class="small muted" style="margin:0">Nenhum insight deste ativo no seu escopo.</p>'}</div></div>
    </div>
  </div>`;
}
/* A tabela de efetividade, usada na lista, na página do ativo e na página do insight. */
function iaTabelaEfetividade(ef, vazio = "Nenhuma intervenção marcada no seu escopo.") {
  return `<table><thead><tr><th>Intervenção</th><th>Ativo</th><th>Quando</th><th class="num">Chamados antes</th><th class="num">Chamados depois</th><th class="num">Horas paradas</th><th>Variação observada</th></tr></thead><tbody>
    ${ef.map(e => `<tr class="click" data-act="open-ch" data-id="${e.c.id}"><td>${esc(e.c.titulo)}<div class="small muted">${esc(nomeExec(e.c.executado_por))}${e.c.custo != null ? ", " + brl(e.c.custo) : ""}</div></td><td class="small">${esc(IDX.ativo[e.c.ativo_id].nome)}<div class="muted">${esc(IDX.hotel[e.c.hotel_id].nome)}</div></td><td class="small">${fmtD(e.c.encerrado_em)}</td><td class="num">${e.ch.antes}</td><td class="num">${e.ch.depois}${e.completa ? "" : '<div class="small muted">janela em curso</div>'}</td><td class="num small">${fmt1(e.hr.antes)} → ${fmt1(e.hr.depois)}</td><td><span class="badge ${e.res[1]}">${e.res[0]}</span><div class="small muted" style="max-width:34ch">${esc(e.expl)}</div></td></tr>`).join("") || `<tr><td colspan="7" class="empty">${vazio}</td></tr>`}
  </tbody></table><p class="small muted" style="margin:10px 0 0">É a variação observada nos chamados depois da intervenção. Ela não prova que a intervenção foi a causa.</p>`;
}

/* ---------- Roadmap ---------- */
function pageRoadmap() {
  const col = (cls, titulo, itens, nota) => `<div class="panel roadmap-col ${cls}" style="padding:16px 20px"><h3 style="margin-top:0">${titulo}</h3><ul class="small">${itens.map(i => `<li>${i}</li>`).join("")}</ul>${nota ? `<p class="small muted">${nota}</p>` : ""}</div>`;
  const CRIT = [["Abrir um chamado em até 30 segundos e 3 toques a partir do QR", "Cronômetro no celular do técnico, nos 4 hotéis"], ["Nenhuma OS ou foto perdida na execução sem rede", "Teste cortando o sinal no meio do fluxo"], ["Relógio de SLA respeitando o calendário da categoria", "Elevador parado conta 24x7; pintura conta em horário comercial"], ["Hotel novo implantado a partir do pacote da bandeira em até 1 dia", "Sem contar o levantamento de ativos"], ["Carga de ativos por planilha com validação e relatório de erros", "Planilha real de um hotel do piloto"], ["Sincronização com o sistema hoteleiro com atraso máximo definido e monitorado", "Painel de saúde do conector; referência de 5 minutos"], ["Adoção pelos técnicos acima de 80% em 60 dias", "Chamados pelo sistema contra o total conhecido"]];
  return `<p style="max-width:80ch;margin-top:0">O HubKeep funciona sem nenhuma integração: o sistema hoteleiro, o EasyGov e as fontes de feedback só acrescentam contexto. Toda exigência do cliente vira configuração ou política, nunca regra fixa no código.</p>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
    ${col("", "MVP, neste protótipo", ["Chamados com triagem, SLA, atribuição, aceite com assinatura e reabertura", "OS com checklist tipado, fotos antes e depois, horas e execução sem rede", "Preventiva por tempo, com OS gerada no fuso do hotel", "Políticas com herança grupo, bandeira e hotel, e calendário de SLA por categoria", "Modelo contratual do hotel e arrendado com matriz de responsabilidade", "UH indisponível e UH-dias perdidos", "Pacote da bandeira, importação de ativos e etiquetas QR em lote", "Indicadores, auditoria, impressão e exportação respeitando o escopo", "Leitura do PMS; quatro idiomas (pt-BR, inglês, espanhol, francês)"])}
    ${col("f2", "Logo depois do MVP", ["<strong>Fase 1d, a reavaliar:</strong> conformidade legal antes do rollout, com PMOC, AVCB, SPDA, NR-13, elevadores, reservatórios, potabilidade, piscina, dedetização e gás, com vencimento, responsável e evidência", "<strong>Primeira integração:</strong> EasyGov e status da UH. A camareira abre o chamado na rotina da governança, e a UH volta para inspeção quando a OS fecha", "Reconciliação do status da UH; bloqueio automático só com mecanismo homologado pelo fornecedor do PMS", "HubKeep Intelligence 1.0, perto ou durante o piloto"])}
    ${col("f2", "Fase 2", ["Contexto da UH (ocupação prevista) e inspeções com OS automática", "WhatsApp e portal do fornecedor", "Custos e alçadas, inclusive a aprovação do proprietário no administrado", "Estoque e compras; componente do ativo", "IA de apoio: voz para OS e triagem", "Afiliados e relatório ao proprietário", "Escrita no sistema hoteleiro, se homologada"])}
    ${col("f3", "Fase 3", ["Utilidades com sensores", "Plano de CAPEX", "Manutenção preditiva sobre o histórico acumulado"], "A preditiva por aprendizado de máquina não é vendida antes da fase 3: sem 12 meses ou mais de histórico limpo e sem sensores, ela não funciona.")}
  </div>
  <div class="panel" style="margin-top:18px" id="criterios"><div class="panel-h"><h2>Critérios de aceite do piloto</h2><span class="hint">Entram no contrato do piloto e são medidos, não declarados. Piloto em 4 hotéis: urbano próprio, econômico, administrado e arrendado.</span></div>
  <div class="panel-b table-wrap"><table><thead><tr><th>Critério</th><th>Como se mede</th></tr></thead><tbody>${CRIT.map(c => `<tr><td>${esc(c[0])}</td><td class="small">${esc(c[1])}</td></tr>`).join("")}</tbody></table></div></div>`;
}

const PAGES = { indicadores: pageIndicadores, fornecedores: pageFornecedores, inteligencia: pageInteligencia, painel: pageDashboard, chamados: pageChamados, os: pageOS, preventiva: pagePreventiva, ativos: pageAtivos, implantacao: pageImplantacao, hoteis: pageHoteis, politicas: pagePoliticas, integracao: pageIntegracao, usuarios: pageUsuarios, auditoria: pageAuditoria, tecnico: pageTecnico, roadmap: pageRoadmap };

/* ---------- Gaveta ---------- */
function openDrawer(id, page) {
  closeDrawer(false);
  let html;
  if (id.startsWith("CH-") && IDX.ch[id]) { if (!scoped([IDX.ch[id]]).length) return; html = drawerChamado(IDX.ch[id]); }
  else if (id.startsWith("OS-") && IDX.os[id]) { if (!scoped([IDX.os[id]]).length) return; html = drawerOS(IDX.os[id]); }
  else if (id.startsWith("AT-") && IDX.ativo[id]) { if (!scoped([IDX.ativo[id]]).length) return; html = drawerAtivo(IDX.ativo[id]); }
  else return;
  const bg = document.createElement("div"); bg.className = "drawer-bg"; bg.dataset.act = "close";
  const dr = document.createElement("aside"); dr.className = "drawer"; dr.setAttribute("role", "dialog"); dr.setAttribute("aria-modal", "true"); dr.innerHTML = html;
  document.body.append(bg, dr);
  const c = dr.querySelector(".close"); if (c) c.focus();
}
function closeDrawer(updateHash = true) {
  document.querySelectorAll(".drawer, .drawer-bg").forEach(e => e.remove());
  if (updateHash) { const { page, params } = route(); delete params.id; const qs = new URLSearchParams(params).toString(); history.replaceState(null, "", "#/" + page + (qs ? "?" + qs : "")); }
}
function refreshDrawer(id) { const { page } = route(); render(); if (!route().params.id) openDrawer(id, page); }
function showItem(id) { const { page, params } = route(); go(page, { ...params, id }); }

/* ---------- Eventos ---------- */
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  if (el.tagName === "A" || el.tagName === "BUTTON") { if (el.getAttribute("href") === "#") e.preventDefault(); }
  switch (a) {
    case "reset": if (confirm("Restaurar todos os dados iniciais da demonstração?")) resetDemo(); break;
    case "menu": $("#sidebar").classList.toggle("open"); break;
    case "open-ch": case "open-os": case "open-at": e.preventDefault(); showItem(id); break;
    case "close": if (e.target === el || el.classList.contains("close")) closeDrawer(); break;
    case "theme": UI.theme = UI.theme === "light" ? "dark" : "light"; applyTheme(); try { localStorage.setItem(THEME_KEY, UI.theme); } catch (e2) { } render(); break;
    case "nc-foto": { UI.ncFotos++; const p = document.createElement("div"); p.className = "photo"; p.textContent = "Foto " + UI.ncFotos; $("#nc-photos").insertBefore(p, el); break; }
    case "triar": { const c = IDX.ch[id]; if (triar(c)) { toast(`${c.id} classificado: prioridade ${c.prioridade}, prazo de ${c.sla_h} h`); refreshDrawer(id); } break; }
    case "parada": { const c = IDX.ch[id], at = IDX.ativo[c.ativo_id], pa = paradaAberta(at.id), now = new Date().toISOString();
      if (pa) { pa.fim = now; at.status = "Operando"; logEvent(c, "sistema", "Equipamento de volta à operação após " + dur((t(now) - t(pa.inicio)) / H)); }
      else { DB.ativo_parada.push({ id: "PA-" + (DB.ativo_parada.length + 1), ativo_id: at.id, chamado_id: c.id, inicio: now, fim: null, motivo: c.titulo }); at.status = "Parado"; logEvent(c, "sistema", "Parada do equipamento registrada"); }
      save(); toast(pa ? "Retorno à operação registrado" : "Parada registrada"); refreshDrawer(id); break; }
    case "aceite": { const c = IDX.ch[id]; if (executorDe(c) === UI.persona) { toast("Quem executou não aceita o próprio serviço"); break; } document.body.insertAdjacentHTML("beforeend", modalAceite(c)); ligarAssinatura($("#ac-sig")); break; }
    case "ac-limpar": { const cv = $("#ac-sig"); cv.__g.clearRect(0, 0, cv.width, cv.height); delete cv.dataset.ok; break; }
    case "ac-save": { const c = IDX.ch[id]; if (salvarAceite(c)) { closeModal(); toast(`${c.id} encerrado com aceite assinado`); refreshDrawer(id); } break; }
    case "uh-indisp": { const c = IDX.ch[id], now = new Date().toISOString(), u = c.uh_indisp;
      if (u && !u.fim) { u.fim = now; logEvent(c, "sistema", `UH liberada após ${dur((t(now) - t(u.inicio)) / H)} indisponível`); }
      else if (u) { u.fim = null; logEvent(c, "sistema", "Período de UH indisponível reaberto"); }
      else { c.uh_indisp = { inicio: now, fim: null }; logEvent(c, "sistema", "Período de UH indisponível iniciado"); }
      save(); toast(c.uh_indisp.fim ? "UH liberada" : "UH registrada como indisponível"); refreshDrawer(id); break; }
    case "pkg-apply": { const ab = DB.aberturas.find(x => x.id === id), pk = DB.pacotes.find(p => p.bandeira_id === ab.bandeira_id), now = new Date().toISOString();
      ab.passos.pacote = now; ab.pacote_versao = pk.versao;
      DB.auditoria.unshift({ t: now, usuario: persona().nome, entidade: "Hotel", registro: ab.id, hotel_id: null, acao: `Pacote ${IDX.band[ab.bandeira_id].nome} ${pk.versao} aplicado ao ${ab.nome}: ${pk.modelos.length} modelos e ${pk.planos.length} planos` });
      save(); toast(`Pacote aplicado ao ${ab.nome}`); render(); break; }
    case "forn-novo": document.body.insertAdjacentHTML("beforeend", modalFornecedor()); $("#fo-nome").focus(); break;
    case "forn-save": { const nome = $("#fo-nome").value.trim(), cn = $("#fo-cnpj").value.trim();
      if (!nome) { $("#fo-nome").focus(); toast("Informe o nome do fornecedor"); break; }
      if (cn.replace(/\D/g, "").length !== 14) { $("#fo-cnpj").focus(); toast("O CNPJ precisa ter 14 dígitos"); break; }
      const d = cn.replace(/\D/g, ""), f = { id: "f" + (DB.fornecedores.length + 1), nome, cnpj: `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`, categorias: [$("#fo-cat").value], telefone: $("#fo-tel").value.trim() || "—", email: $("#fo-mail").value.trim() || "—", ativo: true };
      DB.fornecedores.push(f); IDX.forn[f.id] = f;
      DB.auditoria.unshift({ t: new Date().toISOString(), usuario: persona().nome, entidade: "Fornecedor", registro: f.id, hotel_id: null, acao: "Fornecedor cadastrado: " + nome });
      save(); closeModal(); toast("Fornecedor cadastrado"); render(); break; }
    case "csv-ch": { const l = chamadosFiltrados(); downloadCSV("chamados.csv", ["Chamado", "Título", "Hotel", "Local", "Categoria", "Prioridade", "Situação", "Aberto em", "Prazo", "Encerrado em", "Origem", "Impacto no hóspede", "Executado por", "Custo"], l.map(c => [c.id, c.titulo, IDX.hotel[c.hotel_id].nome, IDX.local[c.local_id].nome, catNome(c.categoria_id), c.prioridade, c.status, fmtDT(c.aberto_em), fmtDT(c.prazo_sla), fmtDT(c.encerrado_em), c.origem || "", c.impacto_hospede ? "Sim" : "Não", c.executado_por ? nomeExec(c.executado_por) : "", c.custo != null ? c.custo : ""])); break; }
    case "csv-au": { const l = auditoriaFiltrada(); downloadCSV("auditoria.csv", ["Quando", "Quem", "Registro", "Hotel", "O que mudou"], l.map(a => [fmtDT(a.t), a.usuario, a.entidade + " " + a.registro, a.hotel_id ? IDX.hotel[a.hotel_id].nome : "Grupo", a.acao])); break; }
    case "csv-ind": { const chs = scoped(DB.chamados), oss = scoped(DB.os), now = Date.now(); downloadCSV("indicadores-por-hotel.csv", ["Hotel", "Bandeira", "Modelo", "Backlog", "SLA (%)", "MTTR (h)", "Preventiva em dia (%)", "UH-dias perdidos", "Custo informado"], scope().hoteis.map(hid => { const h = IDX.hotel[hid], x = indicadoresDe(chs.filter(c => c.hotel_id === hid), oss.filter(o => o.hotel_id === hid), now - 30 * D, now); return [h.nome, IDX.band[h.bandeira_id].nome, h.modelo, x.backlog, x.sla == null ? "" : x.sla.toFixed(1).replace(".", ","), x.mttr == null ? "" : x.mttr.toFixed(1).replace(".", ","), x.pv == null ? "" : x.pv.toFixed(1).replace(".", ","), x.uhd.toFixed(1).replace(".", ","), x.custo]; })); break; }
    case "os-print": imprimirOS(IDX.os[id]); break;
    case "ia-ins": if (!e.target.closest("a")) go("inteligencia", { ins: id }); break;
    case "ia-recalc": UI.iaRecalc = UI.iaRecalc === id ? null : id; render(); break;
    case "ia-cancelar": UI.iaForm = null; render(); break;
    case "ia-acao": { const i = IDX.ins[id], acao = el.dataset.acao;
      if (!iaPodeDecidir(i) || !IA_ACOES[acao].de.includes(i.estado)) { toast("Esta ação não vale para você ou para o estado atual"); break; }
      if (IA_ACOES[acao].nota) { UI.iaForm = { id, acao }; render(); { const n = $("#ia-nota"); if (n) n.focus(); } break; }
      iaDecidir(i, acao); break; }
    case "ia-confirmar": { const i = IDX.ins[id], nota = ($("#ia-nota").value || "").trim(), motivo = $("#ia-motivo") ? $("#ia-motivo").value : null;
      if (!nota) { $("#ia-nota").focus(); toast("A nota é obrigatória"); break; }
      iaDecidir(i, UI.iaForm.acao, { nota: nota.slice(0, 500), motivo }); break; }
    case "os-fotoit": { const o = IDX.os[id]; o.checklist[+el.dataset.i].ok = true; o.inicio = o.inicio || new Date().toISOString(); save(); toast("Foto anexada ao item"); refreshDrawer(id); break; }
    case "ph-fotoit": phoneAction(() => { IDX.os[id].checklist[+el.dataset.i].ok = true; }); break;
    case "imp-load": UI.imp = { preview: IMP_EXEMPLO() }; render(); break;
    case "imp-import": { const rows = UI.imp.preview.filter(r => !r.erro); rows.forEach(r => novoAtivo("h6", r.local_id, r.cat, r.nome, r.fab, IDX.modelo[r.mod] ? IDX.modelo[r.mod].nome : ""));
      DB.auditoria.unshift({ t: new Date().toISOString(), usuario: persona().nome, entidade: "Ativo", registro: "importação", hotel_id: "h6", acao: `${rows.length} ativos importados por planilha no Hotel Joinville` });
      UI.imp = { done: `${rows.length} ativos importados no Hotel Joinville, cada um com o plano preventivo e o checklist do seu modelo. As 2 linhas com erro ficaram para correção.` }; save(); toast(`${rows.length} ativos importados`); render(); break; }
    case "imp-print": { const im = DB.implantacao.find(x => x.hotel_id === id), n = im.cadastrados - im.etiquetados; im.etiquetados = im.cadastrados; save(); toast(`${n} etiquetas QR de ${IDX.hotel[id].nome} enviadas para impressão`); render(); break; }
    case "imp-approve": { const cp = DB.capturas_celular.find(x => x.id === id), loc = DB.locais.find(l => l.hotel_id === cp.hotel_id && l.nome === cp.local);
      const at = novoAtivo(cp.hotel_id, loc.id, cp.categoria_id, IDX.cat[cp.categoria_id].nome + " (" + cp.local.toLowerCase() + ")", cp.fabricante, cp.modelo);
      DB.capturas_celular = DB.capturas_celular.filter(x => x.id !== id);
      DB.auditoria.unshift({ t: new Date().toISOString(), usuario: persona().nome, entidade: "Ativo", registro: at.id, hotel_id: cp.hotel_id, acao: "Cadastro feito pelo celular aprovado: " + at.nome }); save(); toast(`Ativo ${at.id} criado e pronto para etiqueta`); render(); break; }
    case "goto-late": e.preventDefault(); UI.f.ch = { ...UI.f.ch, hotel: "", status: "vencidos", page: 0 }; go("chamados"); break;
    case "goto-hotel": e.preventDefault(); UI.f.ch = { ...UI.f.ch, hotel: id, status: "abertos", page: 0 }; go("chamados"); break;
    case "page": { const f = UI.f[el.dataset.k]; f.page = Math.max(0, f.page + +el.dataset.d); render(); window.scrollTo(0, 0); break; }
    case "novo-ch": document.body.insertAdjacentHTML("beforeend", modalNovoChamado({ hotel: UI.f.ch.hotel })); updateNovoChamado(); $("#nc-desc").focus(); break;
    case "modal-close": closeModal(); break;
    case "modal-bg": if (e.target === el) closeModal(); break;
    case "nc-save": salvarNovoChamado(); break;
    case "atribuir": { const c = IDX.ch[id], v = $("#atrib").value; if (!v) { toast("Escolha um técnico"); break; } c.tecnico_id = v; logEvent(c, "atribuicao", "Atribuído a " + nomeUser(v)); save(); toast(`${c.id} atribuído a ${nomeUser(v)}`); refreshDrawer(id); break; }
    case "ch-st": { const c = IDX.ch[id], st = el.dataset.st; if (st === "Cancelado" && !confirm("Cancelar este chamado?")) break; setStatus(c, st); save(); toast(`${c.id}: ${st === "Aguardando aceite" ? "serviço concluído" : st.toLowerCase()}`); refreshDrawer(id); break; }
    case "comentar": { const c = IDX.ch[id], v = $("#coment").value.trim(); if (!v) { $("#coment").focus(); break; } logEvent(c, "comentario", v); save(); toast("Comentário adicionado"); refreshDrawer(id); break; }
    case "os-concluir": { const o = IDX.os[id]; if (concluirOS(o)) { toast(`${o.id} concluída`); refreshDrawer(id); } break; }
    case "cal": { if (el.dataset.d === "0") UI.cal = null; else { const b = UI.cal ? new Date(UI.cal) : new Date(); b.setDate(1); b.setMonth(b.getMonth() + +el.dataset.d); UI.cal = b.toISOString(); } render(); break; }
    case "as": UI.persona = id; save(); location.hash = "#/"; render(); break;
    // Celular
    case "ph-tab": UI.phone.tab = el.dataset.k; UI.phone.view = null; UI.phone.scan = null; $("#phone").innerHTML = phoneScreen(); break;
    case "ph-open": UI.phone.view = id; $("#phone").innerHTML = phoneScreen(); break;
    case "ph-back": UI.phone.view = null; $("#phone").innerHTML = phoneScreen(); break;
    case "ph-net": if (UI.phone.offline) { const n = UI.phone.pend; UI.phone.offline = false; UI.phone.pend = 0; if (n) toast(`${n} ${n > 1 ? "ações enviadas" : "ação enviada"} ao reconectar`); } else UI.phone.offline = true; $("#phone").innerHTML = phoneScreen(); break;
    case "ph-foto": phoneAction(() => { const o = IDX.os[id]; o.fotos = (o.fotos || 0) + 1; }); break;
    case "ph-concluir": { const o = IDX.os[id]; if (checklistPendente(o)) { toast("Preencha as medições e marque todos os itens para concluir"); break; } phoneAction(() => { o.status = "Concluída"; o.inicio = o.inicio || new Date(Date.now() - 1.1 * H).toISOString(); o.fim = new Date().toISOString(); o.horas = 1.1; DB.auditoria.unshift({ t: o.fim, usuario: "Paulo Mendes", entidade: "OS", registro: o.id, hotel_id: o.hotel_id, acao: "OS concluída pelo app: " + o.titulo }); }); toast(UI.phone.offline ? "OS concluída, será enviada ao reconectar" : `${o.id} concluída`); break; }
    case "ph-ch": { const c = IDX.ch[id], st = el.dataset.st; phoneAction(() => { const cur = UI.persona; UI.persona = TEC; setStatus(c, st); UI.persona = cur; }); toast(st === "Aguardando aceite" ? "Serviço concluído, aguardando aceite" : st); break; }
    case "ph-scan": { const opts = DB.ativos.filter(x => x.hotel_id === "h1" && ["c1", "c5", "c2", "c8"].includes(x.categoria_id)); UI.phone.scan = (opts.find(x => x.categoria_id === "c5") || opts[0]).id; $("#phone").innerHTML = phoneScreen(); break; }
    case "ph-scan-cancel": UI.phone.scan = null; $("#phone").innerHTML = phoneScreen(); break;
    case "ph-abrir": {
      const at = IDX.ativo[UI.phone.scan], pr = $("#ph-p").value, tt = $("#ph-t").value + ": " + at.nome.toLowerCase();
      phoneAction(() => {
        const e = slaEfetivo(at.hotel_id, pr), now = new Date().toISOString();
        const c = { id: nextId("CH", DB.chamados), hotel_id: at.hotel_id, local_id: at.local_id, ativo_id: at.id, categoria_id: at.categoria_id, titulo: tt.charAt(0).toUpperCase() + tt.slice(1), descricao: "Aberto pelo técnico a partir da etiqueta do ativo.", prioridade: pr, status: "Em atendimento", aberto_em: now, prazo_sla: new Date(Date.now() + e.h * H).toISOString(), sla_h: e.h, atendido_em: now, encerrado_em: null, tecnico_id: TEC, solicitante: "Técnico (app)", origem: "App do técnico (QR)", impacto_hospede: false, executado_por: { tipo: "interna" }, eventos: [{ t: now, tipo: "abertura", txt: "Chamado aberto pelo app lendo a etiqueta " + at.qr, por: "Paulo Mendes" }, { t: now, tipo: "sistema", txt: `Prazo de SLA definido: ${e.h} h (prioridade ${pr})` }, { t: now, tipo: "atribuicao", txt: "Atribuído a Paulo Mendes", por: "Paulo Mendes" }], fotos: 1 };
        DB.chamados.unshift(c); IDX.ch[c.id] = c;
        DB.auditoria.unshift({ t: now, usuario: "Paulo Mendes", entidade: "Chamado", registro: c.id, hotel_id: c.hotel_id, acao: "Chamado aberto pelo app: " + c.titulo });
        UI.phone.scan = null; UI.phone.tab = "hoje"; UI.phone.view = c.id;
      });
      toast("Chamado aberto e atribuído a você"); break;
    }
  }
});
document.addEventListener("change", e => {
  const el = e.target;
  if (el.dataset.f) { const [k, f] = el.dataset.f.split("."); UI.f[k][f] = el.value; UI.f[k].page = 0; render(); return; }
  if (el.dataset.act === "persona") { UI.persona = el.value; UI.phone = { tab: "hoje", view: null, offline: false, pend: 0, scan: null }; save(); location.hash = "#/"; render(); return; }
  if (el.dataset.act === "cal-hotel") { UI.calHotel = el.value; render(); return; }
  if (el.dataset.act === "sla") { setSla(el.dataset.tipo, el.dataset.id, el.dataset.pr, el.value); return; }
  if (el.dataset.act === "prio-pad") { const pg = DB.politicas.find(p => p.escopo_tipo === "grupo"), antes = pg.prio_padrao[el.dataset.cat]; pg.prio_padrao[el.dataset.cat] = el.value;
    DB.auditoria.unshift({ t: new Date().toISOString(), usuario: persona().nome, entidade: "Política", registro: pg.id, hotel_id: null, acao: `Prioridade padrão de ${IDX.cat[el.dataset.cat].nome}: ${antes} para ${el.value}` }); save(); toast("Prioridade padrão atualizada"); render(); return; }
  if (el.dataset.act === "os-list" || el.dataset.act === "os-date") { const o = IDX.os[el.dataset.id]; o.checklist[+el.dataset.i].valor = el.value || null; o.inicio = o.inicio || new Date().toISOString(); save(); refreshDrawer(o.id); return; }
  if (el.dataset.act === "ph-list" || el.dataset.act === "ph-date") { phoneAction(() => { IDX.os[el.dataset.id].checklist[+el.dataset.i].valor = el.value || null; }); return; }
  if (el.dataset.act === "relogio") { const pg = polGrupo(), cat = el.dataset.cat, arr = pg.calendario_comercial = (pg.calendario_comercial || []).filter(x => x !== cat); if (el.value === "com") arr.push(cat);
    DB.auditoria.unshift({ t: new Date().toISOString(), usuario: persona().nome, entidade: "Política", registro: pg.id, hotel_id: null, acao: `Relógio do SLA de ${IDX.cat[cat].nome}: ${el.value === "com" ? "horário comercial" : "24 horas, 7 dias"}` }); save(); toast("Calendário do SLA atualizado"); render(); return; }
  if (el.dataset.act === "cod-obrig") { const pg = polGrupo(); pg.codigos_obrigatorios = el.checked; DB.auditoria.unshift({ t: new Date().toISOString(), usuario: persona().nome, entidade: "Política", registro: pg.id, hotel_id: null, acao: `Códigos de manutenção ${el.checked ? "obrigatórios" : "opcionais"} no aceite` }); save(); toast("Política atualizada"); return; }
  if (el.dataset.act === "resp") { const r = DB.responsabilidade.find(x => x.hotel_id === el.dataset.h && x.categoria_id === el.dataset.cat), antes = r.responsavel; r.responsavel = el.value;
    DB.auditoria.unshift({ t: new Date().toISOString(), usuario: persona().nome, entidade: "Contrato", registro: el.dataset.h, hotel_id: el.dataset.h, acao: `Responsável por ${IDX.cat[el.dataset.cat].nome}: ${antes} para ${el.value}` }); save(); toast("Matriz de responsabilidade atualizada"); return; }
  if (el.dataset.act === "ind-band") { UI.f.ind.band = el.value; render(); return; }
  if (el.dataset.act === "os-med") { const o = IDX.os[el.dataset.id]; setMedicao(o, +el.dataset.i, el.value); o.inicio = o.inicio || new Date().toISOString(); save(); refreshDrawer(o.id); return; }
  if (el.dataset.act === "ph-med") { phoneAction(() => setMedicao(IDX.os[el.dataset.id], +el.dataset.i, el.value)); return; }
  if (el.id === "nc-cat") { updateNovoChamado(); return; }
  if (el.dataset.act === "os-chk") { const o = IDX.os[el.dataset.id]; o.checklist[+el.dataset.i].ok = el.checked; if (o.status === "Programada" || o.status === "Atrasada") o.inicio = o.inicio || new Date().toISOString(); save(); return; }
  if (el.dataset.act === "ph-chk") { phoneAction(() => { const o = IDX.os[el.dataset.id]; o.checklist[+el.dataset.i].ok = el.checked; }); return; }
  if (el.id === "nc-hotel" || el.id === "nc-prio") updateNovoChamado();
});
let qTimer;
document.addEventListener("input", e => {
  const el = e.target;
  if (el.dataset.f && el.type === "search") {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { const [k, f] = el.dataset.f.split("."); UI.f[k][f] = el.value; UI.f[k].page = 0; const pos = el.selectionStart; render(); const n = document.querySelector(`[data-f="${el.dataset.f}"]`); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 250);
  }
});
document.addEventListener("keydown", e => { if (e.key === "Escape") { if (document.querySelector(".modal-bg")) closeModal(); else if (document.querySelector(".drawer")) closeDrawer(); } });
window.addEventListener("hashchange", render);

load();
render();
