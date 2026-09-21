import zlib, struct

BG = (0x12, 0x80, 0x6c)
FG = (255, 255, 255)

def inside(x, y):
    def circ(cx, cy, r): return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
    def ell(cx, cy, rx, ry): return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
    crown = circ(.40, .36, .13) or circ(.60, .36, .13) or (.27 <= x <= .73 and .36 <= y <= .58)
    roots = ell(.375, .58, .105, .22) or ell(.625, .58, .105, .22)
    notch = ell(.5, .82, .065, .26)
    spark = abs(x - .76) + abs(y - .20) * 2.4 <= .05 or abs(x - .76) * 2.4 + abs(y - .20) <= .05
    return ((crown or roots) and not notch) or spark

def png(size, path):
    ss = 3
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            hits = sum(inside((px + (sx + .5) / ss) / size, (py + (sy + .5) / ss) / size) for sy in range(ss) for sx in range(ss))
            a = hits / (ss * ss)
            row += bytes(round(BG[i] * (1 - a) + FG[i] * a) for i in range(3))
        rows.append(bytes(row))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)

for s, n in [(180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png')]:
    png(s, 'icons/' + n)
