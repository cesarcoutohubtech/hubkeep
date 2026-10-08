/* Central de Manutenção (CSC) — mock navegável para apresentação.
   Sem backend: os dados vêm de seed.js e as alterações ficam no navegador (localStorage).
   O isolamento por escopo é simulado em uma única função (scope), como faria a RLS no banco. */

const H = 3600e3, D = 24 * H;
const STORE_KEY = "csc-demo-v4";
const THEME_KEY = "csc-demo-theme";
const PERSONA_KEY = "csc-demo-persona";
const PRIOS = ["Crítica", "Alta", "Média", "Baixa"];
const OPEN = ["Aberto", "Em atendimento", "Aguardando peça", "Aguardando aceite"];

let DB, IDX;
const UI = {
  persona: "u1",
  f: { ch: { q: "", hotel: "", status: "abertos", prio: "", cat: "", page: 0 }, os: { origem: "", status: "", hotel: "", page: 0 }, at: { q: "", hotel: "", cat: "", crit: "", page: 0 }, au: { page: 0 } },
  cal: null, calHotel: null, theme: "dark", ncFotos: 0, imp: null,
  phone: { tab: "hoje", view: null, offline: false, pend: 0, scan: null }
};

/* ---------- Persistência ---------- */
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const d = JSON.parse(raw); if (d && d.versao === 4) { DB = d; } }
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
}

/* ---------- Utilidades ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const t = s => +new Date(s);
const pad = n => String(n).padStart(2, "0");
function fmtDT(s) { if (!s) return "—"; const d = new Date(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtD(s) { if (!s) return "—"; const d = new Date(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; }
function dur(h) {
  h = Math.abs(h);
  if (h < 1) return Math.max(1, Math.round(h * 60)) + " min";
  if (h < 24) { const tot = Math.round(h * 60), hh = Math.floor(tot / 60), mm = tot % 60; return hh + " h" + (mm ? " " + mm + " min" : ""); }
  const tot = Math.round(h), d = Math.floor(tot / 24), hh = tot % 24; return d + " d" + (hh ? " " + hh + " h" : "");
}
const num1 = v => v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
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
  if (e.tipo === "proprietario") {
    const ls = DB.localProprietario.filter(x => x.proprietario_id === e.id).map(x => x.local_id);
    const hs = [...new Set(ls.map(l => IDX.local[l].hotel_id))];
    return { hoteis: hs, locais: ls, label: `${ls.length} UHs próprias em ${hs.map(h => IDX.hotel[h].nome).join(", ")}` };
  }
}
function scoped(list, localKey = "local_id") {
  const s = scope();
  return list.filter(x => s.hoteis.includes(x.hotel_id) && (!s.locais || s.locais.includes(x[localKey])));
}
const role = () => {
  const p = persona().papel;
  if (p === "Gestora do CSC") return "csc";
  if (p.startsWith("Coordenador")) return "band";
  if (p === "Gerente de hotel") return "hotel";
  if (p === "Técnico") return "tec";
  return "prop";
};
const canEdit = () => ["csc", "band", "hotel"].includes(role());
const catNome = id => id ? IDX.cat[id].nome : "Aguardando triagem";
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
  const pct = 1 - rem / c.sla_h;
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
  intel: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
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
  cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'
};
const icon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k]}</svg>`;

/* ---------- Navegação ---------- */
function navItems() {
  const r = role();
  const all = [
    ["Operação", null],
    ["painel", "Painel", "painel"], ["chamados", "Chamados", "chamados"], ["os", "Ordens de serviço", "os"], ["preventiva", "Preventiva", "prev"],
    ["Cadastros", null],
    ["ativos", "Ativos", "ativos"], ["implantacao", "Implantação de ativos", "imp"], ["hoteis", "Hotéis e unidades", "hoteis"],
    ["Intelligence", null],
    ["intelligence", "Intelligence", "intel"],
    ["Configuração", null],
    ["politicas", "Políticas de SLA", "pol"], ["integracao", "Integração TOTVS CM", "integ"], ["usuarios", "Usuários e escopos", "users"], ["auditoria", "Auditoria", "audit"],
    ["Apresentação", null],
    ["tecnico", r === "tec" ? "Meu dia" : "App do técnico", "tec"], ["roadmap", "Próximas fases", "road"]
  ];
  const allow = {
    csc: null,
    band: ["painel", "chamados", "os", "preventiva", "ativos", "implantacao", "hoteis", "intelligence", "politicas", "auditoria", "tecnico"],
    hotel: ["painel", "chamados", "os", "preventiva", "ativos", "implantacao", "hoteis", "intelligence", "auditoria", "tecnico"],
    tec: ["tecnico"],
    prop: ["painel", "chamados"]
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
const TITLES = { painel: "Painel", chamados: "Chamados", os: "Ordens de serviço", preventiva: "Preventiva", ativos: "Ativos", implantacao: "Implantação de ativos", hoteis: "Hotéis e unidades", politicas: "Políticas de SLA", integracao: "Integração TOTVS CM", usuarios: "Usuários e escopos", auditoria: "Auditoria", intelligence: "Intelligence (prévia)", tecnico: "App do técnico", roadmap: "Próximas fases" };
function render() {
  document.querySelectorAll(".drawer, .drawer-bg").forEach(e => e.remove());
  const { page, params } = route();
  const p = persona(), s = scope();
  const openCount = scoped(DB.chamados).filter(c => OPEN.includes(c.status)).length;
  const nav = navItems().map(it => it.group ? `<div class="nav-group">${it.group}</div>` :
    `<a href="#/${it.id}" class="${it.id === page ? "active" : ""}" ${it.id === page ? 'aria-current="page"' : ""}>${icon(it.icon)}<span>${it.label}</span>${it.id === "chamados" ? `<span class="count">${openCount}</span>` : ""}</a>`).join("");
  const personas = ["u1", "u2", "u3", "u4", "u5"].map(id => { const u = IDX.user[id]; return `<option value="${id}" ${id === UI.persona ? "selected" : ""}>${esc(u.nome)} (${esc(u.papel)})</option>`; }).join("");
  $("#app").innerHTML = `
  <div class="app">
    <aside class="sidebar" id="sidebar">
      <div class="brand"><svg class="brand-mark" viewBox="0 0 34 34" aria-hidden="true"><rect width="34" height="34" rx="9" fill="#0F3D45"/><path d="M8 22a9 9 0 0 1 18 0" fill="none" stroke="#2FD6C3" stroke-width="3" stroke-linecap="round"/><path d="M17 22l5-7" stroke="#F0A500" stroke-width="3" stroke-linecap="round"/><circle cx="17" cy="22" r="2.4" fill="#F0A500"/></svg><div><div class="brand-name">${esc(DEMO_CONFIG.produto)}</div><div class="brand-sub">${esc(DEMO_CONFIG.plataforma)} para ${esc(DEMO_CONFIG.cliente)}</div></div></div>
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
const fmt1 = v => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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
  const sub = [warnTot ? `${warnTot} ${plural(warnTot, "vence", "vencem")} em breve` : null, k.crit ? `${k.crit} ${plural(k.crit, "crítico", "críticos")} em atendimento` : null, r !== "prop" && k.prevLate ? `${k.prevLate} preventivas atrasadas em 30 dias` : null].filter(Boolean).join(". ") || "Nenhum chamado perto de vencer.";
  const stLabel = { crit: "Estado da rede: crítico", att: "Estado da rede: atenção", ok: "Estado da rede: normal" }[band].replace("rede", hs.length > 1 ? "rede" : "operação");
  const statusBand = `<section class="status-band ${band}" aria-label="Estado da operação">
    <div><div class="meta"><span class="live"><i></i>Ao vivo</span><span>${stLabel}</span></div>
      <div class="headline">${headline}</div><div class="sub">${sub}.</div></div>
    <div class="clock-wrap"><div class="clock" id="live-clock">--:--:--</div><div class="meta clock-meta"><span>${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</span><span>TOTVS CM lido <span data-rel="${DB.integracao.views[2].ultima}">${rel(DB.integracao.views[2].ultima)}</span></span></div></div>
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
    ${r === "prop" ? `<div class="panel inst"><div class="lab">UHs acompanhadas</div><div class="val">${s.locais.length}</div><span class="delta flat">${esc(s.hoteis.map(h => IDX.hotel[h].nome).join(", "))}</span><div class="foot" style="margin-top:22px">Você vê só os chamados das suas unidades.</div></div>` :
      `<div class="panel inst has-ring"><div class="lab">Preventivas em dia</div>${ring(k.pv, 95, col(k.pv, 95, 85))}<div class="val">${k.pv == null ? "—" : fmt1(k.pv)}<small>%</small></div>${deltaHtml(k.pv != null && pvPrev != null ? k.pv - pvPrev : null, " p.p.", true, "vs. 30 dias antes")}
      <div class="spark">${spark(prevS, col(k.pv, 95, 85), 220, 38, false)}</div><div class="foot">Meta de 95%. ${k.prevLate} atrasadas em 30 dias.</div></div>`}
  </div>`;

  // Matriz de telemetria por hotel
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
      <td><div class="hname"><span class="led ${h.st === "ok" ? "" : h.st}" aria-label="${h.st === "crit" ? "crítico" : h.st === "att" ? "atenção" : "normal"}"></span><span>${esc(hn.nome.replace(/^Hotel /, ""))}<small>${esc(IDX.band[hn.bandeira_id].nome)}, ${hn.uhs} UHs</small></span></div></td>
      <td><div class="cell ${h.open ? "" : "zero"}" ${heat(h.open, mx.open, "47,214,195")}>${h.open}</div></td>
      <td><div class="cell ${h.warn ? "" : "zero"}" ${heat(h.warn, mx.warn, "240,165,0")}>${h.warn}</div></td>
      <td><div class="cell ${h.late ? "" : "zero"}" ${heat(h.late, mx.late, "255,90,95")}>${h.late}</div></td>
      <td><div class="cell ${h.crit ? "" : "zero"}" ${heat(h.crit, mx.crit, "255,90,95")}>${h.crit}</div></td>
      ${r === "prop" ? "" : `<td><div class="cell ${h.pl ? "" : "zero"}" ${heat(h.pl, mx.pl, "240,165,0")}>${h.pl}</div></td>`}
      <td><div class="slabar"><div class="trk"><b style="width:${sl ?? 0}%;background:${c}"></b><em></em></div><span style="color:${c}">${sl == null ? "—" : Math.round(sl) + "%"}</span></div></td>
      <td class="spark-cell">${spark(trend, "#5CC8E0", 110, 28)}</td></tr>`;
  }).join("");
  const matrix = `<div class="panel"><div class="panel-h"><h2>Telemetria por hotel</h2><span class="hint">Cores mais fortes indicam mais ocorrências. Clique em um hotel para ver a fila dele.</span></div>
    <div class="panel-b table-wrap"><table class="matrix"><thead><tr><th>Hotel</th><th>Em aberto</th><th>Vencem em breve</th><th>Fora do prazo</th><th>Críticos</th>${r === "prop" ? "" : "<th>Prev. atrasadas</th>"}<th>SLA 30 dias<br>(meta 90%)</th><th>Chamados abertos por dia, 14 dias</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;

  // Contagem regressiva
  const runningAll = chs.filter(c => OPEN.includes(c.status) && c.status !== "Aguardando aceite");
  const cds = runningAll.filter(c => t(c.prazo_sla) > now).sort((a, b) => t(a.prazo_sla) - t(b.prazo_sla)).slice(0, 6);
  const countdown = `<div class="panel"><div class="panel-h"><h2>Contagem regressiva do SLA</h2><span class="hint">Próximos prazos a vencer</span><div class="spacer"></div>${k.late ? `<a href="#" class="badge b-red" data-act="goto-late" style="text-decoration:none">${k.late} já ${k.late === 1 ? "vencido" : "vencidos"}</a>` : ""}</div><div class="panel-b" style="padding-top:0">
    ${cds.length ? `<ul class="cd-list">${cds.map(c => `<li class="cd-item" data-act="open-ch" data-id="${c.id}" data-deadline="${c.prazo_sla}" data-sla="${c.sla_h}" data-hid="${c.hotel_id}">
      <div class="cd-t">${esc(c.titulo)}</div><div class="cd-time"><span class="cd-v">--:--:--</span><small class="cd-l"></small></div>
      <div class="cd-s">${prio(c.prioridade)} <span style="margin-left:6px">${esc(IDX.hotel[c.hotel_id].nome.replace(/^Hotel /, ""))}, ${esc(IDX.local[c.local_id].nome)}</span></div>
      <div class="cd-bar"><b></b></div></li>`).join("")}</ul>` : `<div class="empty">Nenhum chamado em andamento.</div>`}
    <div class="row" style="justify-content:flex-end;margin-top:8px"><a href="#/chamados" class="small">Ver fila completa</a></div></div></div>`;

  // Fluxo de eventos
  const aud = DB.auditoria.filter(a => !a.hotel_id || s.hoteis.includes(a.hotel_id)).filter(a => !(s.locais && a.entidade === "Chamado" && IDX.ch[a.registro] && !s.locais.includes(IDX.ch[a.registro].local_id))).slice(0, 5);
  const icFor = a => a.entidade === "Chamado" ? ["ch", "chamados"] : a.entidade === "OS" ? ["os", "os"] : ["po", "pol"];
  const feed = r === "prop" ? "" : `<div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Fluxo de eventos</h2><span class="live" style="margin-left:4px"><i></i>ao vivo</span></div><div class="panel-b" style="padding-top:0"><ul class="feed">${aud.map(a => { const [cl, ic] = icFor(a); return `<li class="${now - t(a.t) < 90e3 ? "new" : ""}"><span class="ic ${cl}">${icon(ic)}</span><div>${esc(a.acao)}<div class="who">${esc(a.usuario)}, ${esc(a.entidade.toLowerCase())} ${esc(a.registro)}</div></div><span class="w" data-rel="${a.t}">${rel(a.t)}</span></li>`; }).join("")}</ul></div></div>`;

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
    const dl = t(el.dataset.deadline), slaMs = +el.dataset.sla * H, rem = dl - now, used = 1 - rem / slaMs;
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
function pageChamados() {
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
    ${role() !== "tec" ? `<button class="btn primary" data-act="novo-ch">Abrir chamado</button>` : ""}
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
function drawerChamado(c) {
  const h = IDX.hotel[c.hotel_id], l = IDX.local[c.local_id], a = c.ativo_id ? IDX.ativo[c.ativo_id] : null;
  const pol = slaEfetivo(c.hotel_id, c.prioridade);
  const uh = l.tipo === "uh" ? DB.statusUH[l.id] : null;
  const dono = IDX.donoDe[l.id] ? IDX.prop[IDX.donoDe[l.id]].nome : null;
  const ed = canEdit() && OPEN.includes(c.status);
  const tecs = DB.tecnicos.filter(x => x.hotel_id === c.hotel_id);
  const acts = [];
  if (ed) {
    if (c.status === "Aberto") acts.push(`<button class="btn primary" data-act="ch-st" data-id="${c.id}" data-st="Em atendimento" ${c.tecnico_id ? "" : "disabled title='Atribua um técnico antes'"}>Iniciar atendimento</button>`);
    if (c.status === "Em atendimento") acts.push(`<button class="btn primary" data-act="ch-st" data-id="${c.id}" data-st="Aguardando aceite">Concluir serviço</button>`, `<button class="btn" data-act="ch-st" data-id="${c.id}" data-st="Aguardando peça">Aguardar peça</button>`);
    if (c.status === "Aguardando peça") acts.push(`<button class="btn primary" data-act="ch-st" data-id="${c.id}" data-st="Em atendimento">Retomar atendimento</button>`);
    if (c.status === "Aguardando aceite") acts.push(`<button class="btn primary" data-act="ch-st" data-id="${c.id}" data-st="Encerrado">Registrar aceite e encerrar</button>`, `<button class="btn" data-act="ch-st" data-id="${c.id}" data-st="Em atendimento">Reabrir</button>`);
    acts.push(`<button class="btn danger" data-act="ch-st" data-id="${c.id}" data-st="Cancelado">Cancelar chamado</button>`);
  }
  const needBlock = uh && uh !== "Bloqueada" && OPEN.includes(c.status) && ["Crítica", "Alta"].includes(c.prioridade);
  return `
  <div class="drawer-h"><button class="close" data-act="close" aria-label="Fechar">×</button>
    <span class="id">${c.id}</span><h2>${esc(c.titulo)}</h2>
    <div class="row">${statusBadge(c.status)} ${prio(c.prioridade)} ${tag(c)}</div></div>
  <div class="drawer-b">
    <dl class="kv">
      <dt>Hotel</dt><dd>${esc(h.nome)} <span class="muted small">(${esc(IDX.band[h.bandeira_id].nome)})</span></dd>
      <dt>Local</dt><dd>${esc(l.nome)}${l.andar ? `, ${l.andar}º andar` : ""}${uh ? ` <span class="badge ${uh === "Bloqueada" ? "b-red" : uh === "Ocupada" ? "b-amber" : "b-green"}">${uh}</span> <span class="muted small">no TOTVS CM</span>` : ""}</dd>
      ${dono ? `<dt>Proprietário da UH</dt><dd>${esc(dono)}</dd>` : ""}
      <dt>Ativo</dt><dd>${a ? `<a href="#" data-act="open-at" data-id="${a.id}">${esc(a.nome)}</a> <span class="muted small">${a.id}</span>` : '<span class="muted">Não vinculado</span>'}</dd>
      <dt>Categoria</dt><dd>${esc(catNome(c.categoria_id))}</dd>
      <dt>Solicitante</dt><dd>${esc(c.solicitante)}</dd>
      <dt>Aberto em</dt><dd>${fmtDT(c.aberto_em)} <span class="muted small">(${rel(c.aberto_em)})</span></dd>
      <dt>Prazo do SLA</dt><dd>${fmtDT(c.prazo_sla)} <span class="muted small">${c.sla_h} h, regra de ${esc(pol.origem === "Grupo" ? "grupo" : pol.origem)}</span></dd>
      <dt>Técnico</dt><dd>${ed ? `<span class="row"><select id="atrib" aria-label="Técnico"><option value="">Selecionar</option>${tecs.map(x => `<option value="${x.id}" ${x.id === c.tecnico_id ? "selected" : ""}>${esc(x.nome)} (${esc(x.especialidade)})</option>`).join("")}</select><button class="btn sm" data-act="atribuir" data-id="${c.id}">Atribuir</button></span>` : esc(c.tecnico_id ? nomeUser(c.tecnico_id) : "—")}</dd>
    </dl>
    ${uh ? `<div class="readonly-note">${icon("integ")}<span>Status da UH lido do TOTVS CM há ${rel(DB.integracao.views[2].ultima).replace("há ", "")}. ${needBlock ? "Lembrete: se a UH precisar sair de venda, o bloqueio é feito no CM pela recepção. A Central não escreve no CM." : "A Central só lê o CM; não altera status de UH."}</span></div>` : ""}
    ${c.triagem && ed ? `<div class="triage"><h3 style="margin-top:0">Triagem</h3><p class="small muted" style="margin:0 0 10px">Quem abriu informou só o local e o problema. Classifique para definir a prioridade e o prazo.</p>
      <div class="two"><div class="field"><label for="tr-cat">Categoria</label><select id="tr-cat"><option value="">Selecione</option>${DB.categorias.map(k => `<option value="${k.id}">${esc(k.nome)}</option>`).join("")}</select></div>
      <div class="field"><label for="tr-prio">Prioridade</label><select id="tr-prio"><option value="auto">Padrão da categoria</option>${PRIOS.map(p => `<option>${p}</option>`).join("")}</select></div></div>
      <div class="row"><button class="btn primary" data-act="triar" data-id="${c.id}">Classificar chamado</button><span class="small muted" id="tr-hint"></span></div></div>` : ""}
    ${a && OPEN.includes(c.status) ? (() => { const pa = paradaAberta(a.id); return `<div class="parada ${pa ? "on" : ""}" id="parada"><div><strong>${pa ? "Equipamento parado" : "Equipamento operando"}</strong><div class="small muted">${pa ? `Desde ${fmtDT(pa.inicio)}, há ${dur((Date.now() - t(pa.inicio)) / H)}. Conta no histórico de indisponibilidade do ativo.` : "Registre se o problema deixou o equipamento fora de operação."}</div></div>${ed ? `<button class="btn sm" data-act="parada" data-id="${c.id}">${pa ? "Registrar retorno à operação" : "Registrar parada"}</button>` : ""}</div>`; })() : ""}
    ${acts.length ? `<h3>Ações</h3><div class="row">${acts.join("")}</div>` : role() === "prop" ? `<div class="readonly-note">Proprietários acompanham os chamados das próprias UHs, sem editar.</div>` : ""}
    <h3>Fotos</h3><div class="photos">${Array.from({ length: c.fotos }, (_, i) => `<div class="photo">Foto ${i + 1}<br>${i === 0 ? "antes" : "depois"}</div>`).join("") || '<span class="muted small">Nenhuma foto anexada.</span>'}</div>
    <h3>Histórico</h3>
    <ul class="timeline">${[...c.eventos].reverse().map(e => `<li class="${e.tipo === "sistema" ? "sys" : ""}"><div>${esc(e.txt)}</div><div class="when">${fmtDT(e.t)}${e.por ? ", por " + esc(e.por) : ""}</div></li>`).join("")}</ul>
    ${role() !== "prop" && role() !== "tec" ? `<div class="field"><label for="coment">Comentário</label><textarea id="coment" placeholder="Escreva uma atualização para a equipe"></textarea></div><button class="btn" data-act="comentar" data-id="${c.id}">Adicionar comentário</button>` : ""}
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
  c.status = st;
  logEvent(c, "status", st === "Aguardando aceite" ? "Serviço concluído, aguardando aceite do solicitante" : st === "Encerrado" ? "Encerrado com aceite do solicitante" : st);
  const o = DB.os.find(x => x.chamado_id === c.id);
  if (st === "Em atendimento" && !o) {
    const nid = nextId("OS", DB.os);
    const nos = { id: nid, origem: "corretiva", chamado_id: c.id, plano_id: null, hotel_id: c.hotel_id, local_id: c.local_id, ativo_id: c.ativo_id, titulo: c.titulo, responsavel_id: c.tecnico_id, status: "Em execução", programada_para: now, inicio: now, fim: null, horas: null, checklist: [], materiais: "" };
    DB.os.push(nos); IDX.os[nid] = nos;
  }
  if (o && (st === "Encerrado" || st === "Aguardando aceite")) { o.status = "Concluída"; o.fim = now; o.horas = Math.round((t(now) - t(o.inicio)) / H * 10) / 10; }
}

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
    loc.innerHTML = ls.map(l => `<option value="${l.id}">${esc(l.nome)}</option>`).join(""); loc.dataset.h = hid;
  }
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
  const sol = $("#nc-sol").value, parado = $("#nc-parado").checked;
  const c = {
    id: nextId("CH", DB.chamados), hotel_id: x.hid, local_id: lid, ativo_id: at ? at.id : null, categoria_id: x.cat || null, titulo,
    descricao: desc, prioridade: x.p, status: "Aberto", aberto_em: new Date(now).toISOString(), triagem: !x.cat,
    prazo_sla: new Date(now + x.e.h * H).toISOString(), sla_h: x.e.h, atendido_em: null, encerrado_em: null, tecnico_id: null,
    solicitante: sol, eventos: [], fotos: UI.ncFotos
  };
  c.eventos.push({ t: c.aberto_em, tipo: "abertura", txt: "Chamado aberto por " + sol + (UI.ncFotos ? `, com ${UI.ncFotos} ${UI.ncFotos > 1 ? "fotos" : "foto"}` : ""), por: persona().nome });
  c.eventos.push({ t: c.aberto_em, tipo: "sistema", txt: x.cat ? `Prazo de SLA definido: ${x.e.h} h (prioridade ${x.p}${x.sel === "auto" ? ", padrão da categoria" : ""})` : `Aguardando triagem. Prazo provisório: ${x.e.h} h (prioridade Média)` });
  if (parado) {
    if (at) { DB.ativo_parada.push({ id: "PA-" + (DB.ativo_parada.length + 1), ativo_id: at.id, chamado_id: c.id, inicio: c.aberto_em, fim: null, motivo: titulo }); at.status = "Parado"; c.eventos.push({ t: c.aberto_em, tipo: "sistema", txt: "Parada do equipamento registrada" }); }
    else c.eventos.push({ t: c.aberto_em, tipo: "sistema", txt: "Solicitante informou equipamento parado; vincular o ativo na triagem" });
  }
  DB.chamados.unshift(c); IDX.ch[c.id] = c;
  DB.auditoria.unshift({ t: c.aberto_em, usuario: persona().nome, entidade: "Chamado", registro: c.id, hotel_id: x.hid, acao: "Chamado aberto: " + titulo });
  save(); closeModal(); toast(`Chamado ${c.id} aberto`); go("chamados", { id: c.id });
}
function triar(c) {
  const cat = $("#tr-cat").value, sel = $("#tr-prio").value;
  if (!cat) { $("#tr-cat").focus(); toast("Escolha a categoria para classificar"); return false; }
  const p = sel === "auto" ? prioPadrao(cat, c.hotel_id) : sel, e = slaEfetivo(c.hotel_id, p);
  c.categoria_id = cat; c.prioridade = p; c.sla_h = e.h; c.prazo_sla = new Date(t(c.aberto_em) + e.h * H).toISOString(); c.triagem = false;
  const at = DB.ativos.find(a => a.local_id === c.local_id && a.categoria_id === cat); if (at) c.ativo_id = at.id;
  logEvent(c, "sistema", `Triagem: ${catNome(cat)}, prioridade ${p}${sel === "auto" ? " (padrão da categoria)" : ""}. Prazo de ${e.h} h, regra de ${e.origem === "Grupo" ? "grupo" : e.origem}`);
  save(); return true;
}
function closeModal() { const m = document.querySelector(".modal-bg"); if (m) m.remove(); }

/* ---------- Checklist tipado (sim/não e medição com faixa) ---------- */
const numBR = v => String(v).replace(".", ",");
function checklistHtml(o, ed, pre) {
  return o.checklist.map((c, i) => c.tipo === "medicao"
    ? `<div class="check-item med ${c.fora ? "fora" : c.valor != null ? "okm" : ""}"><div class="med-t"><label for="${pre}-${o.id}-${i}">${esc(c.t)}</label><div class="med-f">Faixa aceitável: ${numBR(c.min)} a ${numBR(c.max)}${c.unidade ? " " + c.unidade : ""}${c.fora ? ". Fora da faixa" : ""}</div></div>
       <div class="med-in"><input type="number" step="0.1" inputmode="decimal" id="${pre}-${o.id}-${i}" data-act="${pre}-med" data-id="${o.id}" data-i="${i}" value="${c.valor ?? ""}" ${ed ? "" : "disabled"} aria-label="${esc(c.t)}"><span>${esc(c.unidade)}</span></div></div>`
    : `<label class="check-item"><input type="checkbox" data-act="${pre}-chk" data-id="${o.id}" data-i="${i}" ${c.ok ? "checked" : ""} ${ed ? "" : "disabled"}><span>${esc(c.t)}</span></label>`).join("");
}
function setMedicao(o, i, v) {
  const c = o.checklist[i], n = parseFloat(String(v).replace(",", "."));
  c.valor = isNaN(n) ? null : n; c.fora = c.valor != null && (c.valor < c.min || c.valor > c.max);
}
const checklistPendente = o => o.checklist.some(c => c.tipo === "medicao" ? c.valor == null : !c.ok);

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
    ${o.materiais ? `<dt>Materiais</dt><dd>${esc(o.materiais)}</dd>` : ""}
  </dl>
  ${o.checklist.length ? `<h3>Checklist</h3>${checklistHtml(o, ed, "os")}${o.checklist.some(c => c.fora) ? `<div class="readonly-note warn">${icon("pol")}<span>${o.checklist.filter(c => c.fora).length} medição fora da faixa, registrada no histórico do ativo.</span></div>` : ""}` : ""}
  ${ed ? `<div class="row" style="margin-top:14px"><button class="btn primary" data-act="os-concluir" data-id="${o.id}">Concluir OS</button></div>` : ""}
  </div>`;
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
  if (f.crit) list = list.filter(a => a.criticidade === f.crit);
  if (f.q) { const q = f.q.toLowerCase(); list = list.filter(a => (a.id + " " + a.nome + " " + a.fabricante + " " + IDX.local[a.local_id].nome).toLowerCase().includes(q)); }
  const per = 25, pages = Math.max(1, Math.ceil(list.length / per)); f.page = Math.min(f.page, pages - 1);
  const rows = list.slice(f.page * per, f.page * per + per);
  const now = Date.now();
  const showHotel = scope().hoteis.length > 1;
  return `<div class="filters">
    <input type="search" placeholder="Buscar por código, nome ou fabricante" value="${esc(f.q)}" data-f="at.q" aria-label="Buscar ativos">
    ${showHotel ? `<select data-f="at.hotel" aria-label="Hotel"><option value="">Todos os hotéis</option>${hotelOptions(f.hotel)}</select>` : ""}
    <select data-f="at.cat" aria-label="Categoria"><option value="">Todas as categorias</option>${DB.categorias.map(c => `<option value="${c.id}" ${f.cat === c.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select>
    <select data-f="at.crit" aria-label="Criticidade"><option value="">Toda criticidade</option>${["Alta", "Média", "Baixa"].map(c => `<option ${f.crit === c ? "selected" : ""}>${c}</option>`).join("")}</select>
  </div>
  <div class="panel"><div class="table-wrap"><table><thead><tr><th>Código</th><th>Ativo</th><th>Categoria</th>${showHotel ? "<th>Hotel</th>" : ""}<th>Local</th><th>Criticidade</th><th>Próxima preventiva</th><th class="num">Chamados em 90 dias</th></tr></thead>
  <tbody>${rows.map(a => {
    const prox = DB.os.filter(o => o.ativo_id === a.id && o.status === "Programada").sort((x, y) => t(x.programada_para) - t(y.programada_para))[0];
    const late = DB.os.some(o => o.ativo_id === a.id && o.status === "Atrasada");
    const nch = DB.chamados.filter(c => c.ativo_id === a.id && t(c.aberto_em) > now - 90 * D).length;
    return `<tr class="click" data-act="open-at" data-id="${a.id}"><td><span class="id">${a.id}</span></td><td>${esc(a.nome)}${a.status === "Parado" ? ' <span class="badge b-red">Parado</span>' : ""}<div class="small muted">${esc(a.fabricante)}${a.modelo ? ", " + esc(a.modelo) : ""}</div></td><td class="small">${esc(IDX.cat[a.categoria_id].nome)}</td>${showHotel ? `<td class="small">${esc(IDX.hotel[a.hotel_id].nome)}</td>` : ""}<td class="small">${esc(IDX.local[a.local_id].nome)}</td><td><span class="badge ${a.criticidade === "Alta" ? "b-red" : a.criticidade === "Média" ? "b-amber" : "b-grey"}">${a.criticidade}</span></td><td class="small">${late ? '<span class="badge b-red">Atrasada</span>' : prox ? fmtD(prox.programada_para) : '<span class="muted">Sem plano</span>'}</td><td class="num">${nch}</td></tr>`;
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
  return `<div class="drawer-h"><button class="close" data-act="close" aria-label="Fechar">×</button><span class="id">${a.id}</span><h2>${esc(a.nome)}</h2><div class="row"><span class="badge ${a.status === "Parado" ? "b-red" : "b-green"}">${a.status}</span><span class="badge ${a.criticidade === "Alta" ? "b-red" : "b-amber"}">Criticidade ${a.criticidade.toLowerCase()}</span></div></div>
  <div class="drawer-b"><div class="row" style="align-items:flex-start;gap:18px"><div class="qr-card">${qrSvg(a.qr, 96)}</div><dl class="kv" style="flex:1">
    <dt>Etiqueta</dt><dd>${a.qr}</dd><dt>Categoria</dt><dd>${esc(IDX.cat[a.categoria_id].nome)}</dd><dt>Fabricante e modelo</dt><dd>${esc(a.fabricante)}${a.modelo ? ", " + esc(a.modelo) : ""}</dd>
    <dt>Número de série</dt><dd>${esc(a.numero_serie || "—")}</dd><dt>Garantia</dt><dd>${a.garantia_ate ? `<span class="badge ${gar ? "b-green" : "b-grey"}">${gar ? "Vigente" : "Vencida"}</span> ${gar ? "até" : "em"} ${fmtD(a.garantia_ate)}` : "—"}</dd>
    <dt>Hotel</dt><dd>${esc(IDX.hotel[a.hotel_id].nome)}</dd><dt>Local</dt><dd>${esc(IDX.local[a.local_id].nome)}</dd><dt>Instalado em</dt><dd>${fmtD(a.instalado_em)}</dd>
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
  ].map(([nome, cat, local, fab, mod], i) => ({ linha: i + 2, nome, cat, local, fab, mod, local_id: loc(local), erro: !cat ? "Categoria em branco" : !loc(local) ? `Local "${local}" não existe no CM` : null }));
};
function pageImplantacao() {
  const s = scope(), imp = DB.implantacao.filter(x => s.hoteis.includes(x.hotel_id));
  const prev = imp.reduce((a, x) => a + x.previstos, 0), cad = imp.reduce((a, x) => a + x.cadastrados, 0), etq = imp.reduce((a, x) => a + x.etiquetados, 0);
  const completos = imp.filter(x => x.cadastrados >= x.previstos).length;
  const caps = DB.capturas_celular.filter(c => s.hoteis.includes(c.hotel_id));
  const U = UI.imp;
  const rows = imp.map(x => { const p = Math.min(100, Math.round(x.cadastrados / x.previstos * 100)), st = p >= 100 ? ["Completo", "b-green"] : p > 0 ? ["Em andamento", "b-amber"] : ["Não iniciado", "b-grey"];
    return `<tr><td>${esc(IDX.hotel[x.hotel_id].nome)}<div class="small muted">${x.onda}</div></td><td><div class="slabar"><div class="trk"><b style="width:${p}%;background:${p >= 100 ? "var(--ok)" : p > 0 ? "var(--amber)" : "var(--dim)"}"></b></div><span>${p}%</span></div></td><td class="num">${x.cadastrados} de ${x.previstos}</td><td class="num">${x.etiquetados}</td><td><span class="badge ${st[1]}">${st[0]}</span></td><td>${x.cadastrados > x.etiquetados ? `<button class="btn sm" data-act="imp-print" data-id="${x.hotel_id}">Imprimir ${x.cadastrados - x.etiquetados} etiquetas</button>` : '<span class="small muted">Etiquetas em dia</span>'}</td></tr>`; }).join("");
  const exemplo = U && U.preview ? U.preview : null;
  const importPanel = exemplo ? `<div class="table-wrap"><table><thead><tr><th class="num">Linha</th><th>Ativo</th><th>Local</th><th>Modelo aplicado</th><th>Situação</th></tr></thead><tbody>${exemplo.map(r => `<tr><td class="num">${r.linha}</td><td>${esc(r.nome)}<div class="small muted">${esc(r.fab)}</div></td><td class="small">${esc(r.local)}</td><td class="small">${r.mod ? esc(IDX.modelo[r.mod].nome) : "—"}</td><td>${r.erro ? `<span class="badge b-red">${esc(r.erro)}</span>` : '<span class="badge b-green">Pronto</span>'}</td></tr>`).join("")}</tbody></table></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="imp-import">Importar ${exemplo.filter(r => !r.erro).length} ativos válidos</button><span class="small muted">As ${exemplo.filter(r => r.erro).length} linhas com erro ficam para correção, sem travar o restante.</span></div>`
    : `<p class="small" style="margin-top:0">Envie a planilha de inventário do hotel. A Central valida cada linha contra os locais do CM e aplica o modelo de ativo, que já traz plano preventivo e checklist.</p>
      ${U && U.done ? `<div class="readonly-note ok">${icon("os")}<span>${U.done}</span></div>` : ""}
      <button class="btn primary" data-act="imp-load">Carregar planilha de exemplo (Hotel Joinville)</button>`;
  return `<div class="grid g-4" style="margin-bottom:16px">
    <div class="panel inst"><div class="lab">Hotéis com inventário completo</div><div class="val">${completos}<small>de ${imp.length}</small></div><div class="foot">Os hotéis do piloto entram completos.</div></div>
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
  </div>`;
}
function novoAtivo(hid, lid, cat, nome, fab, modelo) {
  const n = Math.max(...DB.ativos.map(x => +x.id.split("-")[1])) + 1, h = IDX.hotel[hid];
  const a = { id: "AT-" + String(n).padStart(4, "0"), hotel_id: hid, local_id: lid, categoria_id: cat, nome, fabricante: fab, modelo, numero_serie: cat.toUpperCase() + String(100000 + n * 7), garantia_ate: new Date(Date.now() + 730 * D).toISOString(), anexos: [], criticidade: IDX.cat[cat].critica ? "Alta" : "Média", instalado_em: new Date().toISOString(), qr: "EGV-" + h.cod_totvs + "-" + String(n).padStart(4, "0"), status: "Operando" };
  DB.ativos.push(a); IDX.ativo[a.id] = a;
  const im = DB.implantacao.find(x => x.hotel_id === hid); if (im) im.cadastrados++;
  return a;
}

/* ---------- Hotéis ---------- */
function pageHoteis() {
  const s = scope(), chs = scoped(DB.chamados);
  const bands = DB.bandeiras.filter(b => DB.hoteis.some(h => h.bandeira_id === b.id && s.hoteis.includes(h.id)));
  const nAt = hid => DB.ativos.filter(a => a.hotel_id === hid).length;
  return `<div class="grid g-3-1">
  <div class="panel"><div class="panel-h"><h2>${esc(DB.tenant.nome)}</h2><span class="hint">Grupo, bandeiras e hotéis. Hotéis e UHs vêm do TOTVS CM.</span></div><div class="panel-b">
  <ul class="tree"><li><div class="node"><strong>${esc(DB.tenant.nome)}</strong><span class="muted small">${s.hoteis.length} hotéis visíveis</span></div><ul>
  ${bands.map(b => `<li><div class="node"><strong>${esc(b.nome)}</strong>${b.condo ? '<span class="badge b-blue">condo-hotel</span>' : ""}</div><ul>
    ${DB.hoteis.filter(h => h.bandeira_id === b.id && s.hoteis.includes(h.id)).map(h => {
      const ab = chs.filter(c => c.hotel_id === h.id && OPEN.includes(c.status)).length;
      return `<li><div class="node"><a href="#" data-act="goto-hotel" data-id="${h.id}">${esc(h.nome)}</a><span class="small muted">${h.cidade}/${h.uf}, ${h.uhs} UHs, ${nAt(h.id)} ativos, ${ab} chamados abertos</span><span class="badge b-outline">${h.cod_totvs}</span></div></li>`;
    }).join("")}</ul></li>`).join("")}
  </ul></li></ul></div></div>
  <div class="panel"><div class="panel-h"><h2>Proprietários</h2><span class="hint">Linha Suítes</span></div><div class="panel-b">
  <p class="small">Em condo-hotel, cada proprietário ou locador vê apenas os chamados das próprias UHs.</p>
  <table><tbody>${DB.proprietarios.map(p => { const n = DB.localProprietario.filter(x => x.proprietario_id === p.id && s.hoteis.includes(IDX.local[x.local_id].hotel_id)).length; return n ? `<tr><td>${esc(p.nome)}</td><td class="num small">${n} UHs</td></tr>` : ""; }).join("") || `<tr><td class="muted small">Nenhum proprietário no seu escopo.</td></tr>`}</tbody></table></div></div></div>`;
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
  ${ed ? `<div class="readonly-note">${icon("pol")}<span>Campos em cinza mostram o valor herdado. Preencha para criar uma exceção; apague para voltar a herdar. Novos chamados já usam o valor alterado, e a mudança fica na auditoria.</span></div>` : `<div class="readonly-note">Somente a gestão do CSC altera políticas. Você vê as regras que valem para o seu escopo.</div>`}
  <div class="table-wrap"><table class="sla-grid"><thead><tr><th>Escopo</th>${PRIOS.map(p => `<th class="num">${p}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>
  <h3>Prioridade padrão por categoria</h3>
  <p class="small muted" style="margin-top:0">Quem abre o chamado não precisa escolher a prioridade. Ela vem da categoria, e o CSC ajusta na triagem se precisar.</p>
  <div class="table-wrap"><table class="sla-grid"><thead><tr><th>Categoria</th><th>Prioridade padrão</th><th class="num">Prazo no grupo</th></tr></thead><tbody>
  ${DB.categorias.map(cat => { const pp = pg.prio_padrao[cat.id] || "Média"; return `<tr><td>${esc(cat.nome)}${cat.critica ? ' <span class="badge b-outline">crítico</span>' : ""}</td><td>${ed ? `<select data-act="prio-pad" data-cat="${cat.id}" aria-label="Prioridade padrão de ${esc(cat.nome)}">${PRIOS.map(p => `<option ${p === pp ? "selected" : ""}>${p}</option>`).join("")}</select>` : prio(pp)}</td><td class="num">${pg.sla[pp]} h</td></tr>`; }).join("")}
  </tbody></table></div>
  <h3>Outras regras</h3><dl class="kv"><dt>Horário de atendimento</dt><dd>${esc(pg.horario)} (padrão do grupo)</dd><dt>Escalonamento</dt><dd>Avisar a gestão ao atingir ${pg.escalonar_em}% do prazo; Hotel São Paulo Paulista usa 70%</dd><dt>Aceite</dt><dd>Chamado só encerra com aceite do solicitante</dd></dl>
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
  return `<div class="readonly-note" style="margin-top:0">${icon("integ")}<span><strong>Somente leitura.</strong> A Central lê views acordadas do TOTVS CM e grava uma cópia em área própria. Escrita no CM fica desligada até existir mecanismo homologado por escrito pela TOTVS e pela TI do cliente.</span></div>
  <div class="grid g-4" style="margin:14px 0 18px">
    <div class="panel kpi good"><div class="v">${DB.hoteis.length}</div><div class="l">Hotéis mapeados</div><div class="d">Código CM ligado ao hotel na Central</div></div>
    <div class="panel kpi good"><div class="v">${uhs.toLocaleString("pt-BR")}</div><div class="l">UHs mapeadas</div><div class="d">Sem recadastro manual</div></div>
    <div class="panel kpi"><div class="v">${rel(ig.views[2].ultima).replace("há ", "")}</div><div class="l">Idade do status das UHs</div><div class="d">Atualizado a cada 10 minutos</div></div>
    <div class="panel kpi warn"><div class="v">1</div><div class="l">View com atraso</div><div class="d">A Central segue com o último dado recebido</div></div>
  </div>
  <div class="panel"><div class="panel-h"><h2>Views lidas</h2><span class="hint">${esc(ig.conexao)}</span><div class="spacer"></div>${role() === "csc" ? `<button class="btn" data-act="sync">Sincronizar agora</button>` : ""}</div>
  <div class="panel-b table-wrap"><table><thead><tr><th>View</th><th>Conteúdo</th><th>Frequência</th><th>Última leitura</th><th class="num">Linhas</th><th>Situação</th></tr></thead><tbody>
  ${ig.views.map(v => `<tr><td><span class="id">${v.nome}</span></td><td class="small">${esc(v.conteudo)}</td><td class="small">${v.frequencia}</td><td class="small">${fmtDT(v.ultima)} <span class="muted">(${rel(v.ultima)})</span></td><td class="num">${v.linhas.toLocaleString("pt-BR")}</td><td>${v.status === "ok" ? '<span class="badge b-green">Em dia</span>' : '<span class="badge b-amber">Atrasada</span>'}</td></tr>`).join("")}
  </tbody></table></div></div>
  <div class="grid g-2" style="margin-top:18px">
  <div class="panel"><div class="panel-h"><h2>Últimas execuções</h2></div><div class="panel-b table-wrap"><table><tbody>${ig.execucoes.map(e => `<tr style="white-space:nowrap"><td class="small">${fmtDT(e.t)}</td><td class="small"><span class="id" style="font-size:13px">${e.view}</span></td><td class="small num">${e.linhas} linhas</td><td class="small num">${e.duracao_s} s</td><td class="small">${e.resultado === "Sucesso" ? '<span class="badge b-green">Sucesso</span>' : `<span class="badge b-red">Falha</span> ${esc(e.resultado.replace("Falha: ", ""))}`}</td></tr>`).join("")}</tbody></table></div></div>
  <div class="panel"><div class="panel-h"><h2>O que a Central faz e não faz</h2></div><div class="panel-b">
    <table><thead><tr><th>Operação</th><th>Situação</th></tr></thead><tbody>
    <tr><td>Ler hotéis, UHs e proprietários</td><td><span class="badge b-green">Ativo</span></td></tr>
    <tr><td>Ler status de ocupação e bloqueios de UH</td><td><span class="badge b-green">Ativo</span></td></tr>
    <tr><td>Lembrar a equipe de bloquear UH no CM</td><td><span class="badge b-green">Ativo</span></td></tr>
    <tr><td>Bloquear ou liberar UH direto no CM</td><td><span class="badge b-grey">Desligado até homologação</span></td></tr>
    <tr><td>Gravar em tabelas do CM</td><td><span class="badge b-red">Não permitido</span></td></tr>
    </tbody></table></div></div></div>`;
}

/* ---------- Usuários ---------- */
function escopoTxt(e) {
  if (e.tipo === "grupo") return "Grupo inteiro";
  if (e.tipo === "bandeira") return IDX.band[e.id].nome;
  if (e.tipo === "hotel") return IDX.hotel[e.id].nome;
  return DB.localProprietario.filter(x => x.proprietario_id === e.id).length + " UHs próprias";
}
function pageUsuarios() {
  const us = DB.usuarios;
  const demo = ["u1", "u2", "u3", "u4", "u5"];
  return `<div class="panel"><div class="panel-h"><h2>Perfis para a demonstração</h2><span class="hint">Troque o perfil para ver o mesmo sistema com outro escopo de dados.</span></div><div class="panel-b table-wrap"><table><thead><tr><th>Pessoa</th><th>Papel</th><th>Escopo</th><th></th></tr></thead><tbody>
  ${demo.map(id => { const u = IDX.user[id]; return `<tr><td><span class="row"><span class="avatar">${initials(u.nome)}</span>${esc(u.nome)}</span></td><td>${esc(u.papel)}</td><td>${esc(escopoTxt(u.escopo))}</td><td><button class="btn sm" data-act="as" data-id="${id}" ${id === UI.persona ? "disabled" : ""}>${id === UI.persona ? "Perfil atual" : "Ver como"}</button></td></tr>`; }).join("")}
  </tbody></table>
  <h3>Como o isolamento funciona</h3>
  <p class="small" style="max-width:76ch">Cada acesso é concedido a um escopo: grupo, bandeira, hotel ou UHs de um proprietário. O banco de dados filtra cada consulta pelo escopo de quem pergunta, com segurança por linha (RLS). Um erro de tela não expõe dados de outro hotel.</p></div></div>
  <div class="panel" style="margin-top:18px"><div class="panel-h"><h2>Todos os usuários</h2><span class="hint">${us.length} pessoas</span></div><div class="panel-b table-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Escopo</th></tr></thead><tbody>
  ${us.map(u => `<tr><td>${esc(u.nome)}</td><td class="small muted">${esc(u.email)}</td><td class="small">${esc(u.papel)}</td><td class="small">${esc(escopoTxt(u.escopo))}</td></tr>`).join("")}</tbody></table></div></div>`;
}

/* ---------- Auditoria ---------- */
function pageAuditoria() {
  const s = scope();
  const list = DB.auditoria.filter(a => !a.hotel_id || s.hoteis.includes(a.hotel_id));
  const f = UI.f.au, per = 30, pages = Math.max(1, Math.ceil(list.length / per)); f.page = Math.min(f.page, pages - 1);
  return `<div class="panel"><div class="panel-h"><h2>Quem mudou o quê</h2><span class="hint">Registro permanente de alterações em chamados, OS, políticas e acessos</span></div><div class="panel-b table-wrap"><table><thead><tr><th>Quando</th><th>Quem</th><th>Registro</th><th>Hotel</th><th>O que mudou</th></tr></thead><tbody>
  ${list.slice(f.page * per, f.page * per + per).map(a => `<tr><td class="small">${fmtDT(a.t)}</td><td class="small">${esc(a.usuario)}</td><td class="small">${esc(a.entidade)} <span class="id" style="font-size:13px">${esc(a.registro)}</span></td><td class="small">${a.hotel_id ? esc(IDX.hotel[a.hotel_id].nome) : "Grupo"}</td><td class="small">${esc(a.acao)}</td></tr>`).join("")}
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
    body = `<div class="m-card" style="cursor:default"><div class="r" style="margin:0">${prio(c.prioridade)}${tag(c)}</div><div class="s" style="margin-top:8px">${esc(c.descricao)}</div>${DB.statusUH[c.local_id] ? `<div class="s">UH ${DB.statusUH[c.local_id].toLowerCase()} no CM</div>` : ""}</div>
      <div class="m-card" style="cursor:default"><div class="t">Situação: ${esc(c.status)}</div><div class="s">Aberto ${rel(c.aberto_em)} por ${esc(c.solicitante)}</div></div>
      ${c.status === "Aberto" ? `<button class="m-btn p" data-act="ph-ch" data-id="${c.id}" data-st="Em atendimento">Iniciar atendimento</button>` : ""}
      ${c.status === "Em atendimento" ? `<button class="m-btn p" data-act="ph-ch" data-id="${c.id}" data-st="Aguardando aceite">Concluir serviço</button><button class="m-btn s" data-act="ph-ch" data-id="${c.id}" data-st="Aguardando peça">Aguardar peça</button>` : ""}
      ${c.status === "Aguardando peça" ? `<button class="m-btn p" data-act="ph-ch" data-id="${c.id}" data-st="Em atendimento">Retomar atendimento</button>` : ""}`;
  } else if (P.tab === "hoje") {
    body = `<div class="small muted" style="margin:2px 2px 8px">Chamados atribuídos a você</div>
      ${chs.map(c => `<div class="m-card" data-act="ph-open" data-id="${c.id}"><div class="t">${esc(c.titulo)}</div><div class="s">${esc(IDX.local[c.local_id].nome)}, ${esc(c.status.toLowerCase())}</div><div class="r">${prio(c.prioridade)}${tag(c)}</div></div>`).join("") || `<div class="m-card" style="cursor:default"><div class="s">Nenhum chamado com você agora.</div></div>`}
      <div class="small muted" style="margin:12px 2px 8px">Preventivas de hoje</div>
      ${osHoje.map(o => `<div class="m-card" data-act="ph-open" data-id="${o.id}"><div class="t">${esc(o.titulo.split(" — ")[0])}</div><div class="s">${esc(IDX.ativo[o.ativo_id].nome)}, ${o.status === "Atrasada" ? "atrasada desde " + fmtD(o.programada_para).slice(0, 5) : "às " + fmtDT(o.programada_para).slice(6)}</div><div class="r">${statusBadge(o.status)}<span class="small muted">${o.checklist.filter(c => c.tipo === "medicao" ? c.valor != null : c.ok).length} de ${o.checklist.length} itens</span></div></div>`).join("") || `<div class="m-card" style="cursor:default"><div class="s">Preventivas do dia concluídas.</div></div>`}`;
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

/* ---------- Roadmap ---------- */
function pageRoadmap() {
  return `<p style="max-width:76ch;margin-top:0">Este protótipo mostra o escopo do MVP. As fases seguintes entram depois do piloto, priorizadas pelos dados reais de uso.</p>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
    <div class="panel roadmap-col" style="padding:16px 20px"><h3 style="margin-top:0">MVP, neste protótipo</h3><ul class="small">
      <li>Chamados corretivos com SLA, atribuição e aceite</li><li>Ordens de serviço com checklist, horas e fotos</li><li>Planos preventivos com geração automática de OS</li><li>Políticas de SLA com herança grupo, bandeira e hotel</li><li>App do técnico com leitura de QR e uso sem sinal</li><li>Painel consolidado e por hotel</li><li>Isolamento por escopo, inclusive por proprietário</li><li>Leitura do TOTVS CM e auditoria</li></ul></div>
    <div class="panel roadmap-col f2" style="padding:16px 20px"><h3 style="margin-top:0">Fase 2, após o piloto</h3><ul class="small">
      <li>Portal de fornecedores terceiros</li><li>Orçamento por OS e aprovação por alçada</li><li>Estoque de peças ou integração com ERP</li><li>Abertura e avisos por WhatsApp</li><li>Painéis montáveis e exportações</li><li>Preventiva por horímetro ou leitura</li><li>Pesquisa de satisfação no encerramento</li><li>Bloqueio de UH no CM, só com homologação por escrito</li></ul></div>
    <div class="panel roadmap-col f3" style="padding:16px 20px"><h3 style="margin-top:0">Fase 3, em estudo</h3><ul class="small">
      <li>Sensores em equipamentos críticos</li><li>Manutenção preditiva</li></ul>
      <p class="small muted">Depende de pelo menos 12 meses de histórico consistente de OS por ativo. Não faz parte da proposta atual.</p></div>
  </div>`;
}

const PAGES = { painel: pageDashboard, chamados: pageChamados, os: pageOS, preventiva: pagePreventiva, ativos: pageAtivos, implantacao: pageImplantacao, hoteis: pageHoteis, politicas: pagePoliticas, integracao: pageIntegracao, usuarios: pageUsuarios, auditoria: pageAuditoria, intelligence: pageIntelligence, tecnico: pageTecnico, roadmap: pageRoadmap };

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
  if (updateHash) { const { page } = route(); history.replaceState(null, "", "#/" + page); }
}
function refreshDrawer(id) { const { page } = route(); render(); if (!route().params.id) openDrawer(id, page); }
function showItem(id) { const { page } = route(); go(page, { id }); }

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
    case "sync": DB.integracao.views.forEach(v => { v.ultima = new Date().toISOString(); v.status = "ok"; }); DB.integracao.execucoes.unshift({ t: new Date().toISOString(), view: "todas", linhas: 42, duracao_s: 19, resultado: "Sucesso" }); save(); toast("Leitura do TOTVS CM concluída"); render(); break;
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
        const c = { id: nextId("CH", DB.chamados), hotel_id: at.hotel_id, local_id: at.local_id, ativo_id: at.id, categoria_id: at.categoria_id, titulo: tt.charAt(0).toUpperCase() + tt.slice(1), descricao: "Aberto pelo técnico a partir da etiqueta do ativo.", prioridade: pr, status: "Em atendimento", aberto_em: now, prazo_sla: new Date(Date.now() + e.h * H).toISOString(), sla_h: e.h, atendido_em: now, encerrado_em: null, tecnico_id: TEC, solicitante: "Técnico (app)", eventos: [{ t: now, tipo: "abertura", txt: "Chamado aberto pelo app lendo a etiqueta " + at.qr, por: "Paulo Mendes" }, { t: now, tipo: "sistema", txt: `Prazo de SLA definido: ${e.h} h (prioridade ${pr})` }, { t: now, tipo: "atribuicao", txt: "Atribuído a Paulo Mendes", por: "Paulo Mendes" }], fotos: 1 };
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
