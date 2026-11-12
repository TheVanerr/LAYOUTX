# -*- coding: utf-8 -*-
"""Veritabanı eşitleme testi: sahte GitHub sunucusu + iki "bilgisayar" (iki ayrı klasör).
Kullanım: python tools/test_layout_db.py   (gerçek depoya ve internete dokunmaz)"""
import os, sys, json, time, base64, hashlib, tempfile, threading, shutil, datetime
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

PORT = 8799
os.environ["LAYOUTX_GITHUB_API"] = f"http://127.0.0.1:{PORT}"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import layout_db  # noqa: E402


class Fake:
    """Yalnız eşitlemenin kullandığı GitHub uç noktaları."""
    def __init__(self):
        self.blobs, self.trees, self.commits, self.head, self.n = {}, {}, {}, None, 0
        self.private = True

    def oid(self, kind, payload):
        self.n += 1
        return hashlib.sha1(f"{kind}{self.n}{payload}".encode()).hexdigest()


F = Fake()


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def cors(self):
        """Tarayıcıdaki web kipi de bu sahte sunucuyla test edilebilsin (GitHub API de CORS'a izin verir)."""
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, X-GitHub-Api-Version")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def reply(self, code, obj=None):
        b = json.dumps(obj).encode() if obj is not None else b""
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n).decode()) if n else {}

    def route(self):
        """/repos/<sahip>/<depo>/... -> /... (her depo adı aynı sahte depoya gider)"""
        parts = self.path.split("?")[0].split("/repos/", 1)[1].split("/")
        self.full = "/".join(parts[:2])
        return "/" + "/".join(parts[2:]) if len(parts) > 2 else ""

    def do_GET(self):
        p = self.route()
        if self.headers.get("Authorization") != "Bearer TOKEN":
            return self.reply(401, {"message": "Bad credentials"})
        if p == "":
            return self.reply(200, {"private": F.private, "default_branch": "main", "full_name": self.full, "permissions": {"push": True}})
        if p == "/git/ref/heads/main":
            return self.reply(409, {"message": "Git Repository is empty."}) if F.head is None else self.reply(200, {"object": {"sha": F.head}})
        if p.startswith("/git/commits/"):
            c = F.commits[p.rsplit("/", 1)[1]]
            return self.reply(200, {"tree": {"sha": c["tree"]}, "committer": {"date": c["date"]}})
        if p.startswith("/git/trees/"):
            t = F.trees[p.rsplit("/", 1)[1]]
            return self.reply(200, {"tree": [{"path": k, "type": "blob", "sha": v} for k, v in t.items()], "truncated": False})
        if p.startswith("/git/blobs/"):
            return self.reply(200, {"content": base64.b64encode(F.blobs[p.rsplit("/", 1)[1]]).decode()})
        self.reply(404, {"message": "nf"})

    def new_commit(self, tree, parent):
        sha = F.oid("c", tree)
        F.commits[sha] = {"tree": tree, "parent": parent,
                          "date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
        return sha

    def do_PUT(self):
        p = self.route()
        if p == "/contents/README.md":
            data = base64.b64decode(self.body()["content"])
            sha = layout_db.git_sha(data)
            F.blobs[sha] = data
            tid = F.oid("t", "readme")
            F.trees[tid] = {"README.md": sha}
            F.head = self.new_commit(tid, None)
            return self.reply(201, {"content": {"sha": sha}})
        self.reply(404, {})

    def do_POST(self):
        p, b = self.route(), self.body()
        if p == "/git/blobs":
            data = base64.b64decode(b["content"])
            sha = layout_db.git_sha(data)
            F.blobs[sha] = data
            return self.reply(201, {"sha": sha})
        if p == "/git/trees":
            t = dict(F.trees[b["base_tree"]])
            for r in b["tree"]:
                if r["sha"] is None:
                    t.pop(r["path"], None)
                else:
                    t[r["path"]] = r["sha"]
            tid = F.oid("t", json.dumps(t, sort_keys=True))
            F.trees[tid] = t
            return self.reply(201, {"sha": tid})
        if p == "/git/commits":
            return self.reply(201, {"sha": self.new_commit(b["tree"], b["parents"][0])})
        self.reply(404, {})

    def do_PATCH(self):
        b = self.body()
        if F.commits[b["sha"]]["parent"] != F.head:      # yalnız ileri
            return self.reply(422, {"message": "Update is not a fast forward"})
        F.head = b["sha"]
        self.reply(200, {"object": {"sha": F.head}})


def write(root, rel, text):
    p = os.path.join(root, *rel.split("/"))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(text)
    return p


def read(root, rel):
    p = os.path.join(root, *rel.split("/"))
    return open(p, encoding="utf-8").read() if os.path.exists(p) else None


def main():
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    tmp = tempfile.mkdtemp(prefix="layoutdb-test-")
    A, B = os.path.join(tmp, "A"), os.path.join(tmp, "B")
    os.makedirs(A)
    os.makedirs(B)
    dbA = layout_db.Database(A, os.path.join(tmp, "stA.json"), log=lambda m: None)
    dbB = layout_db.Database(B, os.path.join(tmp, "stB.json"), log=lambda m: None)
    ok = True

    def check(name, cond):
        nonlocal ok
        print(("  OK  " if cond else "  HATA") + " " + name)
        ok = ok and cond

    V = "projects/P1/p1-layout-veri.json"
    write(A, V, '{"rev": 1}')
    write(A, "projects/P1/views/view_top.png", "PNG")
    write(A, "projects/P1/model.STEP", "STEP büyük dosya")
    write(A, "projects/P1/_work/tris.npy", "ara dosya")
    write(A, "projects/P1/P1-Layout-TR.pdf", "çıktı")
    write(A, "tools/sablon-layout-veri.json", "{}")

    F.private = False
    try:
        dbA.connect("o/r", "TOKEN")
        check("herkese açık depo reddedilir", False)
    except layout_db.GitHubError:
        check("herkese açık depo reddedilir", True)
    F.private = True
    try:
        layout_db.Remote("o/r", "YANLIS").info()
        check("geçersiz anahtar", False)
    except layout_db.GitHubError as e:
        check("geçersiz anahtar anlaşılır hata verir", e.auth)

    dbA.state.update({"repo": "o/r", "token": "TOKEN"})
    dbB.state.update({"repo": "o/r", "token": "TOKEN"})
    print("1. ilk aktarma (boş depo)")
    dbA.sync()
    tree = F.trees[F.commits[F.head]["tree"]]
    check("veri + görünüm + şablon depoda", {V, "projects/P1/views/view_top.png", "tools/sablon-layout-veri.json"} <= set(tree))
    check("STEP, _work ve çıktı depoya girmez", not any(k.endswith((".STEP", ".npy", ".pdf")) for k in tree))
    check("hata yok", not dbA.state.get("error"))
    print("2. ikinci bilgisayar alır")
    dbB.sync()
    check("B'ye veri geldi", read(B, V) == '{"rev": 1}')
    check("B'ye görünüm geldi", read(B, "projects/P1/views/view_top.png") == "PNG")
    print("3. B değiştirir, A alır")
    time.sleep(1.1)
    write(B, V, '{"rev": 2}')
    dbB.sync()
    dbA.sync()
    check("A'da B'nin değişikliği", read(A, V) == '{"rev": 2}')
    check("A'ya değişen proje bildirildi", "P1" in dbA.changed)
    print("4. iki taraf da değiştirir (yeni olan kazanır, eski kopya olarak kalır)")
    time.sleep(1.1)
    write(A, V, '{"rev": "A"}')
    dbA.sync()
    time.sleep(2.2)
    write(B, V, '{"rev": "B-yeni"}')
    dbB.sync()
    copies = [f for f in os.listdir(os.path.join(B, "projects", "P1")) if ".catisma-" in f]
    check("B'nin yeni sürümü asıl dosya", read(B, V) == '{"rev": "B-yeni"}')
    check("A'nın sürümü .catisma kopyası olarak saklandı", len(copies) == 1 and read(B, "projects/P1/" + copies[0]) == '{"rev": "A"}')
    dbA.sync()
    check("A da yeni sürümü ve kopyayı aldı", read(A, V) == '{"rev": "B-yeni"}' and
          any(".catisma-" in f for f in os.listdir(os.path.join(A, "projects", "P1"))))
    print("5. yarış: depo arada ilerlerse (yalnız ileri) yeniden birleşir")
    write(A, "projects/P1/a.json", "a")
    write(B, "projects/P1/b.json", "b")
    dbA.sync()
    dbB.sync()
    dbA.sync()
    check("iki yeni dosya da iki tarafta", read(A, "projects/P1/b.json") == "b" and read(B, "projects/P1/a.json") == "a")
    print("6. silme")
    os.remove(os.path.join(A, "projects", "P1", "a.json"))
    dbA.sync()
    dbB.sync()
    check("A'da silinen B'de de silindi", read(B, "projects/P1/a.json") is None)
    print("7. silme ile düzenleme karşılaşırsa düzenleme kalır")
    os.remove(os.path.join(A, "projects", "P1", "b.json"))
    time.sleep(1.1)
    write(B, "projects/P1/b.json", "b-düzenlendi")
    dbA.sync()
    dbB.sync()
    dbA.sync()
    check("düzenleme kaldı, A'ya geri geldi", read(A, "projects/P1/b.json") == "b-düzenlendi")
    print("8. değişiklik yokken tek istek, bekleyen 0")
    check("bekleyen yok", dbA.status()["pending"] == 0 and dbB.status()["pending"] == 0)
    print("9. STEP ve çıktılar yerelde dokunulmadan kaldı")
    check("STEP duruyor", read(A, "projects/P1/model.STEP") is not None and read(A, "projects/P1/P1-Layout-TR.pdf") is not None)
    srv.shutdown()
    shutil.rmtree(tmp, ignore_errors=True)
    print("SONUÇ:", "hepsi geçti" if ok else "HATA VAR")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
