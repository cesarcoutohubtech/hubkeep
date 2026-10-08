"""Gera a narração da demonstração guiada com a ElevenLabs.

Uso (no Windows, PowerShell, dentro da pasta csc-mock):
  $env:ELEVENLABS_API_KEY = "sua-chave"
  python ferramentas\\gerar_narracao_elevenlabs.py --voz ID_DA_VOZ --teste 3     # gera só 3 falas, para escolher a voz
  python ferramentas\\gerar_narracao_elevenlabs.py --voz ID_DA_VOZ               # gera as 68 falas

Precisa de Python 3.9+ e do ffmpeg no PATH (winget install Gyan.FFmpeg). Não usa bibliotecas extras.

- Cada fala gerada fica guardada em ferramentas/.cache-elevenlabs. Rodar de novo não gasta créditos
  com falas que não mudaram; só as novas ou alteradas são pedidas à ElevenLabs.
- --apenas 12,30 regera só essas falas (útil quando uma sai com entonação ruim). Use com --refazer.
- A legenda fica como está; só o texto enviado à voz é ajustado (PRONUNCIA), para siglas soarem certas.
- No fim, grava narracao/manifest.js e os MP3 com o hash no nome, como o gerador anterior.
"""
import argparse, hashlib, json, os, subprocess, sys, tempfile, time, urllib.error, urllib.request, re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerar_narracao import falas, ff  # mesma extração das falas em tour.js

BASE = os.environ.get("ELEVENLABS_BASE_URL", "https://api.elevenlabs.io")
PRONUNCIA = [
    (r"\bPMS\b", "pê ême ésse"),
    (r"\bUH-dias\b", "u agá dias"), (r"\bUHs\b", "u agás"), (r"\bUH\b", "u agá"),
    (r"\bSLA\b", "ésse éle á"), (r"\bCSC\b", "cê ésse cê"), (r"\bMVP\b", "ême vê pê"), (r"\bQR\b", "quê érre"),
]
# Só aparar silêncio e igualar o volume: a voz da ElevenLabs já vem tratada.
def tratar(entrada, mp3):
    corte = ("silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse,"
             "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.10,areverse")
    with tempfile.TemporaryDirectory() as d:
        base = os.path.join(d, "b.wav")
        ff("-i", entrada, "-af", f"{corte},aresample=44100", base)
        med = ff("-i", base, "-af", "loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json", "-f", "null", "-").stderr
        j = json.loads(med[med.rindex("{"):med.rindex("}") + 1])
        ln = (f"loudnorm=I=-16:TP=-1.5:LRA=9:linear=true:measured_I={j['input_i']}:measured_TP={j['input_tp']}:"
              f"measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}")
        ff("-i", base, "-af", f"{ln},adelay=60,apad=pad_dur=0.12,afade=t=in:d=0.012,aresample=44100", "-ac", "1",
           "-c:a", "libmp3lame", "-b:a", "128k", mp3)
    p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3], capture_output=True, text=True)
    return round(float(p.stdout.strip()) * 1000)

def para_voz(t):
    for a, b in PRONUNCIA: t = re.sub(a, b, t)
    return t

def pedir(chave, voz, modelo, texto, ajustes, anterior, seguinte, extras=True):
    corpo = {"text": texto, "model_id": modelo, "voice_settings": ajustes}
    if extras:
        corpo["language_code"] = "pt"
        if anterior: corpo["previous_text"] = anterior
        if seguinte: corpo["next_text"] = seguinte
    req = urllib.request.Request(f"{BASE}/v1/text-to-speech/{voz}?output_format=mp3_44100_128", data=json.dumps(corpo).encode("utf-8"),
                                 headers={"xi-api-key": chave, "Content-Type": "application/json", "Accept": "audio/mpeg"}, method="POST")
    for tentativa in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r: return r.read()
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "replace")
            if e.code == 400 and extras and any(k in msg for k in ("language_code", "previous_text", "next_text", "not supported", "unsupported")):
                return pedir(chave, voz, modelo, texto, ajustes, anterior, seguinte, extras=False)  # modelo sem esses campos
            if e.code == 429 and tentativa < 3: time.sleep(5 * (tentativa + 1)); continue
            if e.code == 401:
                m = msg.lower()
                dica = ("a voz escolhida é da biblioteca da comunidade (voz clonada) e o plano atual não permite usá-la pela API. "
                        "Use uma voz padrão da ElevenLabs ou ative um plano pago") if ("ivc_not_permitted" in m or "subscription_required" in m) else \
                       "a chave não tem permissão de Text to Speech" if "permission" in m else \
                       "atividade incomum detectada no plano gratuito (VPN ou várias contas na mesma rede)" if "unusual" in m else \
                       "chave inválida, apagada ou copiada com espaço"
                sys.exit(f"A ElevenLabs recusou o pedido (401): {dica}.\nResposta da ElevenLabs: {msg[:300]}\n"
                         f"Chave em uso: {chave[:6]}...{chave[-4:]} ({len(chave)} caracteres).")
            if "quota" in msg.lower() or "credits" in msg.lower(): sys.exit("Créditos da ElevenLabs insuficientes: " + msg[:300])
            sys.exit(f"Erro {e.code} da ElevenLabs: {msg[:400]}")
        except urllib.error.URLError as e:
            if tentativa < 3: time.sleep(3); continue
            sys.exit(f"Sem conexão com a ElevenLabs: {e}")

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--voz", required=True, help="ID da voz (Vozes > a voz > copiar ID)")
    ap.add_argument("--modelo", default="eleven_v4", help="eleven_v4 (padrão) ou eleven_multilingual_v2")
    ap.add_argument("--estabilidade", type=float, default=0.5, help="0 a 1: mais alto = mais constante, mais baixo = mais expressivo")
    ap.add_argument("--similaridade", type=float, default=0.75)
    ap.add_argument("--estilo", type=float, default=0.15, help="0 a 1: exagero de estilo; acima de 0,3 tende a soar teatral")
    ap.add_argument("--velocidade", type=float, default=1.0, help="0,7 a 1,2")
    ap.add_argument("--teste", type=int, default=0, help="gera só as N primeiras falas, em narracao-teste/, sem mexer na demo")
    ap.add_argument("--apenas", default="", help="números das falas, ex.: 12,30")
    ap.add_argument("--refazer", action="store_true", help="ignora o cache para as falas pedidas (gasta créditos)")
    ap.add_argument("--site", default=".")
    a = ap.parse_args()
    chave = (os.environ.get("ELEVENLABS_API_KEY") or "").strip().strip('"').strip("'") or sys.exit("Defina a variável ELEVENLABS_API_KEY com a sua chave da ElevenLabs.")
    lista = falas(os.path.join(a.site, "tour.js"))
    ajustes = {"stability": a.estabilidade, "similarity_boost": a.similaridade, "style": a.estilo, "use_speaker_boost": True, "speed": a.velocidade}
    alvo = set(int(x) for x in a.apenas.split(",") if x.strip()) if a.apenas else None
    total = sum(len(para_voz(t)) for i, t in enumerate(lista, 1) if (not a.teste or i <= a.teste) and (alvo is None or i in alvo))
    print(f"{len(lista)} falas no roteiro; até {total} caracteres a enviar (o cache evita reenviar o que não mudou).")
    cache = os.path.join(a.site, "ferramentas", ".cache-elevenlabs"); os.makedirs(cache, exist_ok=True)
    pasta = os.path.join(a.site, "narracao-teste" if a.teste else "narracao"); os.makedirs(pasta, exist_ok=True)
    itens, gastos, novos = {}, 0, {}
    with tempfile.TemporaryDirectory() as d:
        for i, t in enumerate(lista, 1):
            if a.teste and i > a.teste: break
            texto = para_voz(t)
            chave_cache = hashlib.sha1(json.dumps([a.voz, a.modelo, ajustes, texto], ensure_ascii=False).encode()).hexdigest()[:16]
            bruto = os.path.join(cache, chave_cache + ".mp3")
            if os.path.exists(bruto) and os.path.getsize(bruto) < 1000: os.remove(bruto)  # resto de uma tentativa que falhou
            pedir_agora = not os.path.exists(bruto) or (a.refazer and (alvo is None or i in alvo))
            if alvo is not None and i not in alvo and not os.path.exists(bruto):
                pedir_agora = True  # sem cache, a fala precisa existir mesmo assim
            if pedir_agora:
                ant = para_voz(lista[i - 2]) if i > 1 else None
                seg = para_voz(lista[i]) if i < len(lista) else None
                audio = pedir(chave, a.voz, a.modelo, texto, ajustes, ant, seg)  # pede antes de abrir o arquivo
                if not audio or len(audio) < 1000 or audio[:1] == b"{":
                    sys.exit("A ElevenLabs não devolveu áudio para a fala %d: %s" % (i, audio[:300].decode("utf-8", "replace") if audio else "resposta vazia"))
                with open(bruto, "wb") as f: f.write(audio)
                gastos += len(texto)
            tmp = os.path.join(d, f"{i}.mp3"); ms = tratar(bruto, tmp)
            h = hashlib.sha1(open(tmp, "rb").read()).hexdigest()[:8]
            nome = f"{i:02d}-{h}.mp3"; novos[nome] = tmp
            itens[t] = {"i": i, "src": f"{os.path.basename(pasta)}/{nome}", "ms": ms}
            print(f"{i:02d} {'nova ' if pedir_agora else 'cache'} {ms:6d} ms  {t[:64]}")
        if a.teste:
            for f in os.listdir(pasta): os.remove(os.path.join(pasta, f))
            for nome, tmp in novos.items(): os.replace(tmp, os.path.join(pasta, nome))
            print(f"\nTeste pronto em {pasta}/. Ouça os arquivos; a demo não foi alterada. Caracteres enviados agora: {gastos}.")
            return
        silencio = [f for f in os.listdir(pasta) if f.startswith("silencio-")]
        for f in os.listdir(pasta):
            if f.endswith(".mp3") and not f.startswith("silencio-"): os.remove(os.path.join(pasta, f))
        for nome, tmp in novos.items(): os.replace(tmp, os.path.join(pasta, nome))
    if not silencio:
        sil = os.path.join(pasta, "silencio.mp3"); ff("-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "0.25", "-c:a", "libmp3lame", "-b:a", "32k", sil)
        hs = hashlib.sha1(open(sil, "rb").read()).hexdigest()[:8]; os.replace(sil, os.path.join(pasta, f"silencio-{hs}.mp3")); silencio = [f"silencio-{hs}.mp3"]
    man = {"voz": f"elevenlabs:{a.voz}:{a.modelo}", "silencio": f"narracao/{silencio[0]}", "itens": itens}
    with open(os.path.join(pasta, "manifest.js"), "w", encoding="utf-8") as f:
        f.write("/* Narração gerada pela ElevenLabs (ferramentas/gerar_narracao_elevenlabs.py), volume igualado em -16 LUFS.\n"
                "   Cada fala está ligada à legenda de mesmo texto. */\n")
        f.write("window.CSC_NARRACAO = " + json.dumps(man, ensure_ascii=False) + ";\n")
    print(f"\n{len(itens)} falas prontas em narracao/. Caracteres enviados nesta rodada: {gastos}. Publique a pasta de novo no Netlify.")

if __name__ == "__main__":
    main()
