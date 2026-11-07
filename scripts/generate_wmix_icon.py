"""Generate the official wMix Windows icon with a black rounded tile and neon-green accent."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

SIZE = 512
out = Path("src-tauri/icons")
out.mkdir(parents=True, exist_ok=True)
image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((8, 8, 504, 504), radius=65, fill="#050505")
font_path = Path("C:/Windows/Fonts/arialbd.ttf")
font = ImageFont.truetype(str(font_path), 142)
label = "wMix"
bounds = draw.textbbox((0, 0), label, font=font)
width = bounds[2] - bounds[0]
x = (SIZE - width) // 2
y = 205 - bounds[1]
draw.text((x, y), label, font=font, fill="white")
# Neon green angled dot above the i, matching the approved identity.
draw.polygon([(x+width*0.68, 189), (x+width*0.78, 189), (x+width*0.75, 209), (x+width*0.65, 209)], fill="#39FF14")
image.save(out / "icon.png")
image.save(out / "icon.ico", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
