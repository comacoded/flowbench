"""Generate 6 Flowbench icon concepts. All 1024x1024, black bg, white mark."""
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


def quad_bezier(p0, p1, p2, steps=200):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1]
        pts.append((x, y))
    return pts


def cubic_bezier(p0, p1, p2, p3, steps=300):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def thick_polyline(d, pts, width):
    d.line(pts, fill=FG, width=width, joint="curve")


# ─── Option 1: Bezier flow — two nodes joined by a thick S-curve ───
img, d = base()
EW = 56
NR = 88
n_a = (260, 320)
n_b = (764, 704)
ctrl1 = (760, 280)
ctrl2 = (260, 740)
pts = cubic_bezier(n_a, n_b, ctrl1, ctrl2, 300)
# reorder cubic params: p0, p1(ctrl1), p2(ctrl2), p3
pts = cubic_bezier(n_a, ctrl1, ctrl2, n_b, 300)
thick_polyline(d, pts, EW)
for c in (n_a, n_b):
    d.ellipse((c[0] - NR, c[1] - NR, c[0] + NR, c[1] + NR), fill=FG)
img.save(f"{OUT_DIR}/01-bezier.png")

# ─── Option 2: Cascade — three pills stepping down diagonally ───
img, d = base()
PILL_W, PILL_H, R = 380, 88, 44
positions = [(170, 240), (322, 468), (474, 696)]
for x, y in positions:
    d.rounded_rectangle((x, y, x + PILL_W, y + PILL_H), radius=R, fill=FG)
img.save(f"{OUT_DIR}/02-cascade.png")

# ─── Option 3: Sine + nodes — wave with three dots punctuating peaks/troughs ───
img, d = base()
EW = 44
NR = 60
amp = 180
mid_y = SIZE // 2
left = 180
right = SIZE - 180
pts = []
for i in range(0, 1000):
    t = i / 999
    x = left + (right - left) * t
    y = mid_y + amp * math.sin(t * math.pi * 2)
    pts.append((x, y))
thick_polyline(d, pts, EW)
# nodes at peak, trough, peak
node_xs = [left + (right - left) * 0.25, left + (right - left) * 0.5, left + (right - left) * 0.75]
node_ys = [mid_y + amp, mid_y, mid_y - amp]
for cx, cy in zip(node_xs, node_ys):
    d.ellipse((cx - NR, cy - NR, cx + NR, cy + NR), fill=FG, outline=BG, width=14)
img.save(f"{OUT_DIR}/03-sine.png")

# ─── Option 4: Currents — three parallel curving lines ───
img, d = base()
EW = 52
ctrl_x_left = 320
ctrl_x_right = 704
for i, y_offset in enumerate([-220, 0, 220]):
    p0 = (160, mid_y + y_offset - 80)
    p1 = (ctrl_x_left, mid_y + y_offset + 140)
    p2 = (ctrl_x_right, mid_y + y_offset - 140)
    p3 = (864, mid_y + y_offset + 80)
    pts = cubic_bezier(p0, p1, p2, p3, 300)
    thick_polyline(d, pts, EW)
img.save(f"{OUT_DIR}/04-currents.png")

# ─── Option 5: Forward chevrons — three chevrons pointing right ───
img, d = base()
chev_w, chev_h, thick = 220, 360, 64
center_x = SIZE // 2
center_y = SIZE // 2
gap = 80
for i, offset in enumerate([-gap, 0, gap]):
    cx = center_x + offset
    p_top = (cx - chev_w / 2, center_y - chev_h / 2)
    p_tip = (cx + chev_w / 2, center_y)
    p_bot = (cx - chev_w / 2, center_y + chev_h / 2)
    d.line([p_top, p_tip], fill=FG, width=thick, joint="curve")
    d.line([p_tip, p_bot], fill=FG, width=thick, joint="curve")
img.save(f"{OUT_DIR}/05-chevrons.png")

# ─── Option 6: Liquid arrow — single thick arrow with a wave-curved shaft ───
img, d = base()
EW = 80
shaft = []
left = 200
right = 720
for i in range(0, 800):
    t = i / 799
    x = left + (right - left) * t
    y = mid_y + 100 * math.sin(t * math.pi * 1.5)
    shaft.append((x, y))
thick_polyline(d, shaft, EW)
# Arrow head
tip = (824, shaft[-1][1])
head_size = 130
head_thick = 80
d.line([
    (tip[0] - head_size, shaft[-1][1] - head_size),
    tip,
], fill=FG, width=head_thick, joint="curve")
d.line([
    (tip[0] - head_size, shaft[-1][1] + head_size),
    tip,
], fill=FG, width=head_thick, joint="curve")
img.save(f"{OUT_DIR}/06-arrow.png")

# ─── Build a contact sheet ───
sheet_cols = 3
sheet_rows = 2
cell = 320
gap = 24
sheet = Image.new("RGBA", (sheet_cols * cell + (sheet_cols + 1) * gap, sheet_rows * cell + (sheet_rows + 1) * gap), (240, 240, 242, 255))
files = sorted(os.listdir(OUT_DIR))
files = [f for f in files if f.endswith(".png") and f.startswith("0")]
for i, fname in enumerate(files):
    if i >= sheet_cols * sheet_rows:
        break
    im = Image.open(f"{OUT_DIR}/{fname}").resize((cell, cell), Image.LANCZOS)
    col = i % sheet_cols
    row = i // sheet_cols
    x = gap + col * (cell + gap)
    y = gap + row * (cell + gap)
    sheet.paste(im, (x, y), im)
sheet.save(f"{OUT_DIR}/contact-sheet.png")

print("wrote", os.listdir(OUT_DIR))
