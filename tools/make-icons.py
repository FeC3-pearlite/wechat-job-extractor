#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成扩展图标：绿色圆角方块 + 白色文稿 + 放大镜。"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")
os.makedirs(OUT, exist_ok=True)

GREEN = (7, 193, 96, 255)
GREEN_DARK = (5, 163, 82, 255)
WHITE = (255, 255, 255, 255)


def rounded(size, radius_ratio=0.22):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * radius_ratio)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=GREEN)
    # 左下角稍深，做出一点层次
    d.rounded_rectangle([0, int(size * 0.55), size - 1, size - 1], radius=r, fill=GREEN_DARK)
    d.rounded_rectangle([0, 0, size - 1, int(size * 0.72)], radius=r, fill=GREEN)
    return img


def draw_glyph(img, size):
    d = ImageDraw.Draw(img)
    s = size / 128.0

    # 文稿
    x0, y0, x1, y1 = 30 * s, 24 * s, 84 * s, 104 * s
    d.rounded_rectangle([x0, y0, x1, y1], radius=6 * s, fill=WHITE)
    # 文稿上的横线（挖空成绿色）
    for i in range(3):
        ly = (44 + i * 13) * s
        d.rounded_rectangle([x0 + 10 * s, ly, x1 - 10 * s, ly + 5 * s], radius=2 * s, fill=GREEN)
    # 最后一行短一点
    d.rounded_rectangle([x0 + 10 * s, (44 + 3 * 13) * s, x0 + 28 * s, (44 + 3 * 13) * s + 5 * s], radius=2 * s, fill=GREEN)

    # 放大镜
    cx, cy, r = 88 * s, 84 * s, 22 * s
    ring = max(2, int(7 * s))
    # 白色实心底 + 绿色内圈，保证小尺寸下仍可见
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)
    ir = r - ring
    d.ellipse([cx - ir, cy - ir, cx + ir, cy + ir], fill=GREEN)
    # 手柄
    d.line([(cx + r * 0.72, cy + r * 0.72), (cx + r * 1.55, cy + r * 1.55)],
           fill=WHITE, width=int(9 * s))
    return img


def make(size):
    img = draw_glyph(rounded(size), size)
    return img


for sz in (16, 32, 48, 128):
    p = os.path.join(OUT, "icon%d.png" % sz)
    make(sz).save(p, "PNG")
    print("wrote", p)

# 商店用大图（可选）
make(256).save(os.path.join(OUT, "icon256.png"), "PNG")
print("done")
