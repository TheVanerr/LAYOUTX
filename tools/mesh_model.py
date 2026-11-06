import os as _os
_sp = r'C:\Users\fatih.gural\AppData\Local\Programs\Python\Python311\Lib\site-packages'
for _d in ('cadquery_ocp.libs', 'vtk.libs'):
    _os.add_dll_directory(_os.path.join(_sp, _d))
import sys, time, json
import numpy as np
from OCP.TopoDS import TopoDS_Shape, TopoDS, TopoDS_Compound
from OCP.BRep import BRep_Builder, BRep_Tool
from OCP.BRepTools import BRepTools
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID, TopAbs_FACE, TopAbs_SHELL
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.TopLoc import TopLoc_Location
from OCP.IMeshTools import IMeshTools_Parameters

brep = sys.argv[1]; out = sys.argv[2]
MIN_DIAG = float(sys.argv[3]) if len(sys.argv) > 3 else 25.0
DEFL = float(sys.argv[4]) if len(sys.argv) > 4 else 2.0
t0 = time.time()
def log(*a): print(f"[{time.time()-t0:7.1f}s]", *a, flush=True)

shape = TopoDS_Shape()
b = BRep_Builder()
log("reading brep")
BRepTools.Read_s(shape, brep, b)
log("read ok")

# collect solids, filter small ones
solids = []
ex = TopExp_Explorer(shape, TopAbs_SOLID)
while ex.More():
    solids.append(ex.Current()); ex.Next()
log("solids:", len(solids))
keep = TopoDS_Compound(); b.MakeCompound(keep)
info = []; nkeep = 0
for s in solids:
    bb = Bnd_Box(); BRepBndLib.Add_s(s, bb, True)
    if bb.IsVoid(): continue
    x0,y0,z0,x1,y1,z1 = bb.Get()
    diag = ((x1-x0)**2+(y1-y0)**2+(z1-z0)**2)**0.5
    info.append([round(x0,1),round(y0,1),round(z0,1),round(x1,1),round(y1,1),round(z1,1),round(diag,1)])
    if diag >= MIN_DIAG:
        b.Add(keep, s); nkeep += 1
log("kept solids:", nkeep)
np.save(_os.path.join(out, "solid_bboxes.npy"), np.array(info, dtype=np.float32))

# also faces not in any solid (free shells/faces)? count them
nf_total = 0
ex = TopExp_Explorer(shape, TopAbs_FACE)
while ex.More(): nf_total += 1; ex.Next()
nf_keep = 0
ex = TopExp_Explorer(keep, TopAbs_FACE)
while ex.More(): nf_keep += 1; ex.Next()
log("faces total", nf_total, "kept", nf_keep)

log("meshing defl", DEFL)
params = IMeshTools_Parameters()
params.Deflection = DEFL
params.Angle = 0.6
params.Relative = False
params.InParallel = True
params.MinSize = 1.0
params.InternalVerticesMode = False
params.ControlSurfaceDeflection = False
mesher = BRepMesh_IncrementalMesh(keep, params)
mesher.Perform()
log("mesh done, IsDone", mesher.IsDone())

tris = []
ex = TopExp_Explorer(keep, TopAbs_FACE)
nf = 0; nt = 0
while ex.More():
    face = TopoDS.Face_s(ex.Current())
    loc = TopLoc_Location()
    tri = BRep_Tool.Triangulation_s(face, loc)
    if tri is not None:
        trsf = loc.Transformation()
        n = tri.NbNodes()
        pts = np.empty((n, 3), dtype=np.float64)
        for i in range(1, n+1):
            p = tri.Node(i)
            p = p.Transformed(trsf)
            pts[i-1] = (p.X(), p.Y(), p.Z())
        m = tri.NbTriangles()
        idx = np.empty((m, 3), dtype=np.int64)
        for j in range(1, m+1):
            t = tri.Triangle(j)
            a, bb_, c = t.Get()
            idx[j-1] = (a-1, bb_-1, c-1)
        if face.Orientation().name == "TopAbs_REVERSED" if hasattr(face.Orientation(), "name") else False:
            idx = idx[:, ::-1]
        tris.append(pts[idx].astype(np.float32))
        nt += m
    nf += 1
    if nf % 20000 == 0: log("faces", nf, "tris", nt)
    ex.Next()
T = np.concatenate(tris, axis=0) if tris else np.zeros((0,3,3), np.float32)
log("triangles:", T.shape[0])
np.save(_os.path.join(out, "tris.npy"), T)
log("done")
