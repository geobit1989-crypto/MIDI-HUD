"""Render the existing Android four-tile vector into a Windows multi-size ICO.
No external packages, network access or second editable copy of the artwork.
The user confirmed this exact existing Android vector as the official icon on 26/11/2026.
"""
from pathlib import Path
import re, struct, zlib, xml.etree.ElementTree as ET
here = Path(__file__).resolve().parent
source = here.parent / "android/app/src/main/res/drawable/ic_hud.xml"
ns = "{http://schemas.android.com/apk/res/android}"
vector = ET.parse(source).getroot()
assert vector.attrib[ns+"viewportWidth"] == vector.attrib[ns+"viewportHeight"] == "108"
paths = vector.findall("path")
assert len(paths)==5 and paths[0].attrib[ns+"pathData"]=="M0,0H108V108H0Z"
def rgb(s): return tuple(bytes.fromhex(s[1:]))
bg = rgb(paths[0].attrib[ns+"fillColor"])
tiles = []
for path in paths[1:]:
    # The existing vector uses four quadratic rounded rectangles.
    raw = path.attrib[ns+"pathData"]
    nums = list(map(int,re.findall(r"\d+",raw)))
    assert len(nums)==22 and raw.startswith("M") and raw.endswith("Z"), raw
    x1,y1=nums[0],nums[1]
    # H right inset; first Q gives the outer x, then bottom V and Q gives outer y.
    left,top,right,bottom=nums[13],y1,nums[3],nums[9]
    radius=x1-left
    assert right-left in (28,29) and bottom-top in (28,29) and radius==6, (raw,nums)
    tiles.append((left,top,right,bottom,radius,rgb(path.attrib[ns+"fillColor"])))
def pixel(x,y):
    for l,t,r,b,rad,color in tiles:
        if l<=x<=r and t<=y<=b:
            dx=max(l+rad-x,0,x-(r-rad))
            dy=max(t+rad-y,0,y-(b-rad))
            # Q corner with control at the outer corner; exact quadratic boundary.
            if (1-dx/rad)**0.5+(1-dy/rad)**0.5>=0.99999999:
                return color
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
print("Windows icon: Android vector, seven sizes")
