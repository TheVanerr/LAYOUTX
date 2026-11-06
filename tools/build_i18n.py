# -*- coding: utf-8 -*-
"""Program dili sözlüğü: tools/i18n-dict.tsv (Türkçe anahtar <TAB> English <TAB> Deutsch) -> app/i18n-dict.js
Kullanım: python tools/build_i18n.py"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(HERE, "i18n-dict.tsv")
out = os.path.join(os.path.dirname(HERE), "app", "i18n-dict.js")
d = {}
for n, line in enumerate(open(src, encoding="utf-8"), 1):
    line = line.rstrip("\n")
    if not line.strip():
        continue
    parts = line.split("\t")
    if len(parts) != 3:
        sys.exit(f"{src}:{n}: 3 sütun olmalı (TR, EN, DE): {line[:60]}")
    d[parts[0]] = [parts[1], parts[2]]
with open(out, "w", encoding="utf-8") as f:
    f.write("/* Program arayüzü sözlüğü (otomatik üretilir: python tools/build_i18n.py; kaynak tools/i18n-dict.tsv). */\n")
    f.write("const LAYOUT_DICT = " + json.dumps(d, ensure_ascii=False, indent=0) + ";\n")
print(f"yazıldı: {out} ({len(d)} metin)")
