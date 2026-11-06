# -*- coding: utf-8 -*-
"""Veritabanı: özel bir GitHub deposu (ör. layoutx-veri). P&PX'teki yapının Python karşılığı.

- Dosyalar depoda programdaki gibi durur (projects/..., tools/sablon-layout-veri.json, tools/ayarlar.json).
- Git'in yapı taşları kullanılır: blob, ağaç, commit, dal başı. Değişenler tek commit olarak gider; dal başı
  "yalnız ileri" güncellenir, başka bilgisayar arada göndermişse GitHub reddeder, yeniden alınıp birleştirilir.
- Üç yollu karşılaştırma (yerel / depo / son eşitleme): yalnız bir taraf değiştiyse o taraf alınır.
  İki taraf da değiştiyse yeni olan asıl dosya olur, eskisi yanında "<dosya>.catisma-<tarih>" adıyla saklanır.
  Silme ile düzenleme karşılaşırsa düzenleme kalır.
- STEP (büyük), _work/ ara dosyaları ve üretilen çıktılar (…-Layout….pdf/html) depoya girmez.
- Erişim anahtarı yalnız bu bilgisayarda, kullanıcı klasöründe (%LOCALAPPDATA%/LayoutX/veritabani.json) durur.
"""
import os, re, json, time, base64, socket, hashlib, threading, datetime, urllib.request, urllib.error

API = os.environ.get("LAYOUTX_GITHUB_API", "https://api.github.com")
MAX_BYTES = 50 * 1024 * 1024          # tek dosya sınırı (GitHub 100 MB); üstü depoya alınmaz
SKIP_DIRS = {"_work", ".git", "__pycache__", "node_modules"}
SKIP_EXT = (".step", ".stp", ".tmp", ".log")
OUTPUT_RE = re.compile(r"-Layout(-[A-Z]{2})*(-secim)?\.(pdf|html)$", re.I)   # üretilen çıktılar
TOP_FILES = ("tools/sablon-layout-veri.json", "tools/ayarlar.json")
INTERVAL = 60                         # depo denetimi (sn)
DEBOUNCE = 8                          # değişiklikten sonra gönderme gecikmesi (sn)


class GitHubError(Exception):
    def __init__(self, message, **kw):
        super().__init__(message)
        self.auth = kw.get("auth", False)
        self.offline = kw.get("offline", False)
        self.conflict = kw.get("conflict", False)
        self.retry_after = kw.get("retry_after", 0)


def git_sha(data):
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def stamp(ts):
    return datetime.datetime.fromtimestamp(ts).strftime("%Y%m%d-%H%M%S")


class Remote:
    """GitHub REST API (yalnız standart kütüphane). repo: "kullanici/depo"."""

    def __init__(self, repo, token, api=API):
        owner, _, name = str(repo or "").strip().partition("/")
        if not owner or not name or "/" in name:
            raise GitHubError("Depo adı kullanici/depo biçiminde olmalı")
        self.repo = f"{owner}/{name}"
        self.base = f"{api.rstrip('/')}/repos/{owner}/{name}"
        self.token = token
        self.branch = None

    def send(self, method, path, body=None, allow=()):
        data = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {"Accept": "application/vnd.github+json", "User-Agent": "LayoutX", "X-GitHub-Api-Version": "2022-11-28",
                   "Cache-Control": "no-cache"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if data is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                raw = r.read()
                return r.status, (json.loads(raw.decode("utf-8")) if raw else None)
        except urllib.error.HTTPError as e:
            if e.code in allow:
                return e.code, None
            raise self.explain(e)
        except (urllib.error.URLError, socket.timeout, ConnectionError, OSError):
            raise GitHubError("İnternet bağlantısı yok ya da GitHub'a ulaşılamıyor. Değişiklikler bu bilgisayarda bekliyor.", offline=True)

    @staticmethod
    def explain(e):
        try:
            detail = json.loads(e.read().decode("utf-8")).get("message", "")
        except Exception:
            detail = ""
        retry = int(e.headers.get("retry-after") or 0) if e.headers else 0
        limited = retry > 0 or (e.headers and e.headers.get("x-ratelimit-remaining") == "0") or "rate limit" in detail.lower()
        if e.code == 401:
            return GitHubError("GitHub erişim anahtarı geçersiz ya da süresi dolmuş. Veritabanı sekmesinden yenileyin.", auth=True)
        if e.code in (403, 429) and limited:
            return GitHubError("GitHub hız sınırına ulaşıldı. Değişiklikler bu bilgisayarda bekliyor, kendiliğinden gönderilecek.",
                               retry_after=retry or 60)
        if e.code == 403:
            return GitHubError("Erişim anahtarının bu depoya yazma izni yok (Contents: Read and write gerekli).", auth=True)
        if e.code == 404:
            return GitHubError("Depo bulunamadı ya da erişim anahtarının bu depoya izni yok.", auth=True)
        if e.code >= 500:
            return GitHubError("GitHub şu an yanıt vermiyor. Değişiklikler bu bilgisayarda bekliyor.", offline=True)
        return GitHubError(f"GitHub hatası {e.code}: {detail}")

    def info(self):
        _, d = self.send("GET", "")
        self.branch = d.get("default_branch") or "main"
        perms = d.get("permissions") or {}
        return {"private": bool(d.get("private")), "branch": self.branch, "push": perms.get("push", None), "full_name": d.get("full_name")}

    def ensure_branch(self):
        if not self.branch:
            self.info()
        return self.branch

    def head_sha(self):
        """Dal başı; depo boşsa None (GitHub boş depoda 409 döndürür)."""
        _, d = self.send("GET", f"/git/ref/heads/{self.ensure_branch()}", allow=(404, 409))
        return d["object"]["sha"] if d else None

    def commit_info(self, sha):
        _, d = self.send("GET", f"/git/commits/{sha}")
        at = datetime.datetime.strptime(d["committer"]["date"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc).timestamp()
        return {"sha": sha, "tree": d["tree"]["sha"], "at": at}

    def tree(self, tree_sha):
        _, d = self.send("GET", f"/git/trees/{tree_sha}?recursive=1")
        if d.get("truncated"):
            raise GitHubError("Depo bir seferde okunamayacak kadar büyük")
        return {e["path"]: e["sha"] for e in d.get("tree", []) if e.get("type") == "blob"}

    def blob(self, sha):
        _, d = self.send("GET", f"/git/blobs/{sha}")
        data = base64.b64decode(d.get("content", ""))
        if git_sha(data) != sha:
            raise GitHubError("Depodan gelen dosya bozuk, yeniden denenecek", offline=True)
        return data

    def init(self):
        """Boş depoda ağaç / commit oluşturulamaz; ilk commit dosya arayüzüyle atılır."""
        text = ("# LayoutX veri deposu\n\nBu depo Layout Çizim Motoru tarafından yönetilir (projeler, görünümler, şablon).\n"
                "Dosyaları elle değiştirmeyin; eski sürümler commit geçmişindedir.\n")
        self.send("PUT", "/contents/README.md", {"message": "LayoutX veri deposu", "content": base64.b64encode(text.encode("utf-8")).decode("ascii")})

    def post_blob(self, data):
        _, d = self.send("POST", "/git/blobs", {"content": base64.b64encode(data).decode("ascii"), "encoding": "base64"})
        return d["sha"]

    def commit(self, head, rows, message):
        _, t = self.send("POST", "/git/trees", {"base_tree": head["tree"], "tree": rows})
        _, c = self.send("POST", "/git/commits", {"message": message, "tree": t["sha"], "parents": [head["sha"]]})
        st, moved = self.send("PATCH", f"/git/refs/heads/{self.ensure_branch()}", {"sha": c["sha"], "force": False}, allow=(409, 422))
        if moved is None:
            raise GitHubError("Depo arada değişti", conflict=True)
        return {"sha": c["sha"], "tree": t["sha"], "at": time.time()}


class Database:
    """Proje klasörü ile GitHub deposu arasında eşitleme. Tek örnek, arka plan iş parçacığıyla çalışır."""

    def __init__(self, root, state_path, log=print, on_change=None, file_lock=None):
        self.root = root
        self.file_lock = file_lock or threading.Lock()
        self.state_path = state_path
        self.log = log
        self.on_change = on_change or (lambda paths: None)
        self.lock = threading.Lock()
        self.state = self._load()
        self.busy = False
        self.timer = None
        self.wake = threading.Event()
        self.rev = 0                   # yerelde depodan değişen dosya sayacı (uygulama yeniden yükler)
        self.changed = {}              # proje adı -> rev
        self.last_conflicts = []
        self.thread = None

    # ---------------------------------------------------------------- durum dosyası
    def _load(self):
        try:
            with open(self.state_path, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return {}

    def _save(self):
        os.makedirs(os.path.dirname(self.state_path), exist_ok=True)
        tmp = self.state_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.state, f, ensure_ascii=False, indent=1)
        os.replace(tmp, self.state_path)

    @property
    def connected(self):
        return bool(self.state.get("repo") and self.state.get("token"))

    def status(self):
        s = self.state
        out = {"connected": self.connected, "repo": s.get("repo", ""), "private": s.get("private"), "busy": self.busy,
               "last": s.get("last", 0), "error": s.get("error", ""), "auth": s.get("auth_error", False),
               "files": len(s.get("base", {})), "skipped": s.get("skipped", []), "conflicts": s.get("conflicts", [])[-10:],
               "machine": os.environ.get("COMPUTERNAME", ""), "rev": self.rev, "changed": self.changed,
               "connectedAt": s.get("connectedAt", 0)}
        if self.connected:
            try:
                out["pending"] = len(self._pending())
            except Exception:
                out["pending"] = 0
        return out

    # ---------------------------------------------------------------- yerel dosyalar
    def tracked(self, rel):
        parts = rel.split("/")
        if rel in TOP_FILES:
            return True
        if parts[0] != "projects" or len(parts) < 3:
            return False
        if any(p in SKIP_DIRS or p.startswith(".") for p in parts[1:]):
            return False
        low = rel.lower()
        if low.endswith(SKIP_EXT) or OUTPUT_RE.search(rel):
            return False
        return True

    def local_files(self):
        out, skipped = {}, []
        for rel in TOP_FILES:
            p = os.path.join(self.root, *rel.split("/"))
            if os.path.isfile(p):
                out[rel] = p
        proj = os.path.join(self.root, "projects")
        for dirpath, dirnames, filenames in os.walk(proj):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
            for fn in filenames:
                p = os.path.join(dirpath, fn)
                rel = os.path.relpath(p, self.root).replace(os.sep, "/")
                if not self.tracked(rel):
                    continue
                if os.path.getsize(p) > MAX_BYTES:
                    skipped.append(rel)
                    continue
                out[rel] = p
        return out, skipped

    def local_sha(self, rel, path):
        st = os.stat(path)
        cache = self.state.setdefault("hash", {})
        c = cache.get(rel)
        if c and c[0] == st.st_size and c[1] == st.st_mtime_ns:
            return c[2]
        with open(path, "rb") as f:
            sha = git_sha(f.read())
        cache[rel] = [st.st_size, st.st_mtime_ns, sha]
        return sha

    def local_map(self):
        files, skipped = self.local_files()
        return {rel: self.local_sha(rel, p) for rel, p in files.items()}, files, skipped

    def _pending(self):
        mine, _, _ = self.local_map()
        base = self.state.get("base", {})
        return [p for p in set(mine) | set(base) if mine.get(p) != base.get(p)]

    def _write_local(self, rel, data, expect="any"):
        """expect: yazmadan önce yerel dosyanın hâlâ bu kimlikte olması (None: yok) beklenir; arada kaydedildiyse yazılmaz."""
        p = os.path.join(self.root, *rel.split("/"))
        with self.file_lock:
            if expect != "any":
                now = self.local_sha(rel, p) if os.path.isfile(p) else None
                if now != expect:
                    return False
            self._write_raw(rel, p, data)
        return True

    def _write_raw(self, rel, p, data):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        tmp = p + ".dbtmp"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, p)
        st = os.stat(p)
        self.state.setdefault("hash", {})[rel] = [st.st_size, st.st_mtime_ns, git_sha(data)]

    def _remove_local(self, rel):
        p = os.path.join(self.root, *rel.split("/"))
        try:
            os.remove(p)
        except OSError:
            pass
        self.state.get("hash", {}).pop(rel, None)
        d = os.path.dirname(p)
        try:   # boşalan görünüm / proje klasörü
            while d.startswith(os.path.join(self.root, "projects")) and d != os.path.join(self.root, "projects") and not os.listdir(d):
                os.rmdir(d)
                d = os.path.dirname(d)
        except OSError:
            pass

    # ---------------------------------------------------------------- bağlantı
    def connect(self, repo, token):
        token = (token or "").strip() or self.state.get("token", "")
        if not token:
            raise GitHubError("Erişim anahtarı gerekli")
        r = Remote(repo, token)
        info = r.info()
        if not info["private"]:
            raise GitHubError("Depo herkese açık. Müşteri verisi içerdiği için yalnız özel (private) depoya bağlanılır.")
        if info.get("push") is False:
            raise GitHubError("Erişim anahtarının bu depoya yazma izni yok (Contents: Read and write gerekli).", auth=True)
        same = self.state.get("repo") == r.repo
        self.state.update({"repo": r.repo, "token": token, "private": True, "error": "", "auth_error": False,
                           "connectedAt": self.state.get("connectedAt") if same else time.time()})
        if not same:   # başka depo: eşitleme geçmişi sıfırdan (iki taraf birleştirilir, hiçbir şey silinmez)
            self.state.pop("base", None)
            self.state.pop("head", None)
        self._save()
        self.trigger(0)
        return self.status()

    def disconnect(self):
        with self.lock:
            repo = self.state.get("repo", "")
            self.state = {"repo": repo}
            self._save()
        return self.status()

    # ---------------------------------------------------------------- zamanlama
    def start(self):
        if self.thread:
            return
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def _loop(self):
        delay = 2
        while True:
            self.wake.wait(delay)
            self.wake.clear()
            if not self.connected:
                delay = INTERVAL
                continue
            wait = self.state.get("retry_at", 0) - time.time()
            if wait > 0:
                delay = min(wait, INTERVAL)
                continue
            try:
                self.sync()
            except Exception as e:   # beklenmeyen hata: günlüğe yaz, döngü sürsün
                self.log(f"Veritabanı: {e}")
            delay = INTERVAL

    def trigger(self, delay=DEBOUNCE):
        """Değişiklik oldu: kısa gecikmeyle (art arda kayıtlar tek commit olsun) eşitle."""
        if not self.connected:
            return
        if self.timer:
            self.timer.cancel()
        self.timer = threading.Timer(delay, self.wake.set)
        self.timer.daemon = True
        self.timer.start()

    # ---------------------------------------------------------------- eşitleme
    def sync(self):
        if not self.connected:
            return self.status()
        with self.lock:
            self.busy = True
            try:
                remote = Remote(self.state["repo"], self.state["token"])
                for attempt in range(4):
                    try:
                        self._exchange(remote)
                        break
                    except GitHubError as e:
                        if e.conflict and attempt < 3:
                            continue
                        raise
                self.state.update({"error": "", "auth_error": False, "last": time.time(), "retry_at": 0})
            except GitHubError as e:
                self.state["error"] = str(e)
                self.state["auth_error"] = e.auth
                self.state["retry_at"] = time.time() + (e.retry_after or (300 if e.auth else 60))
                self.log(f"Veritabanı: {e}")
            finally:
                self.busy = False
                self._save()
        return self.status()

    def _exchange(self, remote):
        head_sha = remote.head_sha()
        if head_sha is None:
            remote.init()
            head_sha = remote.head_sha()
        known = self.state.get("head") or {}
        base = dict(self.state.get("base", {}))
        mine, files, skipped = self.local_map()
        self.state["skipped"] = skipped
        if known.get("sha") == head_sha and mine == base:
            return                                       # iki taraf da değişmedi: tek istek
        head = remote.commit_info(head_sha)
        theirs = {p: s for p, s in remote.tree(head["tree"]).items() if self.tracked(p)} \
            if known.get("sha") != head_sha or not known.get("tree_map") else dict(known["tree_map"])
        uploads, removes, changed, conflicts = [], [], [], []
        for path in sorted(set(theirs) | set(mine) | set(base)):
            t, m, b = theirs.get(path), mine.get(path), base.get(path)
            if t == m:
                if t is None:
                    base.pop(path, None)
                else:
                    base[path] = t
                continue
            if m == b:                                   # yalnız depoda değişmiş
                if t is None:
                    self._remove_local(path)
                    base.pop(path, None)
                elif self._write_local(path, remote.blob(t), expect=m):
                    base[path] = t
                else:
                    continue                             # arada burada kaydedildi: sonraki eşitlemede birleşir
                changed.append(path)
            elif t == b:                                 # yalnız burada değişmiş
                if m is None:
                    removes.append(path)
                else:
                    uploads.append(path)
            elif t is None:                              # depoda silinmiş, burada düzenlenmiş: düzenleme kalır
                uploads.append(path)
            elif m is None:                              # burada silinmiş, depoda düzenlenmiş: düzenleme kalır
                self._write_local(path, remote.blob(t))
                base[path] = t
                changed.append(path)
            else:                                        # iki taraf da değiştirmiş: yeni olan asıl dosya
                local_at = os.path.getmtime(files[path])
                theirs_data = remote.blob(t)
                if head["at"] > local_at:
                    with open(files[path], "rb") as f:
                        loser, loser_at = f.read(), local_at
                    self._write_local(path, theirs_data)
                    base[path] = t
                    changed.append(path)
                else:
                    loser, loser_at = theirs_data, head["at"]
                    uploads.append(path)
                copy = f"{path}.catisma-{stamp(loser_at)}"
                self._write_local(copy, loser)
                uploads.append(copy)
                conflicts.append(copy)
        if uploads or removes:
            rows, n = [], 0
            for path in uploads:
                p = os.path.join(self.root, *path.split("/"))
                with open(p, "rb") as f:
                    data = f.read()
                sha = git_sha(data)
                if theirs.get(path) != sha:
                    rows.append({"path": path, "mode": "100644", "type": "blob", "sha": remote.post_blob(data)})
                    n += 1
                    if n > 40:
                        time.sleep(0.75)                 # GitHub: dakikada en çok 80 içerik isteği
                base[path] = sha
            for path in removes:
                if path in theirs:
                    rows.append({"path": path, "mode": "100644", "type": "blob", "sha": None})
                base.pop(path, None)
            if rows:
                who = os.environ.get("COMPUTERNAME", "")
                head = remote.commit(head, rows, f"LayoutX: {len(rows)} dosya" + (f" ({who})" if who else ""))
                for r in rows:
                    if r["sha"] is None:
                        theirs.pop(r["path"], None)
                    else:
                        theirs[r["path"]] = r["sha"]
        self.state["base"] = base
        self.state["head"] = {"sha": head["sha"], "at": head["at"], "tree_map": theirs}
        if conflicts:
            self.state.setdefault("conflicts", []).extend(conflicts)
        if changed:
            self.rev += 1
            for path in changed:
                parts = path.split("/")
                if parts[0] == "projects" and len(parts) > 1:
                    self.changed[parts[1]] = self.rev
            self.log(f"Veritabanı: depodan {len(changed)} dosya alındı")
            self.on_change(changed)
        if uploads or removes:
            self.log(f"Veritabanı: {len(uploads)} dosya gönderildi, {len(removes)} silindi")
