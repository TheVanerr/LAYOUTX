import os as _os
_sp = r'C:\Users\fatih.gural\AppData\Local\Programs\Python\Python311\Lib\site-packages'
for _d in ('cadquery_ocp.libs', 'vtk.libs'):
    _os.add_dll_directory(_os.path.join(_sp, _d))
import sys, json, time, os
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TDocStd import TDocStd_Document
from OCP.TCollection import TCollection_ExtendedString
from OCP.XCAFDoc import XCAFDoc_DocumentTool
from OCP.XCAFApp import XCAFApp_Application
from OCP.TDF import TDF_LabelSequence, TDF_Label
from OCP.TDataStd import TDataStd_Name
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.IFSelect import IFSelect_RetDone
from OCP.TopLoc import TopLoc_Location
from OCP.TopAbs import TopAbs_SOLID
from OCP.TopExp import TopExp_Explorer
from OCP.BRepTools import BRepTools
from OCP.Interface import Interface_Static

src = sys.argv[1]
out = sys.argv[2]
t0 = time.time()
def log(*a):
    print(f"[{time.time()-t0:7.1f}s]", *a, flush=True)

app = XCAFApp_Application.GetApplication_s()
doc = TDocStd_Document(TCollection_ExtendedString("MDTV-XCAF"))
app.NewDocument(TCollection_ExtendedString("MDTV-XCAF"), doc)
reader = STEPCAFControl_Reader()
reader.SetNameMode(True)
reader.SetColorMode(False)
reader.SetLayerMode(False)
log("reading", src)
st = reader.ReadFile(src)
log("ReadFile status", st, "(done=%s)" % (st == IFSelect_RetDone))
if st != IFSelect_RetDone:
    sys.exit(1)
log("unit:", Interface_Static.CVal_s("xstep.cascade.unit"))
ok = reader.Transfer(doc)
log("Transfer", ok)
shape_tool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
free = TDF_LabelSequence()
shape_tool.GetFreeShapes(free)
log("free shapes:", free.Length())

def name_of(lbl):
    n = TDataStd_Name()
    if lbl.FindAttribute(TDataStd_Name.GetID_s(), n):
        return n.Get().ToExtString()
    return ""

def bbox(shape, optimal=False):
    b = Bnd_Box()
    if optimal:
        BRepBndLib.AddOptimal_s(shape, b, False, False)
    else:
        BRepBndLib.Add_s(shape, b, True)
    if b.IsVoid():
        return None
    xmin, ymin, zmin, xmax, ymax, zmax = b.Get()
    return [round(v, 2) for v in (xmin, ymin, zmin, xmax, ymax, zmax)]

def count_solids(shape):
    n = 0
    ex = TopExp_Explorer(shape, TopAbs_SOLID)
    while ex.More():
        n += 1; ex.Next()
    return n

nodes = []
MAXDEPTH = 3
def walk(lbl, loc, depth, path):
    # lbl: a label that may be a reference (component) or a definition
    ref = TDF_Label()
    is_ref = shape_tool.GetReferredShape_s(lbl, ref)
    if is_ref:
        comp_loc = shape_tool.GetLocation_s(lbl)
        loc = loc.Multiplied(comp_loc)
        deflbl = ref
    else:
        deflbl = lbl
    nm = name_of(lbl) or name_of(deflbl)
    defname = name_of(deflbl)
    shape = shape_tool.GetShape_s(deflbl)
    shape = shape.Moved(loc)
    is_asm = shape_tool.IsAssembly_s(deflbl)
    node = {"path": path, "depth": depth, "name": nm, "def": defname,
            "assembly": bool(is_asm), "bbox": bbox(shape, optimal=(depth <= 1)),
            "solids": count_solids(shape)}
    nodes.append(node)
    if depth <= 1:
        log(" " * depth, path, nm, node["bbox"], "solids", node["solids"])
    if is_asm and depth < MAXDEPTH:
        comps = TDF_LabelSequence()
        shape_tool.GetComponents_s(deflbl, comps)
        for i in range(1, comps.Length() + 1):
            walk(comps.Value(i), loc, depth + 1, f"{path}/{i}")

root_shape = None
for i in range(1, free.Length() + 1):
    lbl = free.Value(i)
    walk(lbl, TopLoc_Location(), 0, f"{i}")
    if root_shape is None:
        root_shape = shape_tool.GetShape_s(lbl)

log("nodes:", len(nodes))
with open(os.path.join(out, "structure.json"), "w", encoding="utf-8") as f:
    json.dump(nodes, f, ensure_ascii=False, indent=1)
log("writing brep")
BRepTools.Write_s(root_shape, os.path.join(out, "model.brep"))
log("done")
