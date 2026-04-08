"""Round 2: combinations of bezier (1), sine+nodes (3), and currents (4)."""
import os
import math
from PIL import Image, ImageDraw

OUT_DIR = "icon-options"
os.makedirs(OUT_DIR, exist_ok=True)

SIZE = 1024
BG = (26, 26, 26, 255)
FG = (255, 255, 255, 255)
RADIUS = 224

def base():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, SIZE - 1, SIZE - 1), radius=RADIUS, fill=BG)
    return img, d


def cubic(p0, p1, p2, p3, steps=300):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def thick(d, pts, width):
    d.line(pts, fill=FG, width=width, joint="curve")


def node(d, c, r):
    d.ellipse((c[0] - r, c[1] - r, c[0] + r, c[1] + r), fill=FG, outline=BG, width=14)


# ─── Mix A: Braided river — 2 anchor nodes + 3 bezier curves between them ───
img, d = base()
NR = 96
EW = 44
n_a = (240, 248)
n_b = (784, 776)
# 3 different bezier paths
paths = [
    ((n_a[0] + 380, n_a[1] - 20), (n_b[0] - 380, n_b[1] + 20)),  # gentle s
    ((n_a[0] + 100, n_a[1] + 380), (n_b[0] - 100, n_b[1] - 380)),  # opposite s
    ((n_a[0] + 480, n_a[1] + 240), (n_b[0] - 480, n_b[1] - 240)),  # tight s
]
for c1, c2 in paths:
    pts = cubic(n_a, c1, c2, n_b, 300)
    thick(d, pts, EW)
node(d, n_a, NR)
node(d, n_b, NR)
img.save(f"{OUT_DIR}/A-braided.png")

# ─── Mix B: Three nodes diagonally with smooth flowing connections ───
img, d = base()
NR = 84
EW = 50
n1 = (224, 264)
n2 = (512, 512)
n3 = (800, 760)
# Curve 1 → 2
c11 = (520, 220)
c12 = (200, 520)
pts = cubic(n1, c11, c12, n2, 300)
thick(d, pts, EW)
# Curve 2 → 3
c21 = (820, 460)
c22 = (480, 820)
pts = cubic(n2, c21, c22, n3, 300)
thick(d, pts, EW)
for c in (n1, n2, n3):
    node(d, c, NR)
img.save(f"{OUT_DIR}/B-trio.png")

# ─── Mix C: Sine wave between two anchor nodes ───
img, d = base()
NR = 100
EW = 50
n_a = (180, 512)
n_b = (844, 512)
amp = 220
left_x, right_x = n_a[0] + NR + 20, n_b[0] - NR - 20
pts = []
for i in range(0, 800):
    t = i / 799
    x = left_x + (right_x - left_x) * t
    y = 512 + amp * math.sin(t * math.pi * 2)
    pts.append((x, y))
thick(d, pts, EW)
node(d, n_a, NR)
node(d, n_b, NR)
img.save(f"{OUT_DIR}/C-wave-anchored.png")

# ─── Mix D: Two paths braided + one node at the merge ───
img, d = base()
NR = 96
EW = 46
n_a = (200, 280)
n_b = (200, 744)
n_c = (824, 512)  # merge point
# Top fork
c1a = (520, 200)
c1b = (560, 480)
pts = cubic(n_a, c1a, c1b, n_c, 300)
thick(d, pts, EW)
# Bottom fork
c2a = (520, 824)
c2b = (560, 544)
pts = cubic(n_b, c2a, c2b, n_c, 300)
thick(d, pts, EW)
node(d, n_a, NR)
node(d, n_b, NR)
node(d, n_c, NR)
img.save(f"{OUT_DIR}/D-merge.png")

# ─── Mix E: Currents with anchor nodes — 3 parallel waves between two ends ───
img, d = base()
NR = 90
EW = 40
n_a = (200, 512)
n_b = (824, 512)
gap = 200
for offset in (-gap, 0, gap):
    p0 = (n_a[0] + NR, n_a[1])
    p1 = (n_a[0] + 320, n_a[1] + offset - 60)
    p2 = (n_b[0] - 320, n_b[1] + offset + 60)
    p3 = (n_b[0] - NR, n_b[1])
    pts = cubic(p0, p1, p2, p3, 300)
    thick(d, pts, EW)
node(d, n_a, NR)
node(d, n_b, NR)
img.save(f"{OUT_DIR}/E-currents-anchored.png")

# ─── Contact sheet ───
files = sorted([f for f in os.listdir(OUT_DIR) if f.startswith(("A-", "B-", "C-", "D-", "E-")) and f.endswith(".png")])
sheet_cols = 3
sheet_rows = math.ceil(len(files) / sheet_cols)
cell, gap = 320, 24
sheet = Image.new("RGBA", (sheet_cols * cell + (sheet_cols + 1) * gap, sheet_rows * cell + (sheet_rows + 1) * gap), (240, 240, 242, 255))
for i, fname in enumerate(files):
    im = Image.open(f"{OUT_DIR}/{fname}").resize((cell, cell), Image.LANCZOS)
    col = i % sheet_cols
    row = i // sheet_cols
    sheet.paste(im, (gap + col * (cell + gap), gap + row * (cell + gap)), im)
sheet.save(f"{OUT_DIR}/contact-sheet-mix.png")

print("wrote", len(files), "options + contact sheet")
