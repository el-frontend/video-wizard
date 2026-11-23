"""Serve immutable, scoped processing receipts using a single opened regular file."""

from email.utils import formatdate
import os
from pathlib import Path
import re
import stat
import time

from fastapi import HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from starlette.background import BackgroundTask


def byte_range(header: str, size: int) -> tuple[int, int] | None:
    # Receipts support one byte interval. Bound numeric parsing even for malformed headers.
    match = (
        re.fullmatch(r"bytes=(\d*)-(\d*)", header, flags=re.IGNORECASE | re.ASCII)
        if len(header) <= 128
        else None
    )
    if not match or not size:
        return None
    left, right = match.groups()
    if left:
        start = int(left)
        end = min(int(right), size - 1) if right else size - 1
        return (start, end) if start <= end else None
    if right and int(right) > 0:
        return (max(0, size - int(right)), size - 1)
    return None


def private_media(request: Request, path: Path):
    try:
        file = open(
            path,
            "rb",
            opener=lambda name, flags: os.open(
                name, flags | os.O_NOFOLLOW | os.O_NONBLOCK
            ),
        )
    except (OSError, ValueError):
        raise HTTPException(404)
    try:
        info = os.fstat(file.fileno())
        if not stat.S_ISREG(info.st_mode) or time.time() - info.st_mtime > 3600:
            raise HTTPException(404)
        size = info.st_size
        etag = f'"{info.st_ino:x}-{info.st_mtime_ns:x}-{size:x}"'
        modified = formatdate(info.st_mtime, usegmt=True)
        headers = {
            "ETag": etag,
            "Last-Modified": modified,
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, no-store",
        }
        selection = request.headers.get("range")
        validator = request.headers.get("if-range")
        status, start, end = 200, 0, size - 1
        if selection is not None and selection.partition("=")[0].lower() == "bytes" and (
            validator is None or validator in (etag, modified)
        ):
            interval = byte_range(selection, size)
            if interval is None:
                file.close()
                return Response(
                    status_code=416,
                    headers={**headers, "Content-Range": f"bytes */{size}"},
                )
            status = 206
            start, end = interval
            headers["Content-Range"] = f"bytes {start}-{end}/{size}"
        length = end - start + 1
        headers["Content-Length"] = str(length)
        if request.method == "HEAD":
            file.close()
            return Response(status_code=status, headers=headers, media_type="video/mp4")
        file.seek(start)

        def chunks():
            remaining = length
            try:
                while remaining:
                    block = file.read(min(65536, remaining))
                    if not block:
                        break
                    remaining -= len(block)
                    yield block
            finally:
                file.close()

        return StreamingResponse(
            chunks(),
            status_code=status,
            headers=headers,
            media_type="video/mp4",
            background=BackgroundTask(file.close),
        )
    except BaseException:
        file.close()
        raise
