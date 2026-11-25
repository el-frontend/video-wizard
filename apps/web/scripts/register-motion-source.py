"""Register or update an owner-scoped source without modifying Motion Studio."""
import argparse
import fcntl
import json
import os
import re
import tempfile
from pathlib import Path
from uuid import UUID

parser = argparse.ArgumentParser()
for name in ("config", "owner", "source-id", "root", "slug", "fps"):
    parser.add_argument("--"+name, required=True)
args = parser.parse_args()
config = Path(args.config).expanduser().absolute()
root = Path(args.root).absolute()
owner = str(UUID(args.owner))
if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,119}",args.source_id) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,119}",args.slug):
    parser.error("Invalid source ID or slug")
fps = float(args.fps)
if not 0 < fps <= 240 or root.resolve(strict=True) != root or not (root/"videos"/args.slug).is_dir():
    parser.error("Expected a real source directory and fps in (0, 240]")
if config.is_relative_to(root):
    parser.error("Store the registry outside the read-only Motion Studio root")
entry = dict(ownerId=owner, sourceId=args.source_id, root=str(root), slug=args.slug, fps=fps)
config.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
with os.fdopen(os.open(str(config)+".lock",os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600),"r+") as lock:
    fcntl.flock(lock,fcntl.LOCK_EX)
    try:
        with os.fdopen(os.open(config,os.O_RDONLY|os.O_NOFOLLOW)) as source:
            saved = json.load(source)
    except FileNotFoundError:
        saved = []
    entries = [row for row in saved if (row["ownerId"],row["sourceId"]) != (owner,args.source_id)]
    with tempfile.NamedTemporaryFile(mode="w",dir=config.parent,delete=False) as temp:
        json.dump(entries+[entry],temp,indent=2)
        temp.flush()
        os.fsync(temp.fileno())
    os.replace(temp.name,config)
