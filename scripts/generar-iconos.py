# Dibuja los íconos PNG de la app (mismo diseño que public/favicon.svg).
# Uso: python scripts/generar-iconos.py   (necesita Pillow: pip install pillow)
from pathlib import Path
from PIL import Image, ImageDraw

PUBLICO = Path(__file__).resolve().parent.parent / "public"
VERDE = (30, 122, 76, 255)
HOJA = (168, 236, 122, 255)
BLANCO = (255, 255, 255, 255)


def dibujar(tam, redondeado):
    s = 8  # se dibuja 8 veces más grande y se achica, para bordes suaves
    t = tam * s
    u = t / 64  # unidades del SVG (64 x 64)
    img = Image.new("RGBA", (t, t), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if redondeado:
        d.rounded_rectangle([0, 0, t - 1, t - 1], radius=int(15 * u), fill=VERDE)
    else:
        d.rectangle([0, 0, t, t], fill=VERDE)
    cx, cy = 30 * u, 35 * u
    d.ellipse([cx - 19.5 * u, cy - 19.5 * u, cx + 19.5 * u, cy + 19.5 * u], fill=BLANCO)
    d.ellipse([cx - 14.5 * u, cy - 14.5 * u, cx + 14.5 * u, cy + 14.5 * u], fill=VERDE)
    claro = tuple(int(v * 0.65 + 255 * 0.35) for v in VERDE[:3]) + (255,)
    d.ellipse([cx - 8 * u, cy - 8 * u, cx + 8 * u, cy + 8 * u], fill=claro)
    # Hoja: dos arcos entre (35, 27) y (52, 13.5)
    puntos = []
    for i in range(41):
        k = i / 40
        x = 35 + (52 - 35) * k
        y = 27 + (13.5 - 27) * k
        puntos.append(((x - 4.2 * (1 - (2 * k - 1) ** 2)) * u, (y - 4.2 * (1 - (2 * k - 1) ** 2)) * u))
    for i in range(40, -1, -1):
        k = i / 40
        x = 35 + (52 - 35) * k
        y = 27 + (13.5 - 27) * k
        puntos.append(((x + 4.2 * (1 - (2 * k - 1) ** 2)) * u, (y + 4.2 * (1 - (2 * k - 1) ** 2)) * u))
    d.polygon(puntos, fill=HOJA)
    return img.resize((tam, tam), Image.LANCZOS)


# Android y el navegador: con esquinas redondeadas. iPhone: cuadrado (iOS redondea solo).
dibujar(192, True).save(PUBLICO / "icono-192.png")
dibujar(512, False).save(PUBLICO / "icono-512.png")
dibujar(180, False).convert("RGB").save(PUBLICO / "apple-touch-icon.png")
print("Listo: icono-192.png, icono-512.png y apple-touch-icon.png")
