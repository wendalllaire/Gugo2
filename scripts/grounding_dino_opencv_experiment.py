#!/usr/bin/env python3
"""Apache-2.0 Grounding DINO + OpenCV experiment; isolated from production."""
import argparse
import json
import re
import sys
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image
from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor


MODEL_LICENSE = "Apache-2.0 (IDEA-Research/grounding-dino-tiny model card)"
LABELS = ["a domino tile", "a domino game piece", "a domino"]


def expected_pairs(path: Path):
    """Read gold labels only from labelled samples; never parse screenshot timestamps."""
    stem = path.stem.lower()
    if stem.startswith("todas peças v") or stem.startswith("todas pecas v"):
        return [(0, n) for n in range(1, 13)]
    if not stem[:1].isdigit():
        return []
    return sorted(
        tuple(sorted((int(a), int(b))))
        for a, b in re.findall(r"(?<!\d)(\d{1,2})-(\d{1,2})(?!\d)", stem)
    )


def count_half(gray):
    h, w = gray.shape[:2]
    if min(h, w) < 18:
        return 0
    inset_x, inset_y = max(1, int(w * .08)), max(1, int(h * .08))
    roi = gray[inset_y:max(inset_y + 1, h - inset_y), inset_x:max(inset_x + 1, w - inset_x)]
    if roi.size == 0:
        return 0
    enhanced = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(4, 4)).apply(roi)
    short = min(roi.shape[:2])
    circles = cv2.HoughCircles(
        cv2.medianBlur(enhanced, 5), cv2.HOUGH_GRADIENT,
        dp=1.15, minDist=max(5, round(short * .13)),
        param1=90, param2=28,
        minRadius=max(2, round(short * .018)),
        maxRadius=max(4, round(short * .14)),
    )
    if circles is None:
        return 0
    points = []
    min_dist2 = max(5, round(short * .13)) ** 2
    for x, y, _radius in circles[0]:
        if all((x - px) ** 2 + (y - py) ** 2 >= min_dist2 for px, py in points):
            points.append((float(x), float(y)))
    return len(points)


def nms_detections(boxes, scores, threshold=.55):
    if not boxes:
        return []
    xywh = []
    for x1, y1, x2, y2 in boxes:
        xywh.append([int(x1), int(y1), max(1, int(x2 - x1)), max(1, int(y2 - y1))])
    indices = cv2.dnn.NMSBoxes(xywh, [float(s) for s in scores], score_threshold=0.0, nms_threshold=threshold)
    if indices is None or len(indices) == 0:
        return []
    return [int(i) for i in np.asarray(indices).reshape(-1)]


def infer_image(path, model, processor, args):
    bgr = cv2.imread(str(path))
    if bgr is None:
        raise RuntimeError(f"Could not read image: {path}")
    height, width = bgr.shape[:2]
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)
    inputs = processor(images=pil, text=[LABELS], return_tensors="pt")
    inputs = {k: v.to(args.device) for k, v in inputs.items()}
    with torch.inference_mode():
        outputs = model(**inputs)
    result = processor.post_process_grounded_object_detection(
        outputs,
        inputs["input_ids"],
        threshold=args.box_threshold,
        text_threshold=args.text_threshold,
        target_sizes=[(height, width)],
    )[0]

    raw_boxes = result["boxes"].detach().cpu().numpy()
    raw_scores = result["scores"].detach().cpu().numpy()
    kept = nms_detections(raw_boxes.tolist(), raw_scores.tolist(), args.nms_threshold)

    predictions, detections = [], []
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    for idx in kept:
        x1, y1, x2, y2 = [int(round(x)) for x in raw_boxes[idx].tolist()]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(width, x2), min(height, y2)
        if x2 - x1 < 16 or y2 - y1 < 16:
            continue
        tile = gray[y1:y2, x1:x2]
        th, tw = tile.shape[:2]
        if tw >= th:
            midpoint = tw // 2
            side_a = count_half(tile[:, :midpoint])
            side_b = count_half(tile[:, midpoint:])
            orientation = "left-to-right"
        else:
            midpoint = th // 2
            side_a = count_half(tile[:midpoint, :])
            side_b = count_half(tile[midpoint:, :])
            orientation = "top-to-bottom"
        # Keep physical side order in the detail record; sort only for filename-label comparison.
        physical_sides = [side_a, side_b]
        canonical_pair = tuple(sorted(physical_sides))
        predictions.append(canonical_pair)
        label = result["labels"][idx] if "labels" in result else ""
        detections.append({
            "sides_physical": physical_sides,
            "side_order_assumption": orientation,
            "pair_for_gold_comparison": list(canonical_pair),
            "confidence": round(float(raw_scores[idx]), 4),
            "label": str(label),
            "box": [x1, y1, x2, y2],
        })
    return sorted(predictions), detections


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", default="public/samples")
    parser.add_argument("--output", default="artifacts/grounding-dino-opencv-results.json")
    parser.add_argument("--model", default="IDEA-Research/grounding-dino-tiny")
    parser.add_argument("--box-threshold", type=float, default=.22)
    parser.add_argument("--text-threshold", type=float, default=.18)
    parser.add_argument("--nms-threshold", type=float, default=.55)
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()

    sample_dir = Path(args.samples)
    # Numeric-label photos and the two named full-sequence references only.
    paths = sorted(
        p for p in sample_dir.glob("*.jpg")
        if p.name[:1].isdigit()
        or p.stem.lower().startswith(("todas peças v", "todas pecas v"))
    )
    paths = [p for p in paths if expected_pairs(p)]
    if not paths:
        print("No gold-labelled domino images found", file=sys.stderr)
        return 2

    print(f"Loading {args.model} on {args.device}; prompts={LABELS}")
    print(f"Gold-labelled image count: {len(paths)} (timestamped screenshots excluded)")
    processor = AutoProcessor.from_pretrained(args.model)
    model = AutoModelForZeroShotObjectDetection.from_pretrained(args.model).to(args.device)
    model.eval()

    records, exact = [], 0
    for path in paths:
        expected = expected_pairs(path)
        predicted, detections = infer_image(path, model, processor, args)
        ok = predicted == expected
        exact += int(ok)
        records.append({
            "file": path.name,
            "expected": [list(x) for x in expected],
            "predicted": [list(x) for x in predicted],
            "detections": detections,
            "exact_match": ok,
        })
        print(f"{'OK' if ok else 'MISS'} {path.name}: expected={expected} predicted={predicted} boxes={len(detections)}")

    rate = exact / max(1, len(records))
    report = {
        "model": args.model,
        "model_license": MODEL_LICENSE,
        "prompts": LABELS,
        "engine": "Grounding DINO tiny (Transformers) + OpenCV HoughCircles",
        "gold_filter": "numeric-labelled filenames and 'Todas peças v*.jpg'; timestamped screenshots excluded",
        "images": len(records),
        "exact_match_images": exact,
        "exact_match_rate": rate,
        "records": records,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"EXACT_MATCH={exact}/{len(records)} ({rate:.1%})")
    print(f"Report: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
