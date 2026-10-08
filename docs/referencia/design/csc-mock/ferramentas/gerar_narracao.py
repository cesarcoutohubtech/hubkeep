"""Gera a narração da demonstração guiada a partir das falas em tour.js.

Uso (na pasta do site):
  pip install kokoro-onnx soundfile
  baixe kokoro-v1.0.onnx e voices-v1.0.bin (github.com/thewh1teagle/kokoro-onnx, releases "model-files-v1.0")
  python ferramentas/gerar_narracao.py --modelos /caminho/dos/modelos

Precisa do ffmpeg no PATH. Cada fala vira um MP3 com o hash do conteúdo no nome (cache seguro no Netlify),
e narracao/manifest.js liga a legenda ao arquivo e à duração.
A legenda fica como está; só o texto enviado à síntese é ajustado (PRONUNCIA), para siglas soarem certas.
"""
import argparse, hashlib, json, os, re, subprocess, sys, tempfile

VOZ, VELOCIDADE, IDIOMA = "pf_dora", 1.0, "pt-br"
# Grafia fonética só para a síntese. Ex.: sem isto, siglas como "UHs" saem erradas.
PRONUNCIA = [
    (r"\bPMS\b", "pê ême ésse"),
    (r"\bUH-dias\b", "u agá dias"), (r"\bUHs\b", "u agás"), (r"\bUH\b", "u agá"),
    (r"\bHubKeep\b", "Râb Quíp"), (r"\bEasyGov\b", "Ízi Góv"), (r"\bIntelligence\b", "Intélidjens"),
    (r"\bchecklists\b", "tchéc lists"), (r"\bchecklist\b", "tchéc list"), (r"\bchiller\b", "tchíler"),
    (r"\bbacklog\b", "béc lóg"), (r"\bview\b", "viú"), (r"\bapp\b", "ép"), (r"\bstatus\b", "státus"),
    (r"\bQR\b", "quê érre"), (r"\bSLA\b", "ésse éle á"), (r"\bCSC\b", "cê ésse cê"), (r"\bMVP\b", "ême vê pê"),
]
CADEIA = ("highpass=f=80,equalizer=f=250:t=o:w=1:g=-1.5,equalizer=f=3500:t=o:w=1.2:g=2,deesser=i=0.35,"
          "acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120:makeup=1.5")

def falas(tour):
    src = open(tour, encoding="utf-8").read()
    out = []
    for m in re.finditer(r'a\.(?:say|voice)\("((?:[^"\\]|\\.)*)"|cardVoice\(`[\s\S]*?`,\s*"((?:[^"\\]|\\.)*)"\)', src):
        t = m.group(1) or m.group(2)
        if t not in out: out.append(t)
    return out

def para_sintese(t):
    for a, b in PRONUNCIA: t = re.sub(a, b, t)
    return t

def ff(*args):
    return subprocess.run(["ffmpeg", "-hide_banner", "-y", *args], capture_output=True, text=True, check=True)

def tratar(wav, mp3):
    corte = ("silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.04,areverse,"
             "silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.08,areverse")
    with tempfile.TemporaryDirectory() as d:
        base = os.path.join(d, "b.wav")
        ff("-i", wav, "-af", f"{corte},{CADEIA},aresample=44100:resampler=soxr", base)
        med = ff("-i", base, "-af", "loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json", "-f", "null", "-").stderr
        j = json.loads(med[med.rindex("{"):med.rindex("}") + 1])
        ln = (f"loudnorm=I=-16:TP=-1.5:LRA=7:linear=true:measured_I={j['input_i']}:measured_TP={j['input_tp']}:"
              f"measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}")
        ff("-i", base, "-af", f"{ln},adelay=60,apad=pad_dur=0.12,afade=t=in:d=0.012,aresample=44100", "-ac", "1",
           "-c:a", "libmp3lame", "-b:a", "96k", mp3)
    p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3], capture_output=True, text=True)
    return round(float(p.stdout.strip()) * 1000)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--modelos", default="."); ap.add_argument("--site", default=".")
    a = ap.parse_args()
    from kokoro_onnx import Kokoro
    import soundfile as sf
    k = Kokoro(os.path.join(a.modelos, "kokoro-v1.0.onnx"), os.path.join(a.modelos, "voices-v1.0.bin"))
    pasta = os.path.join(a.site, "narracao"); os.makedirs(pasta, exist_ok=True)
    for f in os.listdir(pasta):
        if f.endswith(".mp3"): os.remove(os.path.join(pasta, f))
    itens = {}
    with tempfile.TemporaryDirectory() as d:
        for i, t in enumerate(falas(os.path.join(a.site, "tour.js")), 1):
            amostras, sr = k.create(para_sintese(t), voice=VOZ, speed=VELOCIDADE, lang=IDIOMA)
            wav = os.path.join(d, f"{i}.wav"); sf.write(wav, amostras, sr)
            tmp = os.path.join(d, f"{i}.mp3"); ms = tratar(wav, tmp)
            h = hashlib.sha1(open(tmp, "rb").read()).hexdigest()[:8]
            nome = f"{i:02d}-{h}.mp3"; os.replace(tmp, os.path.join(pasta, nome))
            itens[t] = {"i": i, "src": f"narracao/{nome}", "ms": ms}
            print(f"{i:02d} {ms:6d} ms  {t[:70]}")
        sil = os.path.join(d, "s.mp3")
        ff("-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "0.25", "-c:a", "libmp3lame", "-b:a", "32k", sil)
        hs = hashlib.sha1(open(sil, "rb").read()).hexdigest()[:8]
        os.replace(sil, os.path.join(pasta, f"silencio-{hs}.mp3"))
    man = {"voz": VOZ, "silencio": f"narracao/silencio-{hs}.mp3", "itens": itens}
    with open(os.path.join(pasta, "manifest.js"), "w", encoding="utf-8") as f:
        f.write("/* Narração gerada por síntese de voz (voz feminina em português), tratada e normalizada a -16 LUFS.\n"
                "   Gerada por ferramentas/gerar_narracao.py. Cada fala está ligada à legenda de mesmo texto. */\n")
        f.write("window.CSC_NARRACAO = " + json.dumps(man, ensure_ascii=False) + ";\n")
    print(len(itens), "falas")

if __name__ == "__main__":
    main()
