"""Generate data/layout.json + data/plots.json for the demo plotted colony.

    py tools/generate-layout.py

The layout is drawn in a local grid (u = across, v = along the main avenue)
and rotated so most plots face East or West. For a real client, this script
is replaced by tracing their approved layout plan (or the JSON is edited
directly): every plot is just a polygon plus its attributes.
"""
import json, random, pathlib

random.seed(21)
FT = 0.3048
SQYD_PER_M2 = 1.19599
BASE_RATE = {"residential": 38000, "villa": 42000, "commercial": 95000}

def rot(u, v):          # local -> world (x, z); north is -z
    return [round(v, 2), round(-u, 2)]

def rotv(du, dv):
    return (dv, -du)

def dname(x, z):
    if x > 0.5: return "East"
    if x < -0.5: return "West"
    return "North" if z < 0 else "South"

def combo(a, b):
    ns = [d for d in (a, b) if d in ("North", "South")]
    ew = [d for d in (a, b) if d in ("East", "West")]
    return f"{ns[0]}-{ew[0]}" if ns and ew else a

plots, counters = [], {}

def row(block, edge, dirv, depth_ft, width_ft, ptype, cls, segs, road_w, park=None):
    depth, width = depth_ft * FT, width_ft * FT
    v0, v1 = (edge, edge + depth) if dirv > 0 else (edge - depth, edge)
    front = rotv(0, -1 if dirv > 0 else 1)
    facing = dname(*front)
    for u0, u1, e0, e1 in segs:
        L = u1 - u0
        n = int(L // width)
        extra = L - n * width
        ws = [width] * n
        if e0 and e1: ws[0] += extra / 2; ws[-1] += extra / 2
        elif e0: ws[0] += extra
        elif e1: ws[-1] += extra
        else: ws[0] += extra / 2; ws[-1] += extra / 2
        u = u0
        for i, w in enumerate(ws):
            side_w, side = 0, None
            if i == 0 and e0: side_w, side = e0, (-1, 0)
            if i == n - 1 and e1: side_w, side = e1, (1, 0)
            counters[block] = counters.get(block, 0) + 1
            cu, cv = u + w / 2, (v0 + v1) / 2
            corner = combo(facing, dname(*rotv(*side))) if side else None
            is_park = bool(park and park(cu))
            sqyd = w * depth * SQYD_PER_M2
            prem = 1 + (0.1 if corner else 0) + (0.1 if is_park else 0) + (0.05 if max(road_w, side_w) >= 18 else 0)
            rate = round(BASE_RATE[ptype] * prem / 100) * 100
            hot = corner or is_park
            r = random.random()
            sold_p = 0.42 + (0.18 if hot else 0)
            status = "sold" if r < sold_p else ("hold" if r < sold_p + 0.1 else "available")
            plots.append({
                "id": f"{block}-{counters[block]}", "block": block, "type": ptype, "cls": cls,
                "poly": [rot(u, v0), rot(u + w, v0), rot(u + w, v1), rot(u, v1)],
                "cx": rot(cu, cv)[0], "cz": rot(cu, cv)[1], "w": round(w, 2), "d": round(depth, 2),
                "front": list(front), "w_ft": round(w / FT), "d_ft": round(depth_ft),
                "sqyd": round(sqyd), "facing": facing, "corner": corner, "park": is_park,
                "road": road_w, "side_road": side_w, "rate": rate,
                "price": round(sqyd * rate / 100000) * 100000, "status": status,
            })
            u += w

# ---- rows (local coordinates, metres) ----
west = lambda u: u < 0
row("A", 68, +1, 50, 27, "residential", "150 sq yd", [(-150, -9, 0, 18), (9, 150, 18, 0)], 12, park=west)
row("SCO", 110, -1, 60, 20, "commercial", "SCO", [(-100, -9, 0, 18), (9, 100, 18, 0)], 24)
row("B", 4, +1, 67.5, 40, "residential", "300 sq yd", [(9, 71.5, 18, 9), (80.5, 150, 9, 0)], 12)
row("B", 56, -1, 67.5, 40, "residential", "300 sq yd", [(9, 71.5, 18, 9), (80.5, 150, 9, 0)], 12)
C = [(-150, -80.5, 0, 9), (-71.5, -9, 9, 18), (9, 71.5, 18, 9), (80.5, 150, 9, 0)]
row("C", -60, +1, 60, 30, "residential", "200 sq yd", C, 12)
row("C", -8, -1, 60, 30, "residential", "200 sq yd", C, 12, park=west)
row("D", -72, -1, 90, 50, "villa", "500 sq yd", [(9, 150, 18, 0)], 12)

# ---- roads ----
roads_local = [
    dict(id="sector", name="24 m sector road", axis="u", at=125, a=-1500, b=1500, w=24, ext=True),
    dict(id="east", name="18 m sector road", axis="v", at=168, a=-1500, b=1500, w=18, ext=True),
    dict(id="west", name="12 m road", axis="v", at=-200, a=-1500, b=1500, w=12, ext=True),
    dict(id="north", name="12 m road", axis="u", at=-190, a=-1500, b=1500, w=12, ext=True),
    dict(id="spine", name="18 m main avenue", axis="v", at=0, a=-130, b=125, w=18),
    dict(id="r1", name="12 m road", axis="u", at=62, a=-150, b=150, w=12),
    dict(id="r2", name="12 m road", axis="u", at=-2, a=-150, b=150, w=12),
    dict(id="r3", name="12 m road", axis="u", at=-66, a=-150, b=150, w=12),
    dict(id="s1", name="9 m road", axis="v", at=76, a=-66, b=62, w=9),
    dict(id="s2", name="9 m road", axis="v", at=-76, a=-66, b=-2, w=9),
]
roads = []
for r in roads_local:
    if r["axis"] == "u":   # runs along u (constant v) -> world runs along z at x = v
        roads.append(dict(id=r["id"], name=r["name"], axis="z", at=r["at"], a=-r["b"], b=-r["a"], w=r["w"], ext=r.get("ext", False)))
    else:                  # runs along v (constant u) -> world runs along x at z = -u
        roads.append(dict(id=r["id"], name=r["name"], axis="x", at=-r["at"], a=r["a"], b=r["b"], w=r["w"], ext=r.get("ext", False)))
roads.append(dict(id="highway", name="National Highway", axis="z", at=440, a=-1500, b=1500, w=26, ext=True))

def rect(u0, u1, v0, v1):
    return [rot(u0, v0), rot(u1, v0), rot(u1, v1), rot(u0, v1)]

greens = [dict(kind="park", name="Central Park", poly=rect(-146, -13, 8, 52))]
for u0, u1 in [(9, 71.5), (80.5, 150)]:
    greens.append(dict(kind="strip", name="Green strip", poly=rect(u0, u1, 4 + 67.5 * FT, 56 - 67.5 * FT)))
for u0, u1, _, _ in C:
    greens.append(dict(kind="strip", name="Green strip", poly=rect(u0, u1, -60 + 60 * FT, -8 - 60 * FT)))
for u0, u1 in [(-150, -9), (9, 150)]:
    greens.append(dict(kind="strip", name="Green lane", poly=rect(u0, u1, 68 + 50 * FT, 110 - 60 * FT)))
for u0, u1 in [(-150, -100), (100, 150)]:
    greens.append(dict(kind="plaza", name="Landscaped plaza", poly=rect(u0, u1, 110 - 60 * FT, 110)))
greens.append(dict(kind="belt", name="Green belt", poly=rect(9, 150, -130, -72 - 90 * FT)))
greens.append(dict(kind="belt", name="Green belt", poly=rect(-150, -9, -130, -104)))

def amen(id, name, kind, desc, u0, u1, v0, v1, h=0, cam=(40, 34, 40)):
    c = rot((u0 + u1) / 2, (v0 + v1) / 2)
    return dict(id=id, name=name, kind=kind, desc=desc, poly=rect(u0, u1, v0, v1), center=c, h=h, cam=list(cam))

amenities = [
    amen("park", "Central Park", "park", "1.4-acre park with walking loop, fountain & gazebo", -146, -13, 8, 52, cam=(70, 55, 60)),
    amen("club", "Community Centre", "club", "Banquet hall, gym and indoor games", -126, -78, -102, -76, h=9, cam=(-40, 30, 36)),
    amen("temple", "Temple", "temple", "Neighbourhood temple with courtyard", -66, -42, -100, -78, h=12, cam=(-34, 24, 30)),
    amen("creche", "Creche & Play School", "creche", "Day-care and nursery for residents", -34, -14, -100, -78, h=6, cam=(-30, 22, 30)),
    amen("belt", "Green Belt & Jogging Trail", "track", "Tree-lined trail along the north boundary", -150, 150, -130, -104, cam=(-50, 46, 70)),
    amen("gate", "Gated Entry & Security", "gate", "24×7 guarded gate with boom barrier and CCTV", -12, 12, 108, 125, cam=(40, 14, 34)),
    amen("sco", "Commercial Street (SCOs)", "mall", "Shop-cum-office plots on the 24 m sector road", -100, 100, 92, 110, cam=(70, 36, 50)),
]

site_poly = rect(-150, 150, -130, 110)
area_m2 = 300 * 240
layout = {
    "site": site_poly, "area_acres": round(area_m2 / 4046.86, 1),
    "gate": rot(0, 112), "roads": roads, "greens": greens, "amenities": amenities,
    "wall": [[rot(-150, -130), rot(150, -130)], [rot(150, -130), rot(150, 110)], [rot(-150, -130), rot(-150, 110)],
             [rot(-150, 110 - 60 * FT), rot(-150, 110)]],
}

out = pathlib.Path(__file__).resolve().parent.parent / "data"
(out / "layout.json").write_text(json.dumps(layout, indent=1), encoding="utf-8")
lines = ",\n".join("  " + json.dumps(p, ensure_ascii=False) for p in plots)
(out / "plots.json").write_text(
    '{\n "updated": "2026-11-21T10:00:00+05:30",\n'
    ' "note": "Change status to available | hold | sold. The 3D map and lists update within 30 seconds.",\n'
    ' "plots": [\n' + lines + "\n ]\n}\n", encoding="utf-8")
from collections import Counter
print(len(plots), "plots", Counter(p["status"] for p in plots), Counter(p["facing"] for p in plots))
