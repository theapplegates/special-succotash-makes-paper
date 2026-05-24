#!/usr/bin/env python3
"""
Cloudinary responsive <picture> generator with JXL / AVIF / WebP output.

Pipeline:
  local image
  -> upload to Cloudinary with responsive_breakpoints
  -> extract Cloudinary-chosen widths
  -> optionally nudge identical per-format width sets
  -> generate correct Cloudinary delivery URLs for every width/format
  -> write HTML + JSON metadata

Requires:
  pip install cloudinary python-dotenv

Environment:
  CLOUDINARY_CLOUD_NAME
  CLOUDINARY_API_KEY
  CLOUDINARY_API_SECRET
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import quote

import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv

load_dotenv()

DEFAULT_IMAGE_FORMATS = ["jxl", "avif", "webp"]
DEFAULT_FALLBACK_FORMAT = "webp"
DEFAULT_WIDTHS_IF_EMPTY = [400, 800, 1200]

# Desktop first, then narrower breakpoints. Browser uses the first matching source.
ART_DIRECTION_CONFIGS = [
    {
        "name": "desktop",
        "media": "(min-width: 1200px)",
        "sizes": "40vw",
        "extra_transformation": None,
    },
    {
        "name": "laptop",
        "media": "(min-width: 992px) and (max-width: 1199px)",
        "sizes": "60vw",
        "extra_transformation": "ar_16:9,c_fill,g_auto",
    },
    {
        "name": "tablet",
        "media": "(min-width: 768px) and (max-width: 991px)",
        "sizes": "70vw",
        "extra_transformation": "ar_4:3,c_fill,g_auto",
    },
    {
        "name": "mobile",
        "media": "(max-width: 767px)",
        "sizes": "100vw",
        "extra_transformation": "ar_1:1,c_fill,g_auto",
    },
]


def slugify_filename(path: str) -> str:
    stem = Path(path).stem.lower()
    stem = re.sub(r"[^a-z0-9]+", "_", stem).strip("_")
    return stem or "image"


def ensure_output_path(path_value: Optional[str], image_file: str, suffix: str) -> Path:
    if path_value:
        return Path(path_value)
    out_dir = Path("output")
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir / f"{slugify_filename(image_file)}{suffix}"


def configure_cloudinary() -> str:
    cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME")
    api_key = os.environ.get("CLOUDINARY_API_KEY")
    api_secret = os.environ.get("CLOUDINARY_API_SECRET")

    if not all([cloud_name, api_key, api_secret]):
        raise RuntimeError(
            "Missing Cloudinary env vars. Need CLOUDINARY_CLOUD_NAME, "
            "CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
        )

    cloudinary.config(
        cloud_name=cloud_name,
        api_key=api_key,
        api_secret=api_secret,
        secure=True,
    )
    return cloud_name


def upload_to_cloudinary(image_path: str, responsive_breakpoints_config: dict) -> dict:
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image file not found: {image_path}")

    return cloudinary.uploader.upload(
        image_path,
        responsive_breakpoints=[responsive_breakpoints_config],
    )


def extract_widths(cloudinary_data: Dict[str, Any]) -> List[int]:
    widths: set[int] = set()

    for rb_group in cloudinary_data.get("responsive_breakpoints", []):
        for bp in rb_group.get("breakpoints", []):
            width = bp.get("width")
            if isinstance(width, int) and width > 0:
                widths.add(width)

    if not widths and cloudinary_data.get("width"):
        widths.add(int(cloudinary_data["width"]))

    return sorted(widths)


def select_strategic_widths(widths: Iterable[int], max_widths: int) -> List[int]:
    unique = sorted({int(w) for w in widths if int(w) > 0})
    if not unique:
        return []
    if len(unique) <= max_widths:
        return unique

    target_widths = [250, 375, 525, 768, 1024, 1440, 1920, 2125]
    selected = {unique[0], unique[-1]}

    candidates = []
    for target in target_widths:
        available = [w for w in unique if w not in selected]
        if not available:
            break
        closest = min(available, key=lambda w: abs(w - target))
        candidates.append((abs(closest - target), target, closest))

    for _, _, width in sorted(candidates):
        if len(selected) >= max_widths:
            break
        selected.add(width)

    while len(selected) < max_widths and len(selected) < len(unique):
        ordered = sorted(selected)
        best_gap = -1
        best_width = None
        for left, right in zip(ordered, ordered[1:]):
            in_gap = [w for w in unique if left < w < right and w not in selected]
            if not in_gap:
                continue
            gap = right - left
            midpoint = left + gap / 2
            candidate = min(in_gap, key=lambda w: abs(w - midpoint))
            if gap > best_gap:
                best_gap = gap
                best_width = candidate
        if best_width is None:
            break
        selected.add(best_width)

    return sorted(selected)


def nudge_widths(widths: List[int], pct: float) -> List[int]:
    """Nudge middle widths while pinning first/last endpoints."""
    if len(widths) <= 2:
        return widths[:]

    out = [widths[0]]
    for width in widths[1:-1]:
        nudged = max(1, round(width * (1 + pct)))
        out.append(nudged)
    out.append(widths[-1])

    # Deduplicate safely while preserving order, then sort ascending for srcset sanity.
    return sorted(dict.fromkeys(out))


def decouple_widths_by_format(widths: List[int], formats: List[str], enabled: bool = True) -> Dict[str, List[int]]:
    result = {fmt: widths[:] for fmt in formats}
    if not enabled or len(formats) < 2:
        return result

    # Keep JXL as canonical. Nudge AVIF slightly smaller and WebP/JPEG slightly larger.
    # Endpoints stay pinned so max layout dimensions remain stable.
    if "avif" in result:
        result["avif"] = nudge_widths(widths, -0.06)
    for fmt in ("webp", "jpg", "jpeg"):
        if fmt in result:
            result[fmt] = nudge_widths(widths, 0.05)
    return result


def normalize_format(fmt: str) -> str:
    fmt = fmt.lower().strip().lstrip(".")
    if fmt == "jpg":
        return "jpeg"
    return fmt


def output_extension(fmt: str) -> str:
    return "jpg" if normalize_format(fmt) == "jpeg" else normalize_format(fmt)


def mime_type(fmt: str) -> str:
    fmt = normalize_format(fmt)
    return "image/jpeg" if fmt == "jpeg" else f"image/{fmt}"


def split_extra_transform(extra: Optional[str]) -> List[str]:
    if not extra:
        return []
    return [part.strip() for part in extra.split(",") if part.strip()]


def build_cloudinary_url(
    *,
    cloud_name: str,
    public_id: str,
    version: Optional[int],
    fmt: str,
    width: int,
    extra_transformation: Optional[str] = None,
    quality: str = "auto",
    secure: bool = True,
) -> str:
    """Build a deterministic Cloudinary delivery URL.

    This avoids rewriting URLs returned by responsive_breakpoints. The requested
    width and the srcset descriptor are generated from the same integer, so we
    never produce c_scale,w_1027 ... 50w nonsense. A tiny victory for civilization.
    """
    fmt = normalize_format(fmt)
    ext = output_extension(fmt)
    scheme = "https" if secure else "http"

    transforms = [f"q_{quality}", f"f_{fmt}"]
    transforms.extend(split_extra_transform(extra_transformation))
    transforms.append(f"c_scale,w_{int(width)}")
    transform_path = "/".join(",".join(transforms).split("/"))

    version_part = f"v{version}/" if version else ""
    # Keep slashes in public_id path segments but quote unsafe characters in each segment.
    quoted_public_id = "/".join(quote(part) for part in public_id.split("/"))

    return (
        f"{scheme}://res.cloudinary.com/{cloud_name}/image/upload/"
        f"{transform_path}/{version_part}{quoted_public_id}.{ext}"
    )


def srcset_for(
    *,
    cloud_name: str,
    public_id: str,
    version: Optional[int],
    fmt: str,
    widths: List[int],
    extra_transformation: Optional[str],
) -> str:
    entries = []
    for width in widths:
        url = build_cloudinary_url(
            cloud_name=cloud_name,
            public_id=public_id,
            version=version,
            fmt=fmt,
            width=width,
            extra_transformation=extra_transformation,
        )
        entries.append(f"{url} {width}w")
    return ",\n      ".join(entries)


def generate_picture_html(
    *,
    cloud_name: str,
    cloudinary_data: Dict[str, Any],
    widths_by_format: Dict[str, List[int]],
    formats: List[str],
    alt_text: str,
    picture_class: str,
    fallback_format: str,
) -> str:
    public_id = cloudinary_data["public_id"]
    version = cloudinary_data.get("version")
    original_width = int(cloudinary_data.get("width") or max(widths_by_format[formats[0]]))
    original_height = int(cloudinary_data.get("height") or original_width)

    lines = [f'<picture class="{picture_class}">']

    for art in ART_DIRECTION_CONFIGS:
        for fmt in formats:
            srcset = srcset_for(
                cloud_name=cloud_name,
                public_id=public_id,
                version=version,
                fmt=fmt,
                widths=widths_by_format[fmt],
                extra_transformation=art["extra_transformation"],
            )
            lines.append(
                f'  <source media="{art["media"]}"\n'
                f'          type="{mime_type(fmt)}"\n'
                f'          sizes="{art["sizes"]}"\n'
                f'          srcset="{srcset}">'
            )

    fallback_fmt = normalize_format(fallback_format)
    fallback_widths = widths_by_format.get(fallback_fmt) or widths_by_format.get("webp") or widths_by_format[formats[-1]]
    fallback_width = fallback_widths[-1]
    fallback_src = build_cloudinary_url(
        cloud_name=cloud_name,
        public_id=public_id,
        version=version,
        fmt=fallback_fmt,
        width=fallback_width,
        extra_transformation=None,
    )
    fallback_srcset = srcset_for(
        cloud_name=cloud_name,
        public_id=public_id,
        version=version,
        fmt=fallback_fmt,
        widths=fallback_widths,
        extra_transformation=None,
    )

    lines.append(
        f'  <img\n'
        f'    src="{fallback_src}"\n'
        f'    srcset="{fallback_srcset}"\n'
        f'    sizes="(max-width: {original_width}px) 100vw, {original_width}px"\n'
        f'    width="{original_width}"\n'
        f'    height="{original_height}"\n'
        f'    alt="{alt_text}"\n'
        f'    loading="lazy"\n'
        f'    decoding="async">'
    )
    lines.append("</picture>")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Upload image to Cloudinary and generate JXL/AVIF/WebP responsive <picture> HTML.")
    parser.add_argument("image_file", help="Path to the source image file")
    parser.add_argument("--output", help="Path to output HTML file. Default: output/<image-name>.html")
    parser.add_argument("--json-output", help="Path to output JSON metadata. Default: output/<image-name>.json")
    parser.add_argument("--alt", default=None, help="Alt text. Default: derived from filename")
    parser.add_argument("--picture-class", default="responsive-picture", help="Class for <picture>")
    parser.add_argument("--formats", nargs="+", default=DEFAULT_IMAGE_FORMATS, help="Formats for <source> tags. Default: jxl avif webp")
    parser.add_argument("--fallback-format", default=DEFAULT_FALLBACK_FORMAT, help="Fallback <img> format. Default: webp")
    parser.add_argument("--bytes-step", type=int, default=35000, help="Cloudinary responsive breakpoint bytes_step")
    parser.add_argument("--min-width", type=int, default=200, help="Minimum Cloudinary breakpoint width")
    parser.add_argument("--max-width", type=int, default=1400, help="Maximum Cloudinary breakpoint width")
    parser.add_argument("--max-images", type=int, default=4, help="Max selected widths per format")
    parser.add_argument("--no-decouple", action="store_true", help="Do not nudge identical width lists per format")
    parser.add_argument("--use-cache", action="store_true", help="Allow Cloudinary breakpoint cache")
    args = parser.parse_args()

    formats = [normalize_format(fmt) for fmt in args.formats]
    fallback_format = normalize_format(args.fallback_format)
    if fallback_format not in formats:
        formats.append(fallback_format)

    output_html = ensure_output_path(args.output, args.image_file, ".html")
    output_json = ensure_output_path(args.json_output, args.image_file, ".json")
    output_html.parent.mkdir(parents=True, exist_ok=True)
    output_json.parent.mkdir(parents=True, exist_ok=True)

    alt_text = args.alt if args.alt is not None else f"Responsive {Path(args.image_file).stem.replace('_', ' ')}"

    try:
        cloud_name = configure_cloudinary()
        print("🚀 Uploading to Cloudinary...")
        rb_config = {
            "create_derived": True,
            "bytes_step": args.bytes_step,
            "min_width": args.min_width,
            "max_width": args.max_width,
            "max_images": args.max_images,
            "use_cache": bool(args.use_cache),
            "transformation": {
                "quality": "auto",
                "crop": "scale",
            },
        }

        data = upload_to_cloudinary(args.image_file, rb_config)
        print(f"📁 Upload successful! Dimensions: {data.get('width')}×{data.get('height')}")

        raw_widths = extract_widths(data)
        if not raw_widths:
            raw_widths = [w for w in DEFAULT_WIDTHS_IF_EMPTY if w <= int(data.get("width") or max(DEFAULT_WIDTHS_IF_EMPTY))]
        selected_widths = select_strategic_widths(raw_widths, args.max_images)
        widths_by_format = decouple_widths_by_format(selected_widths, formats, enabled=not args.no_decouple)

        print("📏 Breakpoint width comparison:")
        for fmt in formats:
            print(f"   {fmt.upper()}: {widths_by_format[fmt]}")

        html = generate_picture_html(
            cloud_name=cloud_name,
            cloudinary_data=data,
            widths_by_format=widths_by_format,
            formats=formats,
            alt_text=alt_text,
            picture_class=args.picture_class,
            fallback_format=fallback_format,
        )

        metadata = {
            "asset_id": data.get("asset_id"),
            "public_id": data.get("public_id"),
            "version": data.get("version"),
            "width": data.get("width"),
            "height": data.get("height"),
            "format": data.get("format"),
            "secure_url": data.get("secure_url"),
            "raw_widths_from_cloudinary": raw_widths,
            "selected_widths": selected_widths,
            "widths_by_format": widths_by_format,
            "formats": formats,
            "fallback_format": fallback_format,
            "art_direction": ART_DIRECTION_CONFIGS,
            "html_output": str(output_html),
        }

        output_html.write_text(html, encoding="utf-8")
        output_json.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

        print("✅ Done! Saved:")
        print(f"   • {output_html}")
        print(f"   • {output_json}")
        return 0

    except Exception as exc:
        print(f"❌ Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
