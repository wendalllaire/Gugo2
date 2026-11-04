"""Offline QA for the original user-provided domino photograph.

Uses OpenCV HoughCircles to count physical pips, then uses known photo geometry
(the three tiles are upright, separated left-to-right, with a visible dark
horizontal divider) to group them into halves. This is a reproducible QA test
for this image, not the browser's generic domino-recognition implementation.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
IMAGE = ROOT / "public/samples/IMG_20261102_231406.jpg"
OUTPUT = ROOT / "public/samples/IMG_20261102_231406-annotated.jpg"
EXPECTED = [(11, 7), (11, 1), (6, 4)]


def main() -> None:
    source = cv2.imread(str(IMAGE), cv2.IMREAD_COLOR)
    if source is None:
        raise SystemExit(f"Unable to load {IMAGE}")
    frame = cv2.resize(source, (960, 1280), interpolation=cv2.INTER_AREA)
    gray = cv2.medianBlur(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), 5)
    detected = cv2.HoughCircles(
        gray,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=30,
        param1=100,
        param2=25,
        minRadius=12,
        maxRadius=24,
    )
    if detected is None:
        raise AssertionError("No pips found")
    circles = np.round(detected[0]).astype(int)
    if len(circles) != 40:
        raise AssertionError(f"Expected 40 pips, detected {len(circles)}")

    # The photograph shows three upright tiles. Cluster their pip centers by x.
    samples = circles[:, 0].astype(np.float32).reshape(-1, 1)
    cv2.setRNGSeed(7)
    _, labels, centers = cv2.kmeans(
        samples,
        3,
        None,
        (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 100, 0.1),
        20,
        cv2.KMEANS_PP_CENTERS,
    )
    ordered = np.argsort(centers[:, 0])
    actual: list[tuple[int, int]] = []
    divider_rows: list[int] = []
    annotated = frame.copy()

    for piece_index, cluster_id in enumerate(ordered):
        piece = circles[labels.ravel() == cluster_id]
        xs = piece[:, 0]
        ys = piece[:, 1]
        x0 = max(0, int(xs.min()) - 20)
        x1 = min(frame.shape[1], int(xs.max()) + 21)
        # The black divider stripe is the strongest continuous dark row around
        # the center line; search the image's central band, avoiding pip rows.
        y0, y1 = 450, 560
        row_darkness = (gray[y0:y1, x0:x1] < 70).sum(axis=1)
        divider_y = y0 + int(np.argmax(row_darkness))
        divider_rows.append(divider_y)
        upper = int((ys < divider_y).sum())
        lower = int((ys > divider_y).sum())
        actual.append((upper, lower))

        # Annotation: all Hough centers and tile-specific pip-divider lines.
        color = [(40, 200, 255), (50, 230, 100), (255, 170, 50)][piece_index]
        for x, y, radius in piece:
            cv2.circle(annotated, (int(x), int(y)), int(radius), color, 2)
        cv2.line(annotated, (x0, divider_y), (x1, divider_y), (30, 30, 255), 2)

    total = sum(a + b for a, b in actual)
    result = {
        "image": IMAGE.name,
        "detected_pips": len(circles),
        "dominoes": [{"top": a, "bottom": b} for a, b in actual],
        "score": total,
        "expected_dominoes": [{"top": a, "bottom": b} for a, b in EXPECTED],
        "expected_score": 40,
        "divider_rows_960x1280": divider_rows,
        "method": "OpenCV HoughCircles + x clustering + dark divider rows",
    }
    if actual != EXPECTED:
        raise AssertionError(json.dumps(result, indent=2))
    if total != 40:
        raise AssertionError(json.dumps(result, indent=2))
    cv2.imwrite(str(OUTPUT), annotated, [cv2.IMWRITE_JPEG_QUALITY, 92])
    print(json.dumps(result, indent=2))
    print(f"Annotated QA image: {OUTPUT}")


if __name__ == "__main__":
    main()
