"""Generate the Flowbench app icon as a 1024x1024 PNG."""
from PIL import Image, ImageDraw

SIZE = 1024
BG = (26, 26, 26, 255)       # Charcoal text color
FG = (255, 255, 255, 255)
RADIUS = 224                 # macOS-style rounded corner ~22%

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Rounded square background
draw.rounded_rectangle(
    (0, 0, SIZE - 1, SIZE - 1),
    radius=RADIUS,
    fill=BG,
)

# Branching flow graph mark
#         (n1)
#        /    \
#     (n2)    (n3)
#        \    /
#         (n4)

NODE_R = 60
EDGE_W = 18

cx = SIZE // 2
top_y = 280
mid_y = 512
bot_y = 744
spread = 200

n1 = (cx, top_y)
n2 = (cx - spread, mid_y)
n3 = (cx + spread, mid_y)
n4 = (cx, bot_y)

# Edges first (so node circles sit on top)
edges = [(n1, n2), (n1, n3), (n2, n4), (n3, n4)]
for a, b in edges:
    draw.line([a, b], fill=FG, width=EDGE_W)

# Nodes
for cx_, cy_ in (n1, n2, n3, n4):
    draw.ellipse(
        (cx_ - NODE_R, cy_ - NODE_R, cx_ + NODE_R, cy_ + NODE_R),
        fill=FG,
        outline=BG,
        width=12,
    )

img.save("icon.png")
print("wrote icon.png")
