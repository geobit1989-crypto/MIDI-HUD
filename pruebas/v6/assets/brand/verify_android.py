from pathlib import Path
import xml.etree.ElementTree as E
root=Path(__file__).resolve().parents[2]
rects=E.parse(root/'assets/brand/midi-hud.svg').getroot().findall('{http://www.w3.org/2000/svg}rect')
ns='{http://schemas.android.com/apk/res/android}'
v=E.parse(root/'native/android/app/src/main/res/drawable/ic_hud.xml').getroot()
assert v.attrib[ns+'viewportWidth']==v.attrib[ns+'viewportHeight']=='108'
assert len(v)==len(rects)==5
assert [p.attrib[ns+'fillColor'] for p in v]==[a.attrib['fill'] for a in rects]
assert v[0].attrib[ns+'pathData']=='M0,0H108V108H0Z'
for p,a in zip(list(v)[1:],rects[1:]):
 x,y,w,h,z=(float(a.attrib[k]) for k in ('x','y','width','height','rx'))
 R,B=x+w,y+h
 fmt=lambda n:format(n,'g')
 d=f'M{fmt(x+z)},{fmt(y)}H{fmt(R-z)}A{fmt(z)},{fmt(z)} 0 0 1 {fmt(R)},{fmt(y+z)}V{fmt(B-z)}A{fmt(z)},{fmt(z)} 0 0 1 {fmt(R-z)},{fmt(B)}H{fmt(x+z)}A{fmt(z)},{fmt(z)} 0 0 1 {fmt(x)},{fmt(B-z)}V{fmt(y+z)}A{fmt(z)},{fmt(z)} 0 0 1 {fmt(x+z)},{fmt(y)}Z'
 assert p.attrib[ns+'pathData']==d
manifest=E.parse(root/'native/android/app/src/main/AndroidManifest.xml').getroot().find('application')
assert manifest.attrib[ns+'label']=='MIDI HUD' and manifest.attrib[ns+'icon']=='@drawable/ic_hud'
print('Android name and compact icon match canonical SVG.')
