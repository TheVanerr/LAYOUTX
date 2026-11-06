# -*- coding: utf-8 -*-
"""Uygulama simgesi: kırmızı zemin üzerinde yerleşim planı sembolü (kesikli servis alanı, makine, bağlantı noktası, ölçü).
Çıktı: app/icon.png (256 px, sekme simgesi) ve app/icon.ico (16–256 px, masaüstü kısayolu).
Kullanım: python tools/make_icon.py"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(os.path.dirname(HERE), "app")
RED, DEEP, WHITE, INK, ORANGE = (230, 0, 0, 255), (176, 0, 0, 255), (255, 255, 255, 255), (27, 30, 37, 255), (245, 165, 36, 255)


def draw(size):
    k = 4                      # yüksek çözünürlükte çizip küçült (kenar yumuşatma)
    S = size * k
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    u = S / 256
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(52 * u), fill=RED)
    d.rounded_rectangle([0, int(214 * u), S - 1, S - 1], radius=int(52 * u), fill=DEEP)
    d.rectangle([0, int(214 * u), S - 1, int(232 * u)], fill=DEEP)
    small = size <= 24
    # kesikli servis alanı
    x0, y0, x1, y1 = 30 * u, 46 * u, 226 * u, 190 * u
    w = (12 if small else 7) * u
    dash, gap = 18 * u, 12 * u
    if small:
        d.rectangle([x0, y0, x1, y1], outline=WHITE, width=int(w))
    else:
        for (a, b, horiz, c) in ((x0, x1, True, y0), (x0, x1, True, y1), (y0, y1, False, x0), (y0, y1, False, x1)):
            t = a
            while t < b:
                e = min(t + dash, b)
                if horiz:
                    d.rectangle([t, c - w / 2, e, c + w / 2], fill=WHITE)
                else:
                    d.rectangle([c - w / 2, t, c + w / 2, e], fill=WHITE)
                t = e + gap
    # makine
    d.rectangle([70 * u, 84 * u, 186 * u, 152 * u], fill=WHITE)
    if not small:
        d.rectangle([84 * u, 96 * u, 120 * u, 140 * u], fill=(255, 214, 214, 255))
        d.rectangle([134 * u, 96 * u, 172 * u, 140 * u], fill=(255, 214, 214, 255))
    # bağlantı noktası
    r = (20 if small else 15) * u
    cx, cy = 186 * u, 152 * u
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ORANGE, outline=INK, width=int(5 * u))
    # ölçü çizgisi (alt bant)
    if size >= 32:
        yy = 223 * u
        d.rectangle([70 * u, yy - 3 * u, 186 * u, yy + 3 * u], fill=WHITE)
        for xx in (70 * u, 186 * u):
            d.rectangle([xx - 3 * u, yy - 11 * u, xx + 3 * u, yy + 11 * u], fill=WHITE)
    return im.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    os.makedirs(APP, exist_ok=True)
    big = draw(256)
    big.save(os.path.join(APP, "icon.png"))
    sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
    frames = [draw(s) for s in sizes]
    frames[-1].save(os.path.join(APP, "icon.ico"), sizes=[(s, s) for s in sizes], append_images=frames[:-1])
    print("yazıldı:", os.path.join(APP, "icon.png"), os.path.join(APP, "icon.ico"))
