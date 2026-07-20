"""Audit LASI hypertension target evidence without constructing a cohort."""

from __future__ import annotations

import argparse
from pathlib import Path

try:
    from training.lasi_hypertension_audit_utils import execute_audit
except ModuleNotFoundError:  # Direct script execution from repository root.
    from lasi_hypertension_audit_utils import execute_audit


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", required=True, type=Path)
    parser.add_argument("--codebook-root", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--min-cell-count", type=int, default=10)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    execute_audit(
        args.data_root, args.codebook_root, args.output_dir,
        args.min_cell_count,
    )
    print("LASI hypertension aggregate target audit complete; no target constructed.")


if __name__ == "__main__":
    main()
