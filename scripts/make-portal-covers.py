# Cover images for game portals (CrazyGames sizes). Needs Pillow and a full-size picture in cover/.

from PIL import Image, ImageDraw, ImageFilter, ImageOps
hero = Image.open('cover/red-fox-winter.webp').convert('RGB')
logo = Image.open('/home/claude/snapshift/public/img/logo.png').convert('RGBA')
OUT = '/home/claude/snapshift/store-listing/crazygames/'

def make(W, H, cols, rows, swaps, lift, logo_w, name):
    S = 2  # draw at 2x then downscale for clean edges
    W2, H2 = W * S, H * S
    pic = ImageOps.fit(hero, (W2, H2), Image.LANCZOS, centering=(0.5, 0.55))
    tw, th = W2 / cols, H2 / rows
    gap = int(5 * S)
    canvas = Image.new('RGB', (W2, H2), (6, 10, 20))
    box = lambda c, r: (round(c * tw), round(r * th), round((c + 1) * tw), round((r + 1) * th))
    tile = lambda c, r: pic.crop(box(c, r))
    where = {(c, r): (c, r) for c in range(cols) for r in range(rows)}
    for a, b in swaps:
        where[a], where[b] = where[b], where[a]
    for (c, r), (sc, sr) in where.items():
        if (c, r) == lift[0]:
            continue
        t = tile(sc, sr)
        x0, y0, x1, y1 = box(c, r)
        canvas.paste(t.crop((gap // 2, gap // 2, t.width - gap // 2, t.height - gap // 2)), (x0 + gap // 2, y0 + gap // 2))
    # the empty slot
    d = ImageDraw.Draw(canvas)
    x0, y0, x1, y1 = box(*lift[0])
    d.rounded_rectangle((x0 + gap, y0 + gap, x1 - gap, y1 - gap), radius=14 * S, fill=(14, 22, 40), outline=(245, 130, 32), width=5 * S)
    # gradient at the bottom for the logo
    grad = Image.new('L', (1, H2))
    for y in range(H2):
        f = max(0.0, (y / H2 - 0.5) / 0.38)
        grad.putpixel((0, y), int(min(1, f) ** 1.2 * 240))
    canvas.paste(Image.new('RGB', (W2, H2), (5, 8, 15)), (0, 0), grad.resize((W2, H2)))
    # the lifted tile, tilted, with a glow and shadow
    t = tile(*lift[0]).resize((int(tw * 1.12), int(th * 1.12)), Image.LANCZOS).convert('RGBA')
    m = Image.new('L', t.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, t.width - 1, t.height - 1), radius=12 * S, fill=255)
    t.putalpha(m)
    framed = Image.new('RGBA', (t.width + 16 * S, t.height + 16 * S), (0, 0, 0, 0))
    ImageDraw.Draw(framed).rounded_rectangle((0, 0, framed.width - 1, framed.height - 1), radius=18 * S, fill=(255, 255, 255, 255))
    framed.alpha_composite(t, (8 * S, 8 * S))
    framed = framed.rotate(-7, expand=True, resample=Image.BICUBIC)
    cx, cy = (x0 + x1) / 2 + lift[1][0] * tw, (y0 + y1) / 2 + lift[1][1] * th
    px, py = int(cx - framed.width / 2), int(cy - framed.height / 2)
    shadow = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    sh = Image.new('RGBA', framed.size, (0, 0, 0, 170)); sh.putalpha(framed.getchannel('A').point(lambda a: int(a * 0.7)))
    shadow.alpha_composite(sh, (px + 18 * S, py + 26 * S))
    shadow = shadow.filter(ImageFilter.GaussianBlur(22 * S))
    glow = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    gl = Image.new('RGBA', framed.size, (124, 196, 255, 255)); gl.putalpha(framed.getchannel('A'))
    glow.alpha_composite(gl, (px, py)); glow = glow.filter(ImageFilter.GaussianBlur(26 * S))
    base = canvas.convert('RGBA')
    base.alpha_composite(shadow); base.alpha_composite(glow); base.alpha_composite(framed, (px, py))
    # logo
    lw = int(logo_w * S); lg = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
    lsh = Image.new('RGBA', base.size, (0, 0, 0, 0)); ls = Image.new('RGBA', lg.size, (0, 0, 0, 200)); ls.putalpha(lg.getchannel('A'))
    lx, ly = (W2 - lg.width) // 2, H2 - lg.height - int(H2 * 0.06)
    lsh.alpha_composite(ls, (lx, ly + 6 * S)); lsh = lsh.filter(ImageFilter.GaussianBlur(10 * S))
    base.alpha_composite(lsh); base.alpha_composite(lg, (lx, ly))
    out = base.convert('RGB').resize((W, H), Image.LANCZOS)
    out.save(OUT + name, quality=92)

make(1920, 1080, 6, 4, swaps=[((5, 0), (4, 2)), ((0, 2), (1, 3))], lift=((4, 1), (0.55, -0.15)), logo_w=900, name='cover-landscape-1920x1080.jpg')
make(800, 1200, 4, 6, swaps=[((3, 0), (2, 3)), ((0, 3), (1, 4))], lift=((2, 2), (0.3, -0.2)), logo_w=640, name='cover-portrait-800x1200.jpg')
make(800, 800, 4, 4, swaps=[((3, 0), (2, 2)), ((0, 2), (1, 3))], lift=((2, 1), (0.3, -0.15)), logo_w=600, name='cover-square-800x800.jpg')
