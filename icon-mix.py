"""Round 2: combinations of bezier (1), sine+nodes (3), and currents (4)."""
import os
import math
from PIL import Image, ImageDraw

OUT_DIR = "icon-options"
os.makedirs(OUT_DIR, exist_ok=True)

SIZE = 1024
BG = (26, 26, 26, 255)
FG = (255, 255, 255, 255)

# macOS icon template: visible rounded square sits inside ~80% of the
# canvas with transparent padding around it.
ICON_INSET = 100        # transparent padding from each edge
ICON_LEFT = ICON_INSET
ICON_TOP = ICON_INSET
ICON_RIGHT = SIZE - ICON_INSET
ICON_BOTTOM = SIZE - ICON_INSET
ICON_SIZE = ICON_RIGHT - ICON_LEFT       # 824
RADIUS = 185                              # macOS-style ~22% of inner size

def base():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(
        (ICON_LEFT, ICON_TOP, ICON_RIGHT, ICON_BOTTOM),
        radius=RADIUS,
        fill=BG,
    )
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

# ─── Mix D: Two paths braided + one node at the merge — fits inner canvas ───
img, d = base()
# Inner padding inside the 824×824 visible icon
PAD = 140
NR = 58
EW = 30
left_x = ICON_LEFT + PAD
right_x = ICON_RIGHT - PAD
top_y = ICON_TOP + PAD + 40
bot_y = ICON_BOTTOM - PAD - 40
mid_y = SIZE // 2
n_a = (left_x, top_y)
n_b = (left_x, bot_y)
n_c = (right_x, mid_y)  # merge point
mid_x = (left_x + right_x) // 2
# Top fork
c1a = (mid_x + 30, top_y - 10)
c1b = (mid_x + 70, mid_y - 20)
pts = cubic(n_a, c1a, c1b, n_c, 300)
thick(d, pts, EW)
# Bottom fork
c2a = (mid_x + 30, bot_y + 10)
c2b = (mid_x + 70, mid_y + 20)
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
