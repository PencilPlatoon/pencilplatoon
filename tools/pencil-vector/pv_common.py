"""Shared helpers for the pencil-vector study pages -- the `*_study.py` / `*_pipeline.py` scripts that
render the HTML artifacts. Tooling only; the pipeline modules never import this. It's the Python
companion to pv-common.js / pv-common.css (the study pages' shared client assets).
"""
from __future__ import annotations

import base64
import io

from PIL import Image


def png_b64(img, optimize: bool = True) -> str:
    """Base64-encoded PNG of a numpy array or PIL image (no data: URI prefix)."""
    if not isinstance(img, Image.Image):
        img = Image.fromarray(img)
    bio = io.BytesIO()
    img.save(bio, format="PNG", optimize=optimize)
    return base64.b64encode(bio.getvalue()).decode()


def png_datauri(img, optimize: bool = True) -> str:
    """Base64-encoded PNG of a numpy array or PIL image, as an inline `data:` URI."""
    return "data:image/png;base64," + png_b64(img, optimize)
