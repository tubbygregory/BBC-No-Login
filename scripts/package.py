#!/usr/bin/env python3
"""Build a reproducible, unpacked-extension ZIP using only Python's standard library."""

import argparse
from hashlib import sha256
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parent.parent


class Resources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in {"script", "img", "source", "audio", "video", "iframe"}:
            if attrs.get("src"):
                self.paths.append(attrs["src"])
        if tag == "link" and attrs.get("href"):
            self.paths.append(attrs["href"])
        if tag == "video" and attrs.get("poster"):
            self.paths.append(attrs["poster"])


def local_path(reference, parent=None):
    url = urlsplit(reference)
    if url.scheme or url.netloc:
        raise ValueError(f"Remote runtime resource is not allowed: {reference}")
    candidate = (ROOT if parent is None or url.path.startswith("/") else parent) / unquote(url.path).lstrip("/")
    candidate = candidate.resolve()
    if not candidate.is_relative_to(ROOT) or not candidate.is_file():
        raise ValueError(f"Missing or out-of-checkout runtime resource: {reference}")
    return candidate


def icon_paths(value):
    return value.values() if isinstance(value, dict) else [value]


def build(output_dir, tag=None):
    manifest = json.loads((ROOT / "manifest.json").read_text())
    version = manifest["version"]
    if not re.fullmatch(r"\d+(?:\.\d+){0,3}", version):
        raise ValueError("Manifest version must be a numeric Chromium extension version")
    if tag is not None and tag != f"v{version}":
        raise ValueError(f"Release tag must equal v{version}; got {tag!r}")

    references = ["manifest.json", "START-HERE.html", *icon_paths(manifest.get("icons", {}))]
    for action_name in ("action", "browser_action", "page_action"):
        action = manifest.get(action_name, {})
        if action.get("default_popup"):
            references.append(action["default_popup"])
        references.extend(icon_paths(action.get("default_icon", {})))
    for content_script in manifest.get("content_scripts", []):
        references.extend(content_script.get("js", []))
        references.extend(content_script.get("css", []))

    pending = [local_path(reference) for reference in references]
    files = set()
    while pending:
        path = pending.pop()
        if path in files:
            continue
        files.add(path)
        if path.suffix == ".html":
            parser = Resources()
            parser.feed(path.read_text())
            pending.extend(local_path(resource, path.parent) for resource in parser.paths)
        elif path.suffix == ".css":
            resources = re.findall(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)", path.read_text())
            pending.extend(local_path(resource, path.parent) for resource in resources)

    if (ROOT / "PRIVACY.md").is_file():
        files.add(ROOT / "PRIVACY.md")

    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / f"BBC-No-Login-{version}.zip"
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for path in sorted(files):
            name = path.relative_to(ROOT).as_posix()
            info = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes())

    with ZipFile(output) as archive:
        if archive.testzip() is not None or "manifest.json" not in archive.namelist():
            raise ValueError("Extension archive validation failed")
    checksum = output_dir / "SHA256SUMS.txt"
    checksum.write_text(f"{sha256(output.read_bytes()).hexdigest()}  {output.name}\n")
    print(f"Created {output.relative_to(ROOT) if output.is_relative_to(ROOT) else output}: {len(files)} files, {output.stat().st_size:,} bytes")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "dist")
    parser.add_argument("--tag", help="Validate a release tag, e.g. v1.0.0, against manifest.json")
    args = parser.parse_args()
    try:
        build(args.output_dir.resolve(), args.tag)
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f"Packaging failed: {error}\n")
