"""Read one registered Motion Studio source into an importer-owned temporary directory."""
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
from contextlib import ExitStack
from pathlib import Path

DIRECTORY = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
MAX_MODEL = 16 * 1024 * 1024
MAX_CAPTURE = 2 * 1024**3
STYLE_IDS = ("noticias-liquid-glass", "noticias-elfrontend-web", "noticias-modern-editorial")


def regular(stack, anchor, parts):
    parent = anchor
    for part in parts[:-1]:
        parent = os.open(part, DIRECTORY, dir_fd=parent)
        stack.callback(os.close, parent)
    number = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
    file = stack.enter_context(os.fdopen(number, "rb"))
    if not stat.S_ISREG(os.fstat(number).st_mode):
        raise ValueError("regular file required")
    return file


def capture(root, slug, stage, fps, keep):
    entries = {}
    total = 0
    with ExitStack() as stack:
        anchor = os.open("/", DIRECTORY)
        stack.callback(os.close, anchor)
        for part in Path(root).parts[1:]:
            anchor = os.open(part, DIRECTORY, dir_fd=anchor)
            stack.callback(os.close, anchor)
        def read(parts, key, media=False):
            nonlocal total
            with ExitStack() as files:
                try:
                    source = regular(files, anchor, parts)
                except FileNotFoundError:
                    entries[key] = None
                    return None
                size = os.fstat(source.fileno()).st_size
                if size > (MAX_CAPTURE if media else MAX_MODEL) or total + size > MAX_CAPTURE:
                    raise ValueError("capture exceeds size limit")
                total += size
                digest = hashlib.sha256()
                dest = stage / hashlib.sha256(key.encode()).hexdigest()
                output = files.enter_context(dest.open("wb")) if media and keep else None
                model = bytearray()
                amount = 0
                while block := source.read(1024 * 1024):
                    amount += len(block)
                    if amount > size:
                        raise ValueError("source in motion")
                    digest.update(block)
                    if output:
                        output.write(block)
                    if not media:
                        model.extend(block)
                if amount != size:
                    raise ValueError("source in motion")
                entries[key] = digest.hexdigest()
                return None if media else bytes(model)
        base = ["videos",slug]
        # An unknown or removed project is not an original-only project.
        directory = os.dup(anchor)
        stack.callback(os.close,directory)
        for part in base:
            directory = os.open(part, DIRECTORY, dir_fd=directory)
            stack.callback(os.close,directory)
        episode_bytes = read(base+["episode.json"], "episode")
        episode = json.loads(episode_bytes) if episode_bytes is not None else None
        captions_bytes = read(base+["captions.json"], "captions")
        captions = json.loads(captions_bytes) if captions_bytes is not None else None
        meta = json.loads(read([".studio","projects",slug,"state.json"], "state") or "{}")
        if not isinstance(meta,dict):
            raise ValueError("invalid state")
        model = episode if isinstance(episode,dict) and isinstance(episode.get("scenes"),list) else None
        public = {k:meta[k] for k in ("styleId","title") if k in meta}
        frame = (read(base+["frame.md"],"frame") or b"").decode()
        style = public.get("styleId")
        style_frame = None
        if not style and frame:
            for candidate in STYLE_IDS:
                frame_bytes = read(["styles",candidate,"frame.md"], "candidate")
                entries.pop("candidate")
                if frame_bytes is None:
                    continue
                name = re.search(r"^name:\s*(.+)$", frame_bytes.decode(), re.M)
                label = name.group(1).strip("\"'") if name else candidate
                if "name: " + label in frame:
                    style, style_frame = candidate, frame_bytes
                    break
        committed = True
        if meta.get("revision") is not None:
            # saveUnlocked hashes the raw model prior to any presentation conversion.
            state = {"title": meta.get("title") or (model or {}).get("title") or (model or {}).get("series") or slug.replace("-", " "),
                     "styleId": meta.get("styleId", style), "episode": episode,
                     "captions": [] if captions_bytes is None else captions}
            result = subprocess.run(["node", str(Path(__file__).with_name("motion-revision.mjs"))],
                                    input=json.dumps(state).encode(), stdout=subprocess.PIPE,
                                    stderr=subprocess.DEVNULL, timeout=10, check=True)
            committed = result.stdout.decode() == meta["revision"]
        if style:
            public["styleId"] = style
        else:
            public.pop("styleId", None)
        media_refs = set()
        if model:
            media_refs = {item.get("audio") for item in model["scenes"] if isinstance(item,dict)}
            media_refs.add(model.get("audioMaster"))
        media_refs.discard(None)
        bindings = meta.get("audioBindings", {})
        public["audioBindings"] = {k:bindings[k] for k in media_refs if k in bindings}
        # Hash only relevant state. Provider credentials and private voice profiles never leave the source.
        entries["state"] = public
        if model:
            scene_fields = {"kind","headline","titleLines","narration","duration","audio","audioOffset","voiceDuration","voiceDirty","audioDirty","narrationDirty","section","deck","hero","heroLabel","secondLabel","secondLines","source","sourceDate","secondAt","secondCue","design","diagram","nodeA","nodeB","connector","detail","count","mark","note"}
            episode = {k:model[k] for k in ("title","series","date","dateLabel","audioMaster","audioDirty","narrationDirty","voiceDirty") if k in model}
            episode["scenes"] = [{k:v for k,v in scene.items() if k in scene_fields} for scene in model["scenes"]]
            for ref in sorted(media_refs):
                if not isinstance(ref,str) or not re.fullmatch(r"assets/(?:[\w-]+/)*[\w .-]+\.(?:wav|mp3|m4a|aac|ogg|flac)",ref,re.ASCII|re.I):
                    raise ValueError("invalid audio reference")
                read(base+ref.split("/"),ref,True)
        else:
            episode = None
            read(["out",slug+".mp4"],"original.mp4",True)
        fonts = {}
        if style in STYLE_IDS:
            for filename in ("ArchivoBlack-400.woff2","Bricolage-800.woff2","Geist-variable.woff2","GeistMono-variable.woff2"):
                key = "font:" + filename
                read(["styles",style,"assets","fonts",filename],key,True)
                fonts[filename] = entries[key]
            if style_frame is None:
                style_frame = read(["styles",style,"frame.md"],"style")
            else:
                entries["style"] = hashlib.sha256(style_frame).hexdigest()
        state = {"version":1,"fps":fps,"files":entries}
        fingerprint = hashlib.sha256(json.dumps(state,sort_keys=True,separators=(",",":")).encode()).hexdigest()
        return {"committed":committed,"hash":fingerprint,"episode":episode,"captions":captions,"meta":public,"frame":frame,
                "styleFrame":style_frame.decode() if style_frame else None, "fonts":fonts,
                "media":{k:hashlib.sha256(k.encode()).hexdigest() if entries[k] else None
                         for k in (media_refs if model else ["original.mp4"])}}


def main():
    root, slug, directory, fps = sys.argv[1:]
    if not os.path.isabs(root) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,119}",slug):
        raise ValueError("invalid registered source")
    stage = Path(directory)
    for _ in range(3):
        first = capture(root,slug,stage,float(fps),True)
        second = capture(root,slug,stage,float(fps),False)
        if first.pop("committed") and second["committed"] and first["hash"] == second["hash"]:
            (stage/"model.json").write_text(json.dumps(first))
            return
    raise ValueError("source changed")


if __name__ == "__main__":
    try:
        main()
    except (ValueError,TypeError,AttributeError,OSError,KeyError,subprocess.SubprocessError):
        sys.exit("Cannot capture the registered source consistently.")
