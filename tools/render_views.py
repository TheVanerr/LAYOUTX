import sys, json, time, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection

tris_path, out_dir, cfg_path = sys.argv[1:4]
cfg = json.load(open(cfg_path, encoding="utf-8"))
t0 = time.time()
def log(*a): print(f"[{time.time()-t0:7.1f}s]", *a, flush=True)

T = np.load(tris_path)  # (N,3,3) float32, world coords (mm)
log("triangles", T.shape[0])
# optional clipping box in world coords
if "clip" in cfg:
    c = cfg["clip"]; ctr = T.mean(axis=1)
    m = np.ones(len(T), bool)
    for ax, (lo, hi) in c.items():
        i = "xyz".index(ax); m &= (ctr[:, i] >= lo) & (ctr[:, i] <= hi)
    T = T[m]; log("after clip", T.shape[0])

N = np.cross(T[:,1]-T[:,0], T[:,2]-T[:,0])
area = np.linalg.norm(N, axis=1)
ok = area > 1e-6
T = T[ok]; N = N[ok] / area[ok][:, None]
log("valid tris", T.shape[0])

PX_PER_MM = cfg.get("px_per_mm", 0.5)
MARGIN = cfg.get("margin_mm", 60)
meta = {}
for name, v in cfg["views"].items():
    # R rows: screen-x axis, screen-y axis, toward-viewer axis (world unit vectors)
    R = np.array(v["R"], dtype=np.float64)
    P = T.reshape(-1, 3) @ R.T
    P = P.reshape(-1, 3, 3)
    n = N @ R.T
    depth = P[:, :, 2].mean(axis=1)
    # drop back faces (normal pointing away from viewer); keep two-sided for thin sheets by abs
    facing = n[:, 2]
    keep = np.abs(facing) > 1e-3 if v.get("two_sided", True) else facing > 0
    P = P[keep]; n = n[keep]; depth = depth[keep]
    order = np.argsort(depth)  # far first
    P = P[order]; n = n[order]
    # lighting
    L = np.array(v.get("light", [0.3, 0.6, 1.0])); L = L / np.linalg.norm(L)
    lam = np.abs(n @ L)
    base = np.array(v.get("base_rgb", [0.62, 0.66, 0.70]))
    shade = (0.45 + 0.55 * lam)[:, None] * base[None, :]
    shade = np.clip(shade, 0, 1)
    xy = P[:, :, :2]
    x0, y0 = xy[:, :, 0].min(), xy[:, :, 1].min()
    x1, y1 = xy[:, :, 0].max(), xy[:, :, 1].max()
    w_mm = (x1 - x0) + 2 * MARGIN; h_mm = (y1 - y0) + 2 * MARGIN
    W = int(round(w_mm * PX_PER_MM)); H = int(round(h_mm * PX_PER_MM))
    dpi = 100
    fig = plt.figure(figsize=(W / dpi, H / dpi), dpi=dpi)
    ax = fig.add_axes([0, 0, 1, 1]); ax.set_axis_off()
    ax.set_xlim(x0 - MARGIN, x1 + MARGIN); ax.set_ylim(y0 - MARGIN, y1 + MARGIN)
    ax.set_aspect("equal")
    pc = PolyCollection(xy, facecolors=shade, edgecolors="none", linewidths=0, antialiased=False)
    ax.add_collection(pc)
    fn = os.path.join(out_dir, f"view_{name}.png")
    fig.savefig(fn, dpi=dpi, transparent=True)
    plt.close(fig)
    meta[name] = {"png": os.path.basename(fn), "W": W, "H": H, "px_per_mm": PX_PER_MM,
                  "x0": float(x0 - MARGIN), "y0": float(y0 - MARGIN),
                  "x1": float(x1 + MARGIN), "y1": float(y1 + MARGIN),
                  "model_x0": float(x0), "model_y0": float(y0), "model_x1": float(x1), "model_y1": float(y1),
                  "tris": int(len(P))}
    log("view", name, W, H, "tris", len(P))
json.dump(meta, open(os.path.join(out_dir, "views_meta.json"), "w"), indent=1)
log("done")
