# -*- coding: utf-8 -*-
"""Uygulama simgesi: kırmızı zemin üzerinde yerleşim planı (layout) sembolü – kesikli servis alanı, iki bölmeli makine
(üstten görünüş), turuncu bağlantı noktası ve altta ölçü çizgisi.
Çıktılar (app/):
  icon.png (256) · icon.ico (16–256, masaüstü kısayolu) · icons/icon.svg (vektör)
  icons/icon-192.png, icons/icon-512.png (PWA, köşeleri yuvarlak) · icons/maskable-512.png (PWA maskable, güvenli alan içinde)
  icons/apple-touch-icon.png (180, opak)
Kullanım: python tools/make_icon.py"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(os.path.dirname(HERE), "app")
RED, DEEP, WHITE, INK, ORANGE, TANK = (230, 0, 0, 255), (176, 0, 0, 255), (255, 255, 255, 255), (27, 30, 37, 255), (245, 165, 36, 255), (255, 214, 214, 255)


def draw(size, full=False, k=1.0):
    """full: köşesiz, tam dolu zemin (maskable / Apple). k: sembol ölçeği (güvenli alan için < 1)."""
    q = 4
    S = size * q
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if full:
        d.rectangle([0, 0, S, S], fill=RED)
    else:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 52 / 256), fill=RED)
    u = S / 256 * k
    off = (S - 256 * u) / 2

    def P(x, y):
        return off + x * u, off + y * u

    def rect(x0, y0, x1, y1, **kw):
        a, b = P(x0, y0)
        c, e = P(x1, y1)
        d.rectangle([a, b, c, e], **kw)

    if not full:   # alt bant (ölçü şeridi)
        d.rounded_rectangle([0, int(S * 214 / 256), S - 1, S - 1], radius=int(S * 52 / 256), fill=DEEP)
        d.rectangle([0, int(S * 214 / 256), S, int(S * 232 / 256)], fill=DEEP)
    small = size <= 24
    w = (12 if small else 7)
    x0, y0, x1, y1 = 30, 46, 226, 190
    if small:
        a, b = P(x0, y0)
        c, e = P(x1, y1)
        d.rectangle([a, b, c, e], outline=WHITE, width=max(1, int(w * u)))
    else:
        dash, gap = 18, 12
        for (s0, s1, horiz, cc) in ((x0, x1, True, y0), (x0, x1, True, y1), (y0, y1, False, x0), (y0, y1, False, x1)):
            tt = s0
            while tt < s1:
                ee = min(tt + dash, s1)
                if horiz:
                    rect(tt, cc - w / 2, ee, cc + w / 2, fill=WHITE)
                else:
                    rect(cc - w / 2, tt, cc + w / 2, ee, fill=WHITE)
                tt = ee + gap
    rect(70, 84, 186, 152, fill=WHITE)                # makine
    if not small:
        rect(84, 96, 120, 140, fill=TANK)             # bölmeler
        rect(134, 96, 172, 140, fill=TANK)
    r = 20 if small else 15
    cx, cy = P(186, 152)
    d.ellipse([cx - r * u, cy - r * u, cx + r * u, cy + r * u], fill=ORANGE, outline=INK, width=max(1, int(5 * u)))
    if size >= 32:                                    # ölçü çizgisi
        rect(70, 220, 186, 226, fill=WHITE)
        for xx in (70, 186):
            rect(xx - 3, 212, xx + 3, 234, fill=WHITE)
    return im.resize((size, size), Image.LANCZOS)


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="Layout Çizim Motoru">
  <clipPath id="c"><rect width="256" height="256" rx="52"/></clipPath>
  <g clip-path="url(#c)"><rect width="256" height="256" fill="#e60000"/><rect y="214" width="256" height="42" fill="#b00000"/></g>
  <rect x="30" y="46" width="196" height="144" fill="none" stroke="#fff" stroke-width="7" stroke-dasharray="18 12"/>
  <rect x="70" y="84" width="116" height="68" fill="#fff"/>
  <rect x="84" y="96" width="36" height="44" fill="#ffd6d6"/>
  <rect x="134" y="96" width="38" height="44" fill="#ffd6d6"/>
  <circle cx="186" cy="152" r="15" fill="#f5a524" stroke="#1b1e25" stroke-width="5"/>
  <path d="M70 223h116M70 212v22M186 212v22" stroke="#fff" stroke-width="6"/>
</svg>
"""


if __name__ == "__main__":
    os.makedirs(os.path.join(APP, "icons"), exist_ok=True)
    draw(256).save(os.path.join(APP, "icon.png"))
    sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
    frames = [draw(s) for s in sizes]
    frames[-1].save(os.path.join(APP, "icon.ico"), sizes=[(s, s) for s in sizes], append_images=frames[:-1])
    draw(192).save(os.path.join(APP, "icons", "icon-192.png"))
    draw(512).save(os.path.join(APP, "icons", "icon-512.png"))
    draw(512, full=True, k=0.68).save(os.path.join(APP, "icons", "maskable-512.png"))      # sembol %80 güvenli alanın içinde
    draw(180, full=True, k=0.86).convert("RGB").save(os.path.join(APP, "icons", "apple-touch-icon.png"))
    with open(os.path.join(APP, "icons", "icon.svg"), "w", encoding="utf-8") as f:
        f.write(SVG)
    print("yazıldı: app/icon.png, app/icon.ico, app/icons/*")
