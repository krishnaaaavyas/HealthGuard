"""Detect restricted-data files and path disclosures before they enter Git.

The checker is read-only. It never deletes, untracks, uploads, or modifies
files. Directory traversal refuses the designated external restricted roots
and never follows directory symlinks.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable


RESTRICTED_EXTENSIONS = {
    ".dta", ".sav", ".sas7bdat", ".xpt", ".parquet", ".feather",
    ".arrow", ".pkl", ".pickle", ".joblib", ".onnx",
}

RESTRICTED_DIRECTORY_NAMES = {
    "restricted-data",
    "private-data",
    "derived-secure",
    "model-output",
    "evaluation-output",
}

PARTICIPANT_EXPORT_EXTENSIONS = {
    ".csv", ".tsv", ".json", ".jsonl", ".ndjson",
}

PARTICIPANT_LEVEL_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"participant[-_ ]?level",
        r"participant[-_ ]?records?",
        r"cohort[-_ ]?rows?",
        r"merged[-_ ]?cohort",
        r"individual[-_ ]?records?",
    )
]

MODEL_PREDICTION_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"(?:^|[-_ ])predictions?(?:[-_ .]|$)",
        r"(?:^|[-_ ])model[-_ ]?scores?(?:[-_ .]|$)",
        r"(?:^|[-_ ])screening[-_ ]?probabilities(?:[-_ .]|$)",
        r"(?:^|[-_ ])inference[-_ ]?output(?:[-_ .]|$)",
    )
]

TEXT_EXTENSIONS = {
    "", ".py", ".pyi", ".md", ".txt", ".json", ".jsonl", ".ndjson",
    ".csv", ".tsv", ".yaml", ".yml", ".toml", ".ini", ".cfg",
    ".conf", ".env", ".js", ".jsx", ".ts", ".tsx", ".html", ".css",
    ".sh", ".ps1", ".bat", ".sql", ".xml",
}

MAX_TEXT_BYTES = 2_000_000

# Constructed in fragments so the checker does not flag its own source file.
EXTERNAL_RESTRICTED_ROOTS = (
    "C:" + "\\HealthGuard-Restricted-Data",
    "C:" + "\\LASI-Research",
)

ABSOLUTE_PATH_PATTERNS = [
    re.compile(
        re.escape(root).replace(r"\\", r"[\\/]") + r"(?:[\\/]|\b)",
        re.IGNORECASE,
    )
    for root in EXTERNAL_RESTRICTED_ROOTS
]


@dataclass(frozen=True)
class Violation:
    path: str
    reason: str


def _normalized_parts(path: str | Path) -> tuple[str, ...]:
    return tuple(
        part.lower()
        for part in str(path).replace("\\", "/").split("/")
        if part not in ("", ".")
    )


def filename_violations(path: str | Path) -> list[str]:
    """Return filename/path violations without opening the file."""
    candidate = Path(str(path))
    suffix = candidate.suffix.lower()
    parts = _normalized_parts(path)
    reasons = []

    if suffix in RESTRICTED_EXTENSIONS:
        reasons.append(f"restricted file extension: {suffix}")
    restricted_parts = RESTRICTED_DIRECTORY_NAMES.intersection(parts)
    if restricted_parts:
        reasons.append(
            "restricted directory: " + ", ".join(sorted(restricted_parts))
        )

    name = candidate.name
    if suffix in PARTICIPANT_EXPORT_EXTENSIONS and any(
        pattern.search(name) for pattern in PARTICIPANT_LEVEL_PATTERNS
    ):
        reasons.append("derived participant-level export filename")
    if suffix in PARTICIPANT_EXPORT_EXTENSIONS and any(
        pattern.search(name) for pattern in MODEL_PREDICTION_PATTERNS
    ):
        reasons.append("model prediction export filename")
    return reasons


def content_violations(text: str) -> list[str]:
    """Detect prohibited absolute restricted-root paths in text content."""
    return [
        "absolute path under a restricted external root"
        for pattern in ABSOLUTE_PATH_PATTERNS
        if pattern.search(text)
    ][:1]


def _windows_normalized(path: str | Path) -> str:
    return os.path.normcase(os.path.abspath(str(path))).rstrip("\\/")


def is_external_restricted_path(path: str | Path) -> bool:
    candidate = _windows_normalized(path)
    for root in EXTERNAL_RESTRICTED_ROOTS:
        normalized_root = _windows_normalized(root)
        if candidate == normalized_root or candidate.startswith(
            normalized_root + os.sep
        ):
            return True
    return False


def ensure_safe_directory(directory: str | Path) -> Path:
    """Reject external restricted roots before existence checks or traversal."""
    if is_external_restricted_path(directory):
        raise ValueError("Refusing to scan an external restricted-data folder")
    path = Path(directory)
    if not path.is_dir():
        raise FileNotFoundError(f"Scan directory not found: {path}")
    return path.resolve()


def _safe_text_from_file(path: Path) -> str | None:
    if path.is_symlink():
        # Never follow file symlinks during a content scan.
        return None
    if is_external_restricted_path(path):
        raise ValueError("Refusing to open a file under a restricted external root")
    if path.suffix.lower() not in TEXT_EXTENSIONS:
        return None
    if path.stat().st_size > MAX_TEXT_BYTES:
        return None
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return None


def inspect_entry(path: str, text: str | None = None) -> list[Violation]:
    violations = [
        Violation(path, reason) for reason in filename_violations(path)
    ]
    if text is not None:
        violations.extend(
            Violation(path, reason) for reason in content_violations(text)
        )
    return violations


def scan_directory(directory: str | Path) -> list[Violation]:
    root = ensure_safe_directory(directory)
    violations: list[Violation] = []
    for current, directory_names, file_names in os.walk(root, followlinks=False):
        current_path = Path(current)
        # Do not descend through symlinked directories or external roots.
        directory_names[:] = [
            name for name in directory_names
            if not (current_path / name).is_symlink()
            and not is_external_restricted_path(current_path / name)
        ]
        for name in file_names:
            path = current_path / name
            relative = path.relative_to(root).as_posix()
            reasons = filename_violations(relative)
            violations.extend(Violation(relative, reason) for reason in reasons)
            if reasons and path.suffix.lower() in RESTRICTED_EXTENSIONS:
                continue
            text = _safe_text_from_file(path)
            if text is not None:
                violations.extend(
                    Violation(relative, reason)
                    for reason in content_violations(text)
                )
    return violations


def _git_paths(repo: Path, staged: bool) -> list[str]:
    command = (
        ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]
        if staged
        else ["git", "ls-files", "-z"]
    )
    result = subprocess.run(
        command,
        cwd=repo,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return [
        item.decode("utf-8", errors="surrogateescape")
        for item in result.stdout.split(b"\0")
        if item
    ]


def _staged_text(repo: Path, path: str) -> str | None:
    if Path(path).suffix.lower() not in TEXT_EXTENSIONS:
        return None
    result = subprocess.run(
        ["git", "show", f":{path}"],
        cwd=repo,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if len(result.stdout) > MAX_TEXT_BYTES:
        return None
    try:
        return result.stdout.decode("utf-8")
    except UnicodeDecodeError:
        return None


def scan_git(repo: str | Path, staged: bool) -> list[Violation]:
    repo_path = Path(repo).resolve()
    violations: list[Violation] = []
    for relative in _git_paths(repo_path, staged=staged):
        reasons = filename_violations(relative)
        violations.extend(Violation(relative, reason) for reason in reasons)
        if reasons and Path(relative).suffix.lower() in RESTRICTED_EXTENSIONS:
            continue
        if staged:
            text = _staged_text(repo_path, relative)
        else:
            path = repo_path / relative
            text = _safe_text_from_file(path) if path.is_file() else None
        if text is not None:
            violations.extend(
                Violation(relative, reason)
                for reason in content_violations(text)
            )
    return violations


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fail on restricted data, exports, artifacts, or path disclosures."
    )
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--tracked", action="store_true", help="Scan tracked files")
    modes.add_argument("--staged", action="store_true", help="Scan staged files")
    modes.add_argument("--directory", type=Path, help="Scan a supplied directory")
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    return parser.parse_args(argv)


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.directory is not None:
            violations = scan_directory(args.directory)
        else:
            violations = scan_git(args.repo, staged=args.staged)
    except (FileNotFoundError, ValueError, subprocess.CalledProcessError) as exc:
        print(f"restricted-data check error: {exc}", file=sys.stderr)
        return 2

    if violations:
        print("Restricted-data protection check failed:", file=sys.stderr)
        for violation in sorted(set(violations), key=lambda item: (item.path, item.reason)):
            print(f"- {violation.path}: {violation.reason}", file=sys.stderr)
        return 1
    print("Restricted-data protection check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
