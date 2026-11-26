"""Render the canonical compact MIDI HUD SVG into a seven-size Windows ICO.
Reference: screenshot supplied by user 26/11/2026. Geometry and solid colors
reconstructed from visible artwork; no screenshot UI or baked white corners.
"""
from pathlib import Path
import struct, zlib, xml.etree.ElementTree as ET
here = Path(__file__).resolve().parent
source = here.parents[1] / "assets/brand/midi-hud.svg"
ns = "{http://www.w3.org/2000/svg}"
vector = ET.parse(source).getroot()
assert vector.attrib["viewBox"] == "0 0 108 108"
rects = vector.findall(ns+"rect")
assert len(rects)==5
def rgb(s): return tuple(bytes.fromhex(s[1:]))
bg = rgb(rects[0].attrib["fill"])
tiles=[]
for rect in rects[1:]:
    a=rect.attrib
    x,y,w,h,rad=(float(a[k]) for k in ("x","y","width","height","rx"))
    tiles.append((x,y,x+w,y+h,rad,rgb(a["fill"])))
def inside(x,y,l,t,r,b,rad):
    if not (l<=x<=r and t<=y<=b): return False
    dx=max(l+rad-x,0,x-(r-rad))
    dy=max(t+rad-y,0,y-(b-rad))
    return dx*dx+dy*dy<=rad*rad
def pixel(x,y):
    for l,t,r,b,rad,color in tiles:
        if inside(x,y,l,t,r,b,rad): return color
    return bg
def png(n):
    def chunk(t,d): return struct.pack(">I",len(d))+t+d+struct.pack(">I",zlib.crc32(t+d)&0xffffffff)
    raw=bytearray()
    aa=4
    for y in range(n):
        raw.append(0)
        for x in range(n):
            samples=[pixel((x+(i+.5)/aa)*108/n,(y+(j+.5)/aa)*108/n) for i in range(aa) for j in range(aa)]
            raw.extend(round(sum(p[k] for p in samples)/len(samples)) for k in range(3))
    return b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",n,n,8,2,0,0,0))+chunk(b"IDAT",zlib.compress(raw))+chunk(b"IEND",b"")
sizes=(16,24,32,48,64,128,256)
images=[png(n) for n in sizes]
offset=6+16*len(sizes)
directory=[]
for n,data in zip(sizes,images):
    directory.append(struct.pack("<BBBBHHII",n%256,n%256,0,0,1,24,len(data),offset))
    offset+=len(data)
out=here/"obj"
out.mkdir(exist_ok=True)
(out/"hud.ico").write_bytes(struct.pack("<HHH",0,1,len(sizes))+b"".join(directory)+b"".join(images))
print("Windows icon: compact canonical vector, seven sizes")
