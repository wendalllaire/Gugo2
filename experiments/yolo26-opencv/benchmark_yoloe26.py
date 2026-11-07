from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLOE

from opencv_reader import draw_read, read_from_mask

SEQUENCE_EXPECTED = [(0, n) for n in range(1, 13)]
REFERENCE_EXPECTED = [(1, 11), (4, 6), (7, 11)]
REFERENCE_EXPECTED_PHYSICAL = [(11, 7), (11, 1), (6, 4)]
TRANSFORMS = [
    (1.00, 1.00, 1.00, "neutral"),
    (0.78, 0.85, 0.45, "dim-low-contrast-low-saturation"),
    (0.92, 1.25, 1.50, "slightly-dim-high-contrast-high-saturation"),
    (1.12, 0.72, 0.65, "bright-low-contrast-muted-colors"),
]
SEQUENCE_TRANSFORMS = [
    (1.00, 1.00, 1.00, "neutral"),
    (0.92, 1.12, 1.15, "slight-dim-contrast-saturation"),
    (1.08, 0.90, 0.85, "slight-bright-soft-muted"),
]


def pair_key(pair: tuple[int, int]) -> tuple[int, int]:
    return tuple(sorted(pair))


def expected_from_name(name: str) -> list[tuple[int, int]]:
    return [(int(a), int(b)) for a, b in
            re.findall(r"(?<!\d)(\d{1,2})-(\d{1,2})(?!\d)", name)]


def rotate_image(image: np.ndarray, degrees: int) -> np.ndarray:
    if degrees == 0:
        return image
    if degrees == 90:
        return cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
    if degrees == 180:
        return cv2.rotate(image, cv2.ROTATE_180)
    return cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)


def adjust_color(image: np.ndarray, brightness: float,
                 contrast: float, saturation: float) -> np.ndarray:
    src = image.astype(np.float32)
    luma = 0.114 * src[:, :, 0] + 0.587 * src[:, :, 1] + 0.299 * src[:, :, 2]
    saturated = luma[:, :, None] + (src - luma[:, :, None]) * saturation
    adjusted = ((saturated - 128.0) * contrast + 128.0) * brightness
    return np.clip(np.rint(adjusted), 0, 255).astype(np.uint8)


def resize_like_app(image: np.ndarray, max_side: int = 1280) -> np.ndarray:
    h, w = image.shape[:2]
    scale = min(1.0, max_side / max(w, h))
    if scale >= 1.0:
        return image
    return cv2.resize(image, (max(1, round(w * scale)), max(1, round(h * scale))),
                      interpolation=cv2.INTER_AREA)


def get_predictions(model: YOLOE, image: np.ndarray, reference_path: Path,
                    reference_boxes: list[list[float]], prompt_mode: str,
                    conf: float, imgsz: int):
    kwargs = {
        "source": image,
        "conf": conf,
        "imgsz": imgsz,
        "retina_masks": True,
        "verbose": False,
    }
    if prompt_mode == "text-domino":
        # Text prompts are configured once before the benchmark loop.
        pass
    else:
        # All visual exemplars share class 0: "domino tile".
        kwargs["refer_image"] = str(reference_path)
        kwargs["visual_prompts"] = {
            "bboxes": np.asarray(reference_boxes, dtype=np.float32),
            "cls": np.zeros(len(reference_boxes), dtype=np.int64),
        }
    result = model.predict(**kwargs)[0]
    raw_predictions = []
    if result.boxes is not None:
        raw_boxes = result.boxes.xyxy.detach().cpu().numpy()
        raw_scores = result.boxes.conf.detach().cpu().numpy().tolist()
        raw_classes = result.boxes.cls.detach().cpu().numpy().astype(int).tolist()
        names = result.names
        for box, score, class_id in zip(raw_boxes, raw_scores, raw_classes):
            raw_predictions.append({
                "class_id": class_id,
                "class_name": names.get(class_id, str(class_id)) if isinstance(names, dict) else str(class_id),
                "confidence": round(float(score), 4),
                "bbox": [round(float(v), 1) for v in box],
            })
    if result.masks is None or result.boxes is None:
        return [], raw_predictions

    masks = result.masks.data.detach().cpu().numpy()
    scores = result.boxes.conf.detach().cpu().numpy().tolist()
    boxes = result.boxes.xyxy.detach().cpu().numpy()
    candidates = []
    for mask, score, box in zip(masks, scores, boxes):
        mask_full = cv2.resize(mask.astype(np.float32),
                               (image.shape[1], image.shape[0]),
                               interpolation=cv2.INTER_LINEAR)
        read = read_from_mask(image, (mask_full > 0.5).astype(np.uint8), float(score))
        # A visually valid blank tile is a real [0|0] domino; do not discard it.
        if read is not None:
            candidates.append((read, np.asarray(box, dtype=np.float32)))

    # Deduplicate overlapping YOLO masks without fusing adjacent dominoes.
    candidates.sort(key=lambda item: item[0].confidence, reverse=True)
    keep = []
    for read, box in candidates:
        duplicate = False
        for _, other in keep:
            ix1, iy1 = max(box[0], other[0]), max(box[1], other[1])
            ix2, iy2 = min(box[2], other[2]), min(box[3], other[3])
            inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
            union = max(1, (box[2] - box[0]) * (box[3] - box[1]) +
                        (other[2] - other[0]) * (other[3] - other[1]) - inter)
            if inter / union >= 0.55:
                duplicate = True
                break
        if not duplicate:
            keep.append((read, box))

    reads = [item[0] for item in keep]
    reads.sort(key=lambda r: ((r.bbox[0] + r.bbox[2]) / 2,
                              (r.bbox[1] + r.bbox[3]) / 2))
    return reads, raw_predictions


def evaluate_pair_list(expected: list[tuple[int, int]],
                       actual: list[tuple[int, int]]) -> dict:
    exp = Counter(pair_key(p) for p in expected)
    got = Counter(pair_key(p) for p in actual)
    return {
        "expected": [list(p) for p in expected],
        "actual_physical_A_B": [list(p) for p in actual],
        "missing": [list(p) for p, n in (exp - got).items() for _ in range(n)],
        "extra": [list(p) for p, n in (got - exp).items() for _ in range(n)],
        "pass": exp == got,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", type=Path, default=Path("public/samples"))
    parser.add_argument("--reference-image", type=Path,
                        default=Path("public/samples/IMG_20261102_231406.jpg"))
    parser.add_argument("--reference-box", type=float, nargs=4,
                        default=[40, 155, 515, 400], metavar=("X1", "Y1", "X2", "Y2"))
    parser.add_argument("--prompt-mode", choices=["visual-single", "visual-multi", "text-domino"],
                        default="visual-multi")
    parser.add_argument("--output", type=Path, default=Path("artifacts/yolo26-opencv"))
    parser.add_argument("--model", default="yoloe-26s-seg.pt")
    parser.add_argument("--conf", type=float, default=0.12)
    parser.add_argument("--imgsz", type=int, default=960)
    parser.add_argument("--include-transforms", action="store_true")
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    if args.prompt_mode != "text-domino" and not args.reference_image.is_file():
        raise SystemExit(f"Visual-prompt reference not found: {args.reference_image}")

    if args.prompt_mode == "visual-multi":
        # Reference photograph is 3072x4096. Three independent examples show
        # vertical tiles, neutral/black pips, a blue pip and yellow/grey pips.
        reference_boxes = [
            [600, 1320, 1550, 3100],
            [1470, 1320, 2460, 3180],
            [2440, 1390, 3530, 3250],
        ]
    elif args.prompt_mode == "visual-single":
        reference_boxes = [args.reference_box]
    else:
        reference_boxes = []

    model = YOLOE(args.model)
    if args.prompt_mode == "text-domino":
        model.set_classes(["domino tile"])
    paths = []
    for path in sorted(args.samples.glob("*.jpg")):
        name = path.name
        # Match the exact labelled-sample naming convention. In particular,
        # exclude Stagnation Lab screenshots and annotated reference images:
        # their timestamps contain number pairs that look like domino labels.
        labelled_sample = re.match(r"^\d{1,2}-\d{1,2}(?:\s|\.jpe?g$)", name, re.IGNORECASE)
        is_reference = name == "IMG_20261102_231406.jpg"
        is_sequence = re.fullmatch(r"Todas peças v[12]\.jpg", name, re.IGNORECASE)
        if labelled_sample or is_reference or is_sequence:
            paths.append(path)

    records = []

    def evaluate_one(path: Path, image: np.ndarray,
                     expected: list[tuple[int, int]], transform: str,
                     strict_order: bool = False,
                     expected_physical: list[tuple[int, int]] | None = None,
                     annotate: bool = False) -> None:
        reads, raw_predictions = get_predictions(
            model, image, args.reference_image,
            reference_boxes, args.prompt_mode, args.conf, args.imgsz
        )
        actual = [(r.side_a, r.side_b) for r in reads]
        result = evaluate_pair_list(expected, actual)
        if strict_order:
            result["physical_order_pass"] = actual == (
                expected_physical if expected_physical is not None else expected
            )
        record = {
            "image": path.name,
            "transform": transform,
            "raw_yolo_detections": len(raw_predictions),
            "raw_yolo": raw_predictions,
            "tiles_detected": len(reads),
            "pips_total": sum(r.side_a + r.side_b for r in reads),
            "tiles": [
                {"side_a": r.side_a, "side_b": r.side_b,
                 "confidence": round(r.confidence, 4), "bbox": list(r.bbox)}
                for r in reads
            ],
            **result,
        }
        records.append(record)
        print(json.dumps(record, ensure_ascii=False))
        if annotate:
            cv2.imwrite(str(args.output / f"{path.stem}-detected.jpg"),
                        draw_read(image, reads), [cv2.IMWRITE_JPEG_QUALITY, 90])

    for path in paths:
        image = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if image is None:
            continue
        image = resize_like_app(image)
        expected = expected_from_name(path.name)
        is_reference = path.name == "IMG_20261102_231406.jpg"
        is_sequence = path.name.startswith("Todas peças v")
        if is_sequence:
            expected = SEQUENCE_EXPECTED
        if is_reference:
            expected = REFERENCE_EXPECTED

        strict_order = is_reference or (
            len(expected) == 1 and expected[0][0] == 0
        )
        physical_reference = REFERENCE_EXPECTED_PHYSICAL if is_reference else None
        evaluate_one(path, image, expected, "original", strict_order,
                     physical_reference, annotate=True)

        if not args.include_transforms:
            continue
        configs = SEQUENCE_TRANSFORMS if is_sequence else TRANSFORMS
        for degrees in (0, 90, 180, 270):
            rotated = rotate_image(image, degrees)
            for brightness, contrast, saturation, label in configs:
                transformed = adjust_color(rotated, brightness, contrast, saturation)
                evaluate_one(path, transformed, expected,
                             f"rotation={degrees};{label}")

    baseline_cases = len(paths)
    transformed_cases = sum(
        12 if path.name.startswith("Todas peças v") else 16
        for path in paths
    ) if args.include_transforms else 0
    passed = sum(bool(r["pass"]) and r.get("physical_order_pass", True)
                 for r in records)
    summary = {
        "model": args.model,
        "engine": "YOLOE-26 instance segmentation + OpenCV rectification, components and Hough circles",
        "prompt": {"mode": args.prompt_mode, "reference": args.reference_image.name,
                   "reference_boxes_xyxy": reference_boxes,
                   "text_classes": ["domino tile"] if args.prompt_mode == "text-domino" else []},
        "images_tested": len(records),
        "images_passed": passed,
        "images_failed": len(records) - passed,
        "original_cases": baseline_cases,
        "transformed_cases_expected": transformed_cases,
        "records": records,
    }
    (args.output / "results.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps({k: summary[k] for k in (
        "model", "images_tested", "images_passed", "images_failed",
        "original_cases", "transformed_cases_expected"
    )}, indent=2))
    return 0 if passed == len(records) else 1


if __name__ == "__main__":
    raise SystemExit(main())
