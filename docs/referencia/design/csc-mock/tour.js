/* Demonstração guiada do HubKeep.
   Um "vídeo interativo" que opera o próprio mock: cursor animado, destaque nos cliques e legendas.
   Controles: espaço (pausar/continuar), setas (capítulo anterior/próximo), Esc (sair).
   Abrir direto: index.html?tour  |  Gravação sem tela inicial: index.html?tour=auto
   Os dados do usuário são guardados antes e restaurados ao sair. */
(function () {
  const ABORT = "tour-abort";
  const F0 = JSON.parse(JSON.stringify(UI.f));
  const T = { on: false, playing: false, speed: 1, ch: 0, token: 0, x: 0, y: 0, dirty: false, backup: null, t0: 0, elapsed: 0, auto: false,
    narr: true, narrLeft: 0, audio: null, video: false, lineIdx: 0,
    blobs: {}, lineActive: false, lineElapsed: 0, lineMax: 0, blocked: false, preload: null };
  const NARR = (window.CSC_NARRACAO && window.CSC_NARRACAO.itens) || {};
  window.__narrLog = [];
  let root, cursor, spot, cap, capC, capX, bar, playBtn, speedBtn, segs, shield;

  /* ---------- Tempo com pausa e velocidade ---------- */
  function tick(tok, dur, step) {
    return new Promise((res, rej) => {
      let p = 0, last = performance.now();
      const f = now => {
        if (tok !== T.token) return rej(ABORT);
        const dt = Math.min(64, now - last); last = now;
        if (T.playing) { p += dt * T.speed / dur; T.elapsed += dt * T.speed; }
        if (p >= 1) { step && step(1); res(); } else { step && step(p); requestAnimationFrame(f); }
      };
      requestAnimationFrame(f);
    });
  }
  const sleep = (tok, ms) => tick(tok, ms);

  /* ---------- Elementos visuais ---------- */
  function build() {
    root = document.createElement("div"); root.className = "tour-root";
    root.innerHTML = `
      <div class="tour-shield" title="Clique para pausar"></div>
      <div class="tour-spot"></div>
      <div class="tour-cursor"><svg viewBox="0 0 28 28" width="28" height="28"><path d="M3 2l19 11.5-8.3 1.6 4.8 9.2-3.4 1.8-4.8-9.3L4.2 22z" fill="#fff" stroke="#0F3D45" stroke-width="1.8" stroke-linejoin="round"/></svg></div>
      <div class="tour-cap hide" role="status" aria-live="polite"><div class="c"></div><div class="x"></div></div>
      <div class="tour-bar">
        <button class="play" data-t="play" aria-label="Pausar ou continuar">Pausar</button>
        <button data-t="prev" aria-label="Capítulo anterior">Anterior</button>
        <button data-t="next" aria-label="Próximo capítulo">Próximo</button>
        <div class="tour-segs">${CH.map((c, i) => `<button class="tour-seg" data-t="seg" data-i="${i}" title="${c.nome}"><i><b></b></i><span>${i + 1}. ${c.nome}</span></button>`).join("")}</div>
        <button data-t="speed" aria-label="Velocidade">1x</button>
        <button data-t="narr" aria-label="Ligar ou desligar a narração">${Object.keys(NARR).length ? "Narração ligada" : "Sem narração"}</button>
        <button data-t="exit">Sair da demonstração</button>
      </div>`;
    if (new URLSearchParams(location.search).has("video")) { root.classList.add("tour-video"); T.video = true; }
    const mk = document.createElement("div"); mk.className = "tour-marker"; root.appendChild(mk);
    document.body.appendChild(root);
    shield = root.querySelector(".tour-shield"); spot = root.querySelector(".tour-spot"); cursor = root.querySelector(".tour-cursor");
    cap = root.querySelector(".tour-cap"); capC = cap.querySelector(".c"); capX = cap.querySelector(".x");
    bar = root.querySelector(".tour-bar"); playBtn = bar.querySelector('[data-t="play"]'); speedBtn = bar.querySelector('[data-t="speed"]');
    segs = [...bar.querySelectorAll(".tour-seg")];
    T.x = innerWidth * 0.55; T.y = innerHeight * 0.5; placeCursor();
    bar.addEventListener("click", e => {
      const b = e.target.closest("[data-t]"); if (!b) return;
      const a = b.dataset.t;
      if (a === "play") toggle();
      if (a === "prev") gotoCh(Math.max(0, T.ch - 1));
      if (a === "next") gotoCh(Math.min(CH.length - 1, T.ch + 1));
      if (a === "seg") gotoCh(+b.dataset.i);
      if (a === "speed") { T.speed = T.speed === 1 ? 1.25 : T.speed === 1.25 ? 1.5 : 1; speedBtn.textContent = String(T.speed).replace(".", ",") + "x"; if (T.audio) T.audio.playbackRate = T.speed; }
      if (a === "narr" && Object.keys(NARR).length) { T.narr = !T.narr; b.textContent = T.narr ? "Narração ligada" : "Narração desligada"; if (!T.narr) { stopAudio(); hideSoundBtn(); } else unlockAudio(); }
      if (a === "exit") exit();
    });
    shield.addEventListener("click", () => pause());
    requestAnimationFrame(progressLoop);
  }
  function placeCursor() { cursor.style.left = T.x + "px"; cursor.style.top = T.y + "px"; }
  let lastFrame = performance.now();
  function progressLoop() {
    if (!T.on) return;
    const nowF = performance.now(), dt = Math.min(64, nowF - lastFrame); lastFrame = nowF;
    if (T.playing && T.narrLeft > 0) T.narrLeft = Math.max(0, T.narrLeft - dt * T.speed);
    // Enquanto a fala toca de verdade, o roteiro espera por ela (rede lenta não corta a narração)
    if (T.lineActive && T.playing) {
      T.lineElapsed += dt * T.speed;
      if (T.lineElapsed > T.lineMax) T.lineActive = false;
      else T.narrLeft = Math.max(T.narrLeft, 120);
    }
    if (T.spotEl) {
      if (!T.spotEl.isConnected) { T.spotEl = null; spot.classList.remove("on"); }
      else if (nowF - T.spotAt > 400) { const r = T.spotEl.getBoundingClientRect(), p = T.spotPad; spot.style.transition = "opacity .25s"; Object.assign(spot.style, { left: r.left - p + "px", top: r.top - p + "px", width: r.width + p * 2 + "px", height: r.height + p * 2 + "px" }); }
    }
    segs.forEach((s, i) => {
      s.classList.toggle("cur", i === T.ch);
      const w = i < T.ch ? 100 : i > T.ch ? 0 : Math.min(98, T.elapsed / (CH[i].est * 1000) * 100);
      s.querySelector("b").style.width = w + "%";
    });
    requestAnimationFrame(progressLoop);
  }
  function setPlaying(v) {
    T.playing = v; playBtn.textContent = v ? "Pausar" : "Continuar";
    shield.style.display = v ? "block" : "none";
    if (T.audio) { if (v && (T.narrLeft > 0 || T.lineActive) && T.narr && T.audio.src && !T.audio.ended) tryPlay(); else if (!v) T.audio.pause(); }
  }
  function stopAudio() { T.lineActive = false; if (T.audio) { T.audio.pause(); T.audio.removeAttribute("src"); T.audio.load(); } }
  function ensureAudio() {
    if (T.audio) return T.audio;
    const au = T.audio = new Audio(); au.preload = "auto";
    try { au.preservesPitch = true; au.mozPreservesPitch = true; au.webkitPreservesPitch = true; } catch (e) { }
    au.addEventListener("ended", () => { T.lineActive = false; T.narrLeft = Math.min(T.narrLeft, 260); });
    au.addEventListener("error", () => { T.lineActive = false; });
    return au;
  }
  function tryPlay() {
    const au = ensureAudio();
    au.playbackRate = T.speed;
    au.play().then(() => { if (T.blocked) hideSoundBtn(); }).catch(err => { if (err && err.name === "NotAllowedError") { T.lineActive = false; showSoundBtn(); } });
  }
  /* Navegadores bloqueiam som sem um clique. Destrava o elemento de áudio dentro do gesto do usuário. */
  function unlockAudio() {
    const au = ensureAudio();
    if (au.src) return;
    au.src = (window.CSC_NARRACAO && window.CSC_NARRACAO.silencio) || "";
    if (au.src) au.play().then(() => au.pause()).catch(() => { });
  }
  function showSoundBtn() {
    if (T.blocked || !root || T.video) return; T.blocked = true;
    const b = document.createElement("button"); b.className = "tour-sound"; b.dataset.t = "sound"; b.textContent = "Clique para ativar a narração";
    b.addEventListener("click", e => { e.stopPropagation(); hideSoundBtn(); if (T.audio && T.audio.src && T.narr) { T.audio.playbackRate = T.speed; T.audio.play().catch(() => { }); } });
    root.appendChild(b);
  }
  function hideSoundBtn() { T.blocked = false; if (root) root.querySelectorAll(".tour-sound").forEach(x => x.remove()); }
  /* Baixa todas as falas antes (o Netlify serve pela rede; sem isso, a primeira reprodução de cada fala atrasa) */
  function preloadAudio(onProgress) {
    if (T.preload) return T.preload;
    const srcs = [...new Set(Object.values(NARR).map(x => x.src))];
    let done = 0, i = 0;
    const worker = async () => {
      while (i < srcs.length) {
        const src = srcs[i++];
        try { const r = await fetch(src); if (r.ok) T.blobs[src] = URL.createObjectURL(await r.blob()); } catch (e) { }
        done++; onProgress && onProgress(done, srcs.length);
      }
    };
    T.preload = Promise.all(Array.from({ length: 6 }, worker));
    return T.preload;
  }
  function speakLine(text) {
    const it = NARR[text];
    if (!it) { T.narrLeft = 0; return; }
    T.lineIdx++;
    window.__narrLog.push({ i: it.i, t: performance.now() });
    const mk = root.querySelector(".tour-marker");
    if (mk && T.video) { const i = it.i; mk.style.background = `rgb(${40 + (i % 8) * 30},${40 + (Math.floor(i / 8) % 8) * 30},${40 + Math.floor(i / 64) * 30})`; }
    T.narrLeft = it.ms + 380;
    if (T.narr && !T.video) {
      const au = ensureAudio();
      au.src = T.blobs[it.src] || it.src;
      T.lineActive = true; T.lineElapsed = 0; T.lineMax = it.ms + 6000;
      if (T.playing) tryPlay();
    }
  }
  function pause() { if (T.playing) { setPlaying(false); caption(null, "Demonstração pausada. Explore o sistema à vontade; ao continuar, o capítulo recomeça se algo tiver mudado.", true); } }
  function toggle() {
    if (T.playing) return pause();
    setPlaying(true);
    if (T.dirty) { T.dirty = false; gotoCh(T.ch); } else if (T.lastCap) caption(T.lastCap[0], T.lastCap[1]);
  }

  function caption(chapter, text, temp) {
    if (!temp) T.lastCap = [chapter, text];
    capC.textContent = `Capítulo ${T.ch + 1} de ${CH.length}: ${CH[T.ch].nome}`;
    capX.textContent = text; cap.classList.remove("hide");
  }
  function spotOn(el, pad = 6) {
    T.spotEl = el || null; T.spotPad = pad; T.spotAt = performance.now();
    if (!el) { spot.classList.remove("on"); return; }
    const r = el.getBoundingClientRect();
    spot.style.transition = ""; Object.assign(spot.style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px" });
    spot.classList.add("on");
  }
  function ripple() {
    const r = document.createElement("div"); r.className = "tour-ripple"; r.style.left = T.x + "px"; r.style.top = T.y + "px";
    root.appendChild(r); setTimeout(() => r.remove(), 700);
    cursor.classList.add("down"); setTimeout(() => cursor.classList.remove("down"), 160);
    spot.classList.remove("pulse"); void spot.offsetWidth; spot.classList.add("pulse");
  }

  /* ---------- Ações usadas no roteiro ---------- */
  function ctx(tok) {
    const find = async (target, timeout = 3500) => {
      const t0 = performance.now();
      while (performance.now() - t0 < timeout) {
        if (tok !== T.token) throw ABORT;
        const el = typeof target === "function" ? target() : document.querySelector(target);
        if (el && el.getClientRects().length) return el;
        await sleep(tok, 80);
      }
      console.warn("Demonstração: elemento não encontrado", target); return null;
    };
    const ensureVisible = async el => {
      const r = el.getBoundingClientRect();
      const safeTop = 110, safeBottom = innerHeight - 90;
      if (r.top < safeTop || r.bottom > safeBottom) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        await sleep(tok, 520);
      }
    };
    const moveTo = async (el, ox = 0.5, oy = 0.5) => {
      const r = el.getBoundingClientRect();
      const tx = r.left + Math.min(r.width * ox, 220), ty = r.top + r.height * oy;
      const sx = T.x, sy = T.y, dist = Math.hypot(tx - sx, ty - sy);
      const dur = Math.max(320, Math.min(950, dist * 1.1));
      const bend = (Math.random() - 0.5) * Math.min(120, dist * 0.25);
      await tick(tok, dur, p => {
        const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        const nx = -(ty - sy) / (dist || 1), ny = (tx - sx) / (dist || 1), arc = Math.sin(Math.PI * e) * bend;
        T.x = sx + (tx - sx) * e + nx * arc; T.y = sy + (ty - sy) * e + ny * arc; placeCursor();
      });
    };
    const waitVoice = async () => { while (T.narrLeft > 0) { if (tok !== T.token) throw ABORT; await sleep(tok, 40); } };
    const api = {
      say: async (text, ms = 0) => { await waitVoice(); caption(null, text); speakLine(text); if (ms) await sleep(tok, ms); },
      voice: async text => { await waitVoice(); speakLine(text); },
      waitVoice,
      wait: ms => sleep(tok, ms),
      clear: () => spotOn(null),
      point: async (target, { ms = 1600, pad = 6, move = true, ox, oy } = {}) => {
        const el = await find(target); if (!el) return null;
        await ensureVisible(el); spotOn(el, pad);
        if (move) await moveTo(el, ox, oy);
        await sleep(tok, ms); return el;
      },
      click: async (target, { ms = 650, pad = 4, ox, oy, spotEl = true } = {}) => {
        const el = await find(target); if (!el) return null;
        await ensureVisible(el); if (spotEl) spotOn(el, pad);
        await moveTo(el, ox, oy); await sleep(tok, 180);
        ripple(); el.click(); await sleep(tok, ms); return el;
      },
      type: async (target, text, { ms = 500 } = {}) => {
        const el = await find(target); if (!el) return null;
        await ensureVisible(el); spotOn(el, 4); await moveTo(el, 0.2); ripple(); el.focus(); el.value = "";
        for (const ch of text) { el.value += ch; el.dispatchEvent(new Event("input", { bubbles: true })); await sleep(tok, 55 + Math.random() * 45); }
        await sleep(tok, ms); return el;
      },
      setNumber: async (target, text) => {
        const el = await find(target); if (!el) return null;
        await ensureVisible(el); spotOn(el, 4); await moveTo(el); ripple(); el.focus(); el.select && el.select(); await sleep(tok, 250);
        el.value = ""; let acc = ""; for (const ch of text) { acc += ch; if (!/[.,-]$/.test(acc)) el.value = acc.replace(",", "."); await sleep(tok, 120); }
        el.value = text.replace(",", "."); await sleep(tok, 300); el.dispatchEvent(new Event("change", { bubbles: true })); await sleep(tok, 600); return el;
      },
      choose: async (target, value, { ms = 650 } = {}) => {
        const el = await find(target); if (!el) return null;
        await ensureVisible(el); spotOn(el, 4); await moveTo(el, 0.3); await sleep(tok, 150); ripple();
        const v = typeof value === "function" ? value(el) : value;
        el.focus(); await sleep(tok, 350); el.value = v; el.dispatchEvent(new Event("change", { bubbles: true })); await sleep(tok, ms); return el;
      },
      nav: async page => api.click(`.nav a[href="#/${page}"]`, { ms: 800 }),
      setup: async ({ persona = "u1", hash = "#/painel" } = {}) => {
        document.querySelectorAll(".modal-bg, .toast, .drawer, .drawer-bg").forEach(e => e.remove());
        DB = buildSeed(); reindex();
        UI.persona = persona; UI.f = JSON.parse(JSON.stringify(F0)); UI.cal = null; UI.calHotel = null;
        UI.phone = { tab: "hoje", view: null, offline: false, pend: 0, scan: null };
        save(); window.scrollTo(0, 0);
        if (location.hash === hash) render(); else location.hash = hash;
        spotOn(null); await sleep(tok, 450);
      },
      card: async (html, ms) => {
        const c = document.createElement("div"); c.className = "tour-card fade"; c.innerHTML = `<div class="in">${html}</div>`; root.appendChild(c);
        await sleep(tok, 30); c.classList.remove("fade"); cap.classList.add("hide");
        try { await sleep(tok, ms); } finally { c.classList.add("fade"); setTimeout(() => c.remove(), 550); }
      },
      closeDrawer: async () => api.click(".drawer .close", { ms: 500 }),
      cardVoice: async (html, text, minMs = 3600) => {
        const c = document.createElement("div"); c.className = "tour-card fade"; c.innerHTML = `<div class="in">${html}</div>`; root.appendChild(c);
        await sleep(tok, 30); c.classList.remove("fade"); cap.classList.add("hide");
        try { speakLine(text); await sleep(tok, minMs); await waitVoice(); await sleep(tok, 250); } finally { c.classList.add("fade"); setTimeout(() => c.remove(), 550); }
      },
      sign: async target => {
        const cv = await find(target); if (!cv) return null;
        await ensureVisible(cv); spotOn(cv, 4);
        const r = cv.getBoundingClientRect(), g = cv.__g || cv.getContext("2d");
        const pts = []; for (let k = 0; k <= 60; k++) { const u = k / 60; pts.push([0.08 + u * 0.8, 0.62 - 0.28 * Math.sin(u * Math.PI * 3.2) * (1 - u * 0.4) + 0.06 * Math.sin(u * 23)]); }
        const toScr = p => [r.left + p[0] * r.width, r.top + p[1] * r.height], toCv = p => [p[0] * cv.width, p[1] * cv.height];
        const [sx, sy] = toScr(pts[0]); const tmp = document.createElement("div"); Object.assign(tmp.style, { position: "fixed", left: sx + "px", top: sy + "px", width: "1px", height: "1px" }); document.body.appendChild(tmp);
        try { await moveTo(tmp, 0, 0); } finally { tmp.remove(); }
        ripple(); g.beginPath(); g.moveTo(...toCv(pts[0])); let last = 0;
        await tick(tok, 1700, p => { const n = Math.floor(p * (pts.length - 1)); for (let k = last + 1; k <= n; k++) { g.lineTo(...toCv(pts[k])); g.stroke(); } last = Math.max(last, n); const [x, y] = toScr(pts[n]); T.x = x; T.y = y; placeCursor(); });
        cv.dataset.ok = "1"; await sleep(tok, 400); return cv;
      },
      byText: (sel, txt) => () => [...document.querySelectorAll(sel)].find(e => e.textContent.includes(txt))
    };
    return api;
  }

  /* ---------- Roteiro ---------- */
  const CH = [
    {
      nome: "Painel da rede", est: 42, run: async a => {
        await a.setup({ persona: "u1", hash: "#/painel" });
        await a.cardVoice(`<div class="k">${esc(DEMO_CONFIG.plataforma)} para ${esc(DEMO_CONFIG.cliente)}</div><h1>${esc(DEMO_CONFIG.produto)}</h1><p>A operação de manutenção corretiva e preventiva de toda a rede de hotéis, em um só lugar. Uma demonstração de ponta a ponta, do chamado ao aceite.</p>`, "Este é o HubKeep, da EasyGov: a operação de manutenção de toda a rede de hotéis, em um só lugar.");
        await a.say("Marina Costa, gestora do CSC, começa o dia pelo painel. A primeira faixa responde à pergunta mais importante: como está a rede agora.");
        await a.point(".status-band", { ms: 3000 });
        await a.say("Cada traço é um hotel. Vermelho é crítico, âmbar pede atenção, verde-água está normal.");
        await a.point(".health-bar", { ms: 2400, pad: 8 });
        await a.say("Os instrumentos mostram o valor de agora, a tendência e a comparação com o período anterior.");
        await a.point(".grid.g-4 > .inst:nth-child(1)", { ms: 2000 });
        await a.say("SLA cumprido, com a meta de 90% marcada no anel.");
        await a.point(".grid.g-4 > .inst:nth-child(2)", { ms: 2200 });
        await a.say("Preventivas em dia: o termômetro de quanto a equipe se antecipa às quebras.");
        await a.point(".grid.g-4 > .inst:nth-child(4)", { ms: 2000 });
        await a.say("A telemetria por hotel: a luz indica o estado, e as cores mais fortes, mais ocorrências. Os mais graves aparecem no topo.");
        await a.point(".matrix", { ms: 3000 });
        await a.say("A contagem regressiva corre ao vivo, segundo a segundo, para os próximos prazos da rede.");
        await a.point(".cd-list", { ms: 3200 });
        await a.say("Um clique no hotel mais grave leva direto à fila dele, ordenada pelo prazo.");
        await a.click(".matrix tbody tr:first-child", { ms: 900, ox: 0.15 });
        await a.point("table tbody tr:first-child", { ms: 2300, ox: 0.1 });
      }
    },
    {
      nome: "Chamado crítico", est: 24, run: async a => {
        await a.setup({ persona: "u1", hash: "#/chamados" });
        await a.say("Um elevador parou no Hotel Curitiba Batel. Marina busca o chamado.");
        await a.type('input[data-f="ch.q"]', "Elevador social 2", { ms: 900 });
        await a.click(() => UI.f.ch.q === "Elevador social 2" && document.querySelector("tr[data-act=open-ch]"), { ms: 900, ox: 0.1 });
        await a.say("Prioridade crítica: o prazo é de 2 horas, pela regra do grupo. A etiqueta mostra quanto tempo resta.");
        await a.point(".drawer-h .row", { ms: 2600 });
        await a.say("O chamado está ligado ao ativo, ao local, à origem e a quem executa o serviço.");
        await a.point(".drawer .kv", { ms: 2400 });
        await a.say("O elevador está registrado como parado. Esse tempo entra no histórico de indisponibilidade do equipamento.");
        await a.point("#parada", { ms: 2400 });
        await a.say("Tudo fica no histórico, com data, hora e autor.");
        await a.point(".drawer .timeline", { ms: 2400 });
        await a.closeDrawer();
      }
    },
    {
      nome: "Abrir chamado", est: 55, run: async a => {
        await a.setup({ persona: "u1", hash: "#/chamados" });
        await a.say("A recepção do Suítes Balneário Camboriú relata um vazamento. Abrir o chamado leva segundos: onde foi, o que aconteceu e uma foto.");
        await a.click("[data-act=novo-ch]", { ms: 700 });
        await a.choose("#nc-hotel", "h11");
        await a.choose("#nc-local", "h11-u612");
        await a.type("#nc-desc", "Vazamento embaixo da pia do banheiro");
        await a.click("[data-act=nc-foto]", { ms: 700 });
        await a.say("Quem abre não precisa escolher categoria nem prioridade. Sem categoria, o chamado vai para a triagem do CSC, com um prazo provisório.");
        await a.point("#nc-sla", { ms: 2200 });
        await a.click("[data-act=nc-save]", { ms: 1000 });
        await a.say("Na triagem, Marina classifica como hidráulica. Por ser um vazamento ativo, ela sobe a prioridade para alta.");
        await a.choose("#tr-cat", "c13");
        await a.choose("#tr-prio", "Alta");
        await a.click("[data-act=triar]", { ms: 1000 });
        await a.say("O prazo passa a 4 horas, herdado da Linha Suítes. A regra vem da política, não do código.");
        await a.point(".drawer-h .row", { ms: 2200 });
        await a.say("Agora ela escolhe o técnico, e o atendimento começa. Uma ordem de serviço é criada junto.");
        await a.choose("#atrib", el => el.options[1].value);
        await a.click("[data-act=atribuir]", { ms: 900 });
        await a.click('[data-act=ch-st][data-st="Em atendimento"]', { ms: 900 });
        await a.say("Cada passo entrou no histórico, com o nome de quem fez.");
        await a.point(".drawer .timeline", { ms: 2200 });
        await a.closeDrawer();
      }
    },
    {
      nome: "Aceite com assinatura", est: 40, run: async a => {
        await a.setup({ persona: "u1", hash: "#/chamados" });
        await a.say("Serviço concluído não fecha sozinho. O chamado espera o aceite de quem pediu.");
        await a.choose('select[data-f="ch.status"]', "Aguardando aceite", { ms: 900 });
        await a.click("tr[data-act=open-ch]", { ms: 900, ox: 0.1 });
        await a.click("[data-act=aceite]", { ms: 800 });
        await a.say("No aceite ficam registrados quem executou, a equipe interna ou um fornecedor, e o custo informado.");
        await a.choose("#ac-exec", el => { const b = document.querySelector("[data-act=ac-save]"), c = b && IDX.ch[b.dataset.id], f = c && DB.fornecedores.find(x => x.categorias.includes(c.categoria_id)); return f ? f.id : "interna"; });
        await a.setNumber("#ac-custo", "380");
        await a.say("Os códigos de falha, causa e solução alimentam os indicadores. A política decide se eles são obrigatórios.");
        await a.choose("#ac-falha", el => el.options[1].value, { ms: 350 });
        await a.choose("#ac-causa", el => el.options[1].value, { ms: 350 });
        await a.choose("#ac-sol", el => el.options[1].value, { ms: 350 });
        await a.say("Quem pediu assina no celular. E uma regra vale para todos: quem executou o serviço não aceita o próprio trabalho.");
        await a.sign("#ac-sig");
        await a.click("[data-act=ac-save]", { ms: 1100 });
        await a.say("A assinatura e o custo ficam no chamado e na ordem de serviço, que pode ser impressa.");
        await a.point(".drawer .sig-view", { ms: 2400 });
        await a.closeDrawer();
      }
    },
    {
      nome: "Políticas de SLA", est: 38, run: async a => {
        await a.setup({ persona: "u1", hash: "#/politicas" });
        await a.say("Os prazos são configuração. O grupo define o padrão para cada prioridade.");
        await a.point("table.sla-grid tbody tr:first-child", { ms: 2200 });
        await a.say("A Linha Suítes tem uma exceção: prioridade alta em 4 horas. Os hotéis dela herdam a regra.");
        await a.point(a.byText("table.sla-grid tbody tr", "Linha Suítes"), { ms: 2400 });
        await a.say("Marina cria uma exceção para o Hotel Curitiba Batel: alta em 6 horas.");
        await a.setNumber('[data-act=sla][data-tipo=hotel][data-id=h1][data-pr="Alta"]', "6");
        await a.point('[data-act=sla][data-tipo=hotel][data-id=h1][data-pr="Alta"]', { ms: 1400, move: false, pad: 8 });
        await a.say("A prioridade padrão de cada categoria também é política. Elevador e câmara fria já nascem críticos.");
        await a.point(() => { const h = [...document.querySelectorAll("h3")].find(x => x.textContent.includes("Prioridade padrão")); return h && h.nextElementSibling && h.nextElementSibling.nextElementSibling; }, { ms: 2600 });
        await a.say("E cada categoria tem o seu relógio: elevador parado conta 24 horas por dia; pintura conta só no horário comercial, com feriados.");
        await a.point(() => { const el = document.querySelector('[data-act=relogio][data-cat="c16"]'); return el && el.closest("tr"); }, { ms: 2600 });
        await a.say("As mudanças valem para os próximos chamados e ficam registradas na auditoria.");
        await a.nav("auditoria");
        await a.point("table tbody tr:first-child", { ms: 2400, ox: 0.1 });
      }
    },
    {
      nome: "Preventiva", est: 26, run: async a => {
        await a.setup({ persona: "u1", hash: "#/preventiva" });
        await a.say("Os planos preventivos são definidos por categoria de ativo, com periodicidade e checklist.");
        await a.point(".content > .panel:first-child table", { ms: 2400 });
        await a.say("As ordens de serviço são geradas sozinhas no calendário de cada hotel, no fuso dele.");
        await a.point(".cal", { ms: 2200 });
        await a.say("O checklist é tipado: sim ou não, lista, data, foto obrigatória e medições com a faixa aceitável. O que sai da faixa fica marcado no histórico do ativo.");
        await a.click(() => [...document.querySelectorAll(".cal .ev.ok")].find(e => /chiller|gerador|câmara|bomba|piscina|aquecimento/i.test(e.title)) || document.querySelector(".cal .ev:not(.more)"), { ms: 900 });
        await a.point(() => document.querySelector(".drawer .check-item.med") || document.querySelector(".drawer .check-item"), { ms: 2600 });
        await a.closeDrawer();
      }
    },
    {
      nome: "Implantação de ativos", est: 55, run: async a => {
        await a.setup({ persona: "u1", hash: "#/implantacao" });
        await a.say("Implantar a rede começa pelo inventário de ativos. A Central acompanha o progresso de cada hotel, onda por onda.");
        await a.point(".content > .grid.g-3-1 > .panel:first-child", { ms: 2400 });
        await a.say("A planilha do hotel é validada linha a linha contra os locais que vêm do PMS.");
        await a.click("[data-act=imp-load]", { ms: 900 });
        await a.point(".content > .grid.g-2 > .panel:first-child table", { ms: 2200 });
        await a.say("As linhas válidas entram já com o plano preventivo e o checklist do modelo. As com erro ficam para correção, sem travar o resto.");
        await a.click("[data-act=imp-import]", { ms: 1000 });
        await a.point(".readonly-note.ok", { ms: 1800 });
        await a.say("O técnico também cadastra pelo celular, fotografando a placa do equipamento. O CSC revisa e aprova.");
        await a.click("[data-act=imp-approve]", { ms: 1000 });
        await a.say("E as etiquetas QR saem em lote, prontas para colar nos equipamentos.");
        await a.click("[data-act=imp-print]", { ms: 1200 });
        await a.say("Hotel novo começa pelo pacote da bandeira: modelos, checklists e planos copiados de uma vez. A meta é implantar em um dia.");
        await a.click('[data-act=pkg-apply][data-id="ab1"]', { ms: 1100 });
        await a.point(() => { const b = [...document.querySelectorAll(".steps")][0]; return b && b.closest(".panel"); }, { ms: 2400 });
      }
    },
    {
      nome: "App do técnico", est: 55, run: async a => {
        await a.setup({ persona: "u1", hash: "#/tecnico" });
        await a.say("Este é o celular de Paulo, técnico do Hotel Curitiba Batel. A fila junta chamados e preventivas do dia.");
        await a.point(".phone", { ms: 2400, pad: 2 });
        await a.say("Ele desce para a casa de máquinas, onde não há sinal.");
        await a.click("[data-act=ph-net]", { ms: 900 });
        await a.say("Abre a primeira preventiva do dia e segue o checklist: marca os itens e digita as medições.");
        await a.click('#phone .m-card[data-id^="OS-"]', { ms: 800 });
        const osId = (document.querySelector("#phone [data-act=ph-concluir]") || {}).dataset?.id, oo = osId && IDX.os[osId];
        if (oo) for (let i = 0; i < oo.checklist.length; i++) {
          const it = oo.checklist[i];
          if (it.tipo === "medicao") await a.setNumber(`#phone [data-act=ph-med][data-i="${i}"]`, String(Math.round((it.min + (it.max - it.min) * 0.5) * 10) / 10));
          else if (it.tipo === "lista") await a.choose(`#phone [data-act=ph-list][data-i="${i}"]`, it.opcoes[0], { ms: 300 });
          else if (it.tipo === "data") await a.choose(`#phone [data-act=ph-date][data-i="${i}"]`, new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10), { ms: 300 });
          else if (it.tipo === "foto") await a.click(`#phone [data-act=ph-fotoit][data-i="${i}"]`, { ms: 300, spotEl: false });
          else await a.click(`#phone [data-act=ph-chk][data-i="${i}"]`, { ms: 250, spotEl: false });
        }
        await a.click("[data-act=ph-concluir]", { ms: 900 });
        await a.say("Sem conexão, o app guarda as ações e mostra quantas faltam enviar.");
        await a.point("#phone .m-net", { ms: 2200 });
        await a.say("De volta ao sinal, tudo é enviado.");
        await a.click("[data-act=ph-net]", { ms: 1300 });
        await a.say("Paulo percebe um ruído na bomba. Ele lê a etiqueta do equipamento para abrir um chamado.");
        await a.click("[data-act=ph-tab][data-k=abrir]", { ms: 600 });
        await a.click("[data-act=ph-scan]", { ms: 900 });
        await a.point("#phone .m-body", { ms: 1500 });
        await a.click("[data-act=ph-abrir]", { ms: 1300 });
        await a.say("No CSC, o que Paulo fez já aparece na auditoria.");
        await a.nav("auditoria");
        await a.point("table tbody tr:first-child", { ms: 1800, ox: 0.1 });
        await a.point("table tbody tr:nth-child(2)", { ms: 1600, ox: 0.1 });
      }
    },
    {
      nome: "Indicadores", est: 32, run: async a => {
        await a.setup({ persona: "u1", hash: "#/indicadores" });
        await a.say("Os indicadores saem das transições de cada ordem de serviço, sem planilha paralela.");
        await a.point("#ind-kpis", { ms: 2400 });
        await a.say("UH-dias perdidos mostram quanto a manutenção tirou de venda. A razão entre preventiva e corretiva mostra se a equipe se antecipa.");
        await a.point("#ind-kpis > .inst:nth-child(6)", { ms: 2000 });
        await a.point("#ind-kpis > .inst:nth-child(5)", { ms: 1600 });
        await a.say("Os hotéis se comparam só dentro da mesma bandeira, com o melhor resultado em destaque.");
        await a.point("#ind-comp", { ms: 2600 });
        await a.say("E o backlog por idade mostra o que está envelhecendo na fila. Tudo exporta em planilha, respeitando o escopo de quem exporta.");
        await a.point("#ind-idade", { ms: 2200 });
      }
    },
    {
      nome: "Acesso por escopo", est: 46, run: async a => {
        await a.setup({ persona: "u1", hash: "#/painel" });
        await a.say("O mesmo sistema, com dados diferentes para cada pessoa. Vamos ver como Juliana, gerente de um hotel.");
        await a.choose("#persona", "u3", { ms: 900 });
        await a.say("Juliana vê só o Hotel Curitiba Batel. O filtro é aplicado no banco de dados, não apenas na tela.");
        await a.point(".scopebar", { ms: 2400, pad: 0 });
        await a.point(".matrix", { ms: 1800 });
        await a.say("Agora Helena, proprietária de três UHs no Suítes Balneário Camboriú, um hotel administrado.");
        await a.choose("#persona", "u5", { ms: 900 });
        await a.point(".scopebar", { ms: 2200, pad: 0 });
        await a.say("O menu dela é enxuto: painel e chamados das próprias unidades.");
        await a.point(".nav", { ms: 2000 });
        await a.nav("chamados");
        await a.click("tr[data-act=open-ch]", { ms: 900, ox: 0.1 });
        await a.say("Ela acompanha o andamento, mas não altera nada.");
        await a.point(() => [...document.querySelectorAll(".drawer .readonly-note")].pop(), { ms: 2400 });
        await a.closeDrawer();
        await a.say("No hotel arrendado, o locador vê só o que o contrato põe sob a responsabilidade dele.");
        await a.choose("#persona", "u90", { ms: 900 });
        await a.point(".scopebar", { ms: 2400, pad: 0 });
      }
    },
    {
      nome: "Integração PMS", est: 32, run: async a => {
        await a.setup({ persona: "u1", hash: "#/integracao" });
        await a.say("Hotéis, UHs e status de ocupação vêm do PMS. A integração é somente leitura, e o produto funciona mesmo sem ela.");
        await a.point(".content > .readonly-note", { ms: 2600 });
        await a.say("Cada view tem frequência, idade do dado e situação. Se o PMS cair, a Central segue com o último dado.");
        await a.point(() => { const p = a.byText(".panel", "Views lidas")(); return p && p.querySelector("table"); }, { ms: 2600 });
        await a.click("[data-act=sync]", { ms: 1100 });
        await a.say("A ficha de conexão de cada hotel avisa quando o dado passa do limite de cinco minutos.");
        await a.point(() => { const p = a.byText(".panel", "Ficha de conexão")(); return p && p.querySelector("table"); }, { ms: 2400 });
        await a.say("E fica claro o que a Central faz e o que depende de homologação.");
        await a.point(() => { const p = a.byText(".panel", "faz e não faz")(); return p && p.querySelector("table"); }, { ms: 2600 });
      }
    },
    {
      nome: "Intelligence", est: 40, run: async a => {
        await a.setup({ persona: "u1", hash: "#/inteligencia" });
        await a.say("A HubKeep Intelligence é um módulo opcional. Ela aponta onde agir primeiro, a partir dos dados de manutenção.");
        await a.point("#ia-lista tbody tr", { ms: 2400 });
        await a.say("Todo resultado mostra de onde veio: cada componente, o peso e a versão da política.");
        await a.point("#ia-calc", { ms: 3000 });
        await a.say("Ela também mede se a intervenção resolveu, comparando 90 dias antes e 90 dias depois.");
        await a.point("#intel-ef table", { ms: 2600 });
        await a.say("E encontra o mesmo problema em vários hotéis, o que aponta para o modelo do equipamento, e não para a equipe.");
        await a.point('#ia-lista tr[data-tipo="sistemico"]', { ms: 2600 });
      }
    },
    {
      nome: "Próximas fases", est: 26, run: async a => {
        await a.setup({ persona: "u1", hash: "#/roadmap" });
        await a.say("O MVP cobre o ciclo completo. Logo depois vêm a conformidade legal e a integração com o EasyGov.");
        await a.point(".roadmap-col", { ms: 2300 });
        await a.point(".roadmap-col.f2", { ms: 2300 });
        await a.point(".roadmap-col.f3", { ms: 1800 });
        await a.say("E o piloto, em quatro hotéis que cobrem a matriz de modelos, é medido por critérios que entram no contrato.");
        await a.point("#criterios", { ms: 2600 });
        a.clear();
        a.voice("Do chamado ao aceite, da preventiva à Intelligence, cada pessoa vê só o que é dela. Este foi o HubKeep.");
        await a.card(`<div class="k">Fim da demonstração</div><h1>${esc(DEMO_CONFIG.produto)}</h1><p>Do chamado ao aceite, da preventiva à Intelligence, com cada pessoa vendo só o que é dela.</p><div><button class="p" data-tour="again">Assistir de novo</button><button data-tour="explore">Explorar o sistema</button></div>`, 600000);
      }
    }
  ];

  /* ---------- Controle de capítulos ---------- */
  async function gotoCh(i) {
    T.token++; const tok = T.token; T.ch = i; T.elapsed = 0; T.dirty = false; T.narrLeft = 0; stopAudio();
    root.querySelectorAll(".tour-card").forEach(c => c.remove());
    if (!T.playing) setPlaying(true);
    try {
      const c = ctx(tok);
      await CH[i].run(c);
      await c.waitVoice(); await c.wait(500);
      if (tok !== T.token) return;
      if (i < CH.length - 1) gotoCh(i + 1);
    } catch (e) { if (e !== ABORT) { console.error(e); if (tok === T.token && i < CH.length - 1) gotoCh(i + 1); } }
  }
  function start(auto) {
    if (T.on) return;
    try { T.backup = { data: localStorage.getItem(STORE_KEY), persona: localStorage.getItem(PERSONA_KEY) }; } catch (e) { T.backup = null; }
    T.on = true; T.auto = auto; build();
    if (auto) { preloadAudio(); gotoCh(0); return; }
    // tela inicial com o índice de capítulos
    T.token++;
    setPlaying(false); shield.style.display = "none";
    const c = document.createElement("div"); c.className = "tour-card";
    c.innerHTML = `<div class="in"><div class="k">Demonstração guiada</div><h1>${esc(DEMO_CONFIG.produto)}</h1><p>O sistema se opera sozinho, como um vídeo. Pause a qualquer momento para explorar, ou pule entre os capítulos na barra inferior.</p>
      <div class="chap">${CH.map((x, i) => `<div><b>${i + 1}</b>${x.nome}</div>`).join("")}</div>
      <div><button class="p" data-tour="play">Assistir demonstração</button><button data-tour="close">Voltar ao sistema</button></div>
      <div class="tag-line"><span>Cerca de ${Math.round(CH.reduce((s, x) => s + x.est, 0) / 60)} minutos, com narração</span><span>Espaço pausa, setas trocam de capítulo</span></div>
      ${Object.keys(NARR).length ? `<div class="tour-load" id="tour-load">Preparando a narração<i><b></b></i></div>` : ""}</div>`;
    root.appendChild(c);
    preloadAudio((d, n) => { const el = document.getElementById("tour-load"); if (!el) return; el.querySelector("b").style.width = (d / n * 100) + "%"; if (d === n) el.firstChild.textContent = "Narração pronta"; });
  }
  function exit() {
    T.token++; T.on = false; T.playing = false; stopAudio(); hideSoundBtn();
    if (root) root.remove(); root = null;
    document.querySelectorAll(".modal-bg, .drawer, .drawer-bg").forEach(e => e.remove());
    try {
      if (T.backup) {
        if (T.backup.data) localStorage.setItem(STORE_KEY, T.backup.data); else localStorage.removeItem(STORE_KEY);
        if (T.backup.persona) localStorage.setItem(PERSONA_KEY, T.backup.persona); else localStorage.removeItem(PERSONA_KEY);
      }
    } catch (e) { }
    DB = null; UI.persona = "u1"; UI.f = JSON.parse(JSON.stringify(F0)); UI.phone = { tab: "hoje", view: null, offline: false, pend: 0, scan: null };
    load();
    if (location.search.includes("tour")) history.replaceState(null, "", location.pathname + "#/painel");
    if (location.hash !== "#/painel") location.hash = "#/painel"; else render();
  }

  document.addEventListener("click", e => {
    const b = e.target.closest("[data-tour]");
    if (b) {
      e.stopPropagation();
      const a = b.dataset.tour;
      if (a === "play") { unlockAudio(); root.querySelectorAll(".tour-card").forEach(c => c.remove()); gotoCh(0); }
      if (a === "again") { unlockAudio(); gotoCh(0); }
      if (a === "close" || a === "explore") exit();
      return;
    }
    const s = e.target.closest('[data-act="tour"]');
    if (s) { e.preventDefault(); start(false); return; }
    if (T.on && !T.playing && e.isTrusted && !e.target.closest(".tour-root")) T.dirty = true;
  }, true);
  document.addEventListener("change", e => { if (T.on && !T.playing && e.isTrusted) T.dirty = true; }, true);
  document.addEventListener("keydown", e => {
    if (!T.on || !root) return;
    if (e.target.matches("input, textarea, select") && !T.playing) return;
    if (e.key === " ") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); gotoCh(Math.min(CH.length - 1, T.ch + 1)); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); gotoCh(Math.max(0, T.ch - 1)); }
    else if (e.key === "Escape") { e.stopPropagation(); exit(); }
  }, true);

  const q = new URLSearchParams(location.search);
  if (q.has("tour")) setTimeout(() => start(q.get("tour") === "auto"), 300);
  window.CSCTour = { start, exit, gotoCh, state: T };
})();
