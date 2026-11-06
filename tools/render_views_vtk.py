# -*- coding: utf-8 -*-
"""tris.npy (N,3,3 üçgen köşeleri, mm) -> VTK ile gölgeli + kenar çizgili görünümler.
Üst/ön/yan görünümler paralel (ortografik) projeksiyonla, izometrik görünüm paralel projeksiyonla üretilir.
Kullanım: python tools/render_views_vtk.py <tris.npy> <çıktı_klasörü> <views_cfg.json>
Çıktı: view_<ad>.png (RGBA, saydam zemin) + views_meta.json (görünüm koordinat sınırları, builder için)."""
import os, sys, json, time
import numpy as np
import vtk
from vtkmodules.util.numpy_support import numpy_to_vtk, numpy_to_vtkIdTypeArray
from PIL import Image

tris_path, out_dir, cfg_path = sys.argv[1:4]
cfg = json.load(open(cfg_path, encoding="utf-8"))
os.makedirs(out_dir, exist_ok=True)
t0 = time.time()
def log(*a): print(f"[{time.time()-t0:7.1f}s]", *a, flush=True)

PPM = cfg.get("px_per_mm", 0.5)          # çıktı çözünürlüğü (px/mm)
SS = cfg.get("supersample", 2)           # kenar yumuşatma için büyütme
MARGIN = cfg.get("margin_mm", 60)
FEATURE_ANGLE = cfg.get("feature_angle", 35.0)
SURF = cfg.get("surface_rgb", [0.86, 0.885, 0.905])
EDGE = cfg.get("edge_rgb", [0.10, 0.14, 0.19])
LINE_W = cfg.get("line_width", 1.4)

# ---------------------------------------------------------------- polydata (ortak noktalar)
T = np.load(tris_path).astype(np.float64)
log("triangles", len(T))
P = T.reshape(-1, 3)
Pr = np.round(P, 2)
uniq, inv = np.unique(Pr, axis=0, return_inverse=True)
inv = inv.reshape(-1)
log("unique points", len(uniq))
conn = inv.reshape(-1, 3)
# dejenere üçgenleri at
ok = (conn[:, 0] != conn[:, 1]) & (conn[:, 1] != conn[:, 2]) & (conn[:, 0] != conn[:, 2])
conn = conn[ok]
n = len(conn)
pts = vtk.vtkPoints(); pts.SetData(numpy_to_vtk(uniq.astype(np.float32), deep=True))
offsets = numpy_to_vtkIdTypeArray(np.arange(0, 3 * n + 1, 3, dtype=np.int64), deep=True)
connectivity = numpy_to_vtkIdTypeArray(conn.astype(np.int64).ravel(), deep=True)
cells = vtk.vtkCellArray(); cells.SetData(offsets, connectivity)
poly = vtk.vtkPolyData(); poly.SetPoints(pts); poly.SetPolys(cells)
log("polydata built", n, "cells")

normals = vtk.vtkPolyDataNormals()
normals.SetInputData(poly); normals.SplittingOn(); normals.SetFeatureAngle(FEATURE_ANGLE)
normals.ConsistencyOff(); normals.AutoOrientNormalsOff(); normals.ComputePointNormalsOn()
normals.Update()
log("normals done")

fe = vtk.vtkFeatureEdges()
fe.SetInputData(poly); fe.BoundaryEdgesOn(); fe.FeatureEdgesOn(); fe.SetFeatureAngle(FEATURE_ANGLE)
fe.NonManifoldEdgesOn(); fe.ManifoldEdgesOff(); fe.ColoringOff(); fe.Update()
feat = vtk.vtkPolyData(); feat.ShallowCopy(fe.GetOutput())
log("feature edges", feat.GetNumberOfLines())

# ---------------------------------------------------------------- sahne
vtk.vtkMapper.SetResolveCoincidentTopologyToPolygonOffset()
vtk.vtkMapper.SetResolveCoincidentTopologyPolygonOffsetParameters(1.0, 1.0)
vtk.vtkMapper.SetResolveCoincidentTopologyLineOffsetParameters(-1.0, -1.0)

ren = vtk.vtkRenderer()
ren.SetBackground(1, 1, 1); ren.SetBackgroundAlpha(0.0)
ren.TwoSidedLightingOn(); ren.AutomaticLightCreationOff()
lk = vtk.vtkLightKit()
lk.SetKeyLightIntensity(0.85); lk.SetKeyLightWarmth(0.55); lk.SetFillLightWarmth(0.5); lk.SetHeadLightWarmth(0.5)
lk.SetKeyToFillRatio(2.2); lk.SetKeyToHeadRatio(2.5); lk.SetKeyToBackRatio(3.5)
lk.SetKeyLightElevation(45); lk.SetKeyLightAzimuth(25)
lk.AddLightsToRenderer(ren)
renWin = vtk.vtkRenderWindow()
renWin.SetOffScreenRendering(1); renWin.SetAlphaBitPlanes(1); renWin.SetMultiSamples(0)
renWin.AddRenderer(ren)

surf_mapper = vtk.vtkPolyDataMapper(); surf_mapper.SetInputConnection(normals.GetOutputPort()); surf_mapper.ScalarVisibilityOff()
surf = vtk.vtkActor(); surf.SetMapper(surf_mapper)
sp = surf.GetProperty(); sp.SetColor(*SURF); sp.SetAmbient(0.32); sp.SetDiffuse(0.72); sp.SetSpecular(0.06); sp.SetSpecularPower(25)
sp.SetInterpolationToFlat()
ren.AddActor(surf)

feat_mapper = vtk.vtkPolyDataMapper(); feat_mapper.SetInputData(feat); feat_mapper.ScalarVisibilityOff()
feat_actor = vtk.vtkActor(); feat_actor.SetMapper(feat_mapper)
fp = feat_actor.GetProperty(); fp.SetColor(*EDGE); fp.SetLineWidth(LINE_W * SS); fp.SetAmbient(1.0); fp.SetDiffuse(0.0); fp.LightingOff()
ren.AddActor(feat_actor)

sil = vtk.vtkPolyDataSilhouette()
sil.SetInputData(poly); sil.SetDirectionToSpecifiedVector(); sil.BorderEdgesOn(); sil.SetEnableFeatureAngle(0); sil.PieceInvariantOn()
sil_mapper = vtk.vtkPolyDataMapper(); sil_mapper.SetInputConnection(sil.GetOutputPort()); sil_mapper.ScalarVisibilityOff()
sil_actor = vtk.vtkActor(); sil_actor.SetMapper(sil_mapper)
sl = sil_actor.GetProperty(); sl.SetColor(*EDGE); sl.SetLineWidth(LINE_W * SS * 1.15); sl.LightingOff()
ren.AddActor(sil_actor)

cam = ren.GetActiveCamera(); cam.ParallelProjectionOn()

def unit(v):
    v = np.asarray(v, dtype=np.float64); return v / np.linalg.norm(v)

def frame_from(tv, up):
    """tv: bakana doğru eksen (dünya), up: istenen yukarı. Dönüş: sx, sy, tv (dik, sağ el)."""
    tv = unit(tv); up = unit(up)
    sy = unit(up - np.dot(up, tv) * tv)
    sx = np.cross(sy, tv)
    return sx, sy, tv

meta = {}
for name, v in cfg["views"].items():
    if "R" in v:
        sx, sy, tv = (np.asarray(r, dtype=np.float64) for r in v["R"])
    else:
        sx, sy, tv = frame_from(v["dir"], v.get("up", [0, 1, 0]))
    R = np.vstack([sx, sy, tv])
    Pv = uniq @ R.T
    if "crop" in v:   # yakın detay: [x0, y0, x1, y1] görünüm koordinatlarında (ekran-x, ekran-y), kenar payı yok
        x0, y0, x1, y1 = (float(c) for c in v["crop"])
    else:
        x0, y0 = Pv[:, 0].min() - MARGIN, Pv[:, 1].min() - MARGIN
        x1, y1 = Pv[:, 0].max() + MARGIN, Pv[:, 1].max() + MARGIN
    d0, d1 = Pv[:, 2].min(), Pv[:, 2].max()
    ppm = v.get("px_per_mm", PPM)
    W = int(round((x1 - x0) * ppm)); H = int(round((y1 - y0) * ppm))
    # paralel projeksiyonda gerçek yatay kapsama = yükseklik * W/H
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    half_h = (y1 - y0) / 2
    half_w = half_h * (W / H)
    x0e, x1e = cx - half_w, cx + half_w
    focal = cx * sx + cy * sy + ((d0 + d1) / 2) * tv
    pos = focal + tv * ((d1 - d0) + 2000.0)
    cam.SetFocalPoint(*focal); cam.SetPosition(*pos); cam.SetViewUp(*sy)
    cam.SetParallelScale(half_h)
    renWin.SetSize(W * SS, H * SS)
    ren.ResetCameraClippingRange()
    sil.SetVector(*(-tv))  # bakış yönü
    renWin.Render()
    w2i = vtk.vtkWindowToImageFilter(); w2i.SetInput(renWin); w2i.SetInputBufferTypeToRGBA(); w2i.ReadFrontBufferOff(); w2i.Update()
    tmp = os.path.join(out_dir, f"_tmp_{name}.png")
    wr = vtk.vtkPNGWriter(); wr.SetFileName(tmp); wr.SetInputConnection(w2i.GetOutputPort()); wr.Write()
    img = Image.open(tmp).convert("RGBA")
    if SS != 1:
        img = img.resize((W, H), Image.LANCZOS)
    fn = os.path.join(out_dir, f"view_{name}.png"); img.save(fn, optimize=True); os.remove(tmp)
    mg = 0 if "crop" in v else MARGIN
    meta[name] = {"png": os.path.basename(fn), "W": W, "H": H, "px_per_mm": ppm,
                  "x0": float(x0e), "y0": float(y0), "x1": float(x1e), "y1": float(y1),
                  "model_x0": float(x0 + mg), "model_y0": float(y0 + mg),
                  "model_x1": float(x1 - mg), "model_y1": float(y1 - mg),
                  "R": R.round(6).tolist(), "iso": bool("dir" in v)}
    log("view", name, W, H)
json.dump(meta, open(os.path.join(out_dir, "views_meta.json"), "w"), indent=1)
log("done")
