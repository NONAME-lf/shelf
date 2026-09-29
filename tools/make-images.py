#!/usr/bin/env python3
"""Generates the PNG/JPEG assets of the project without third-party libraries.

    python3 tools/make-images.py demo    # tools/demo-files/*.png, *.jpg, backup.zip
    python3 tools/make-images.py icons   # apps/desktop/build/icon.png, apps/desktop/resources/drag.png
"""
import math
import pathlib
import shutil
import struct
import subprocess
import sys
import tempfile
import zipfile
import zlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
INK, INK2 = (29, 33, 43), (42, 48, 61)
BRASS, PAPER = (195, 139, 26), (247, 245, 240)
BOOKS = [(178, 64, 52), (47, 125, 79), (60, 96, 160), (212, 170, 60), (120, 80, 150)]


def write_png(path, width, height, pixel):
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        for x in range(width):
            rows.extend(pixel(x, y))

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    header = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(bytes(rows), 9)) + chunk(b'IEND', b''))


def shelf_icon(size):
    """A dark rounded square with three brass shelves and coloured books."""
    radius = size * 0.18

    def inside_rounded(x, y):
        cx = min(max(x, radius), size - 1 - radius)
        cy = min(max(y, radius), size - 1 - radius)
        return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2

    shelves = [0.34, 0.58, 0.82]
    book_width = size * 0.075

    def pixel(x, y):
        if not inside_rounded(x, y):
            return (0, 0, 0, 0)
        u, v = x / size, y / size
        for index, shelf in enumerate(shelves):
            if 0.16 <= u <= 0.84 and shelf <= v <= shelf + 0.035:
                return (*BRASS, 255)
            if index < 2 and 0.2 <= u <= 0.8 and shelf - 0.17 <= v < shelf:
                slot = int((u - 0.2) * size // book_width)
                height = 0.12 + 0.05 * ((slot * 37 + index * 11) % 3) / 2
                left = 0.2 + slot * book_width / size
                if v >= shelf - height and u - left < book_width / size * 0.82:
                    return (*BOOKS[(slot + index * 2) % len(BOOKS)], 255)
        return (*(INK if v < 0.5 else INK2), 255)

    return pixel


def landscape(width, height):
    """A calm landscape for the JPEG preview demo."""
    def pixel(x, y):
        u, v = x / width, y / height
        sun = math.hypot(u - 0.72, v - 0.28)
        if sun < 0.07:
            return (250, 214, 120, 255)
        hill_far = 0.62 + 0.06 * math.sin(u * 7.0 + 1.3)
        hill_near = 0.76 + 0.05 * math.sin(u * 11.0)
        if v > hill_near:
            return (58, 110, 70, 255)
        if v > hill_far:
            return (96, 140, 110, 255)
        t = v / 0.62
        return (int(150 + 90 * t), int(196 + 30 * t), int(232 - 40 * t), 255)

    return pixel


def demo():
    target = ROOT / 'tools' / 'demo-files'
    write_png(target / 'shelf-logo.png', 256, 256, shelf_icon(256))
    diagram = ROOT / 'docs' / 'uml' / 'img' / '03-class-vopc-sort-filter.png'
    shutil.copyfile(diagram, target / 'class-diagram.png')
    with tempfile.TemporaryDirectory() as tmp:
        raw = pathlib.Path(tmp) / 'landscape.png'
        write_png(raw, 800, 500, landscape(800, 500))
        subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '85', str(raw), '--out', str(target / 'mountains.jpg')],
                       check=True, capture_output=True)
    with zipfile.ZipFile(target / 'backup.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.write(target / 'todo.txt', 'todo.txt')
        archive.write(target / 'Main.kt', 'Main.kt')


def icons():
    write_png(ROOT / 'apps' / 'desktop' / 'build' / 'icon.png', 1024, 1024, shelf_icon(1024))
    write_png(ROOT / 'apps' / 'desktop' / 'resources' / 'drag.png', 64, 64, shelf_icon(64))


if __name__ == '__main__':
    {'demo': demo, 'icons': icons}[sys.argv[1] if len(sys.argv) > 1 else 'demo']()
