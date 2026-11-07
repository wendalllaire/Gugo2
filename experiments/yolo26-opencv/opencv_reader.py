"""OpenCV post-processing for YOLOE-26 domino instance masks.

Independent from Ultralytics so geometry and pip counting can be tested with
synthetic masks without downloading model weights.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import cv2
import numpy as np


@dataclass
class DominoRead:
    side_a: int
    side_b: int
    confidence: float
    bbox: tuple[int, int, int, int]
    corners: np.ndarray
    pips_a: list[tuple[float, float]]
    pips_b: list[tuple[float, float]]


def _ordered_corners(points: np.ndarray) -> np.ndarray:
    """Order a rectangle as TL, TR, BR, BL for perspective warping."""
    pts = np.asarray(points, dtype=np.float32).reshape(4, 2)
    sums = pts.sum(axis=1)
    diffs = np.diff(pts, axis=1).reshape(-1)
    return np.array([
        pts[np.argmin(sums)], pts[np.argmin(diffs)],
        pts[np.argmax(sums)], pts[np.argmax(diffs)],
    ], dtype=np.float32)


def _rectify(image: np.ndarray, corners: np.ndarray,
             out_w: int = 640, out_h: int = 320) -> np.ndarray:
    """Rectify a tile and put its long axis left-to-right.

    A remains the original left/top half; B remains right/bottom. For a
    portrait tile, the mapping makes its top half the canonical left half.
    """
    tl, tr, br, bl = _ordered_corners(corners)
    width = (np.linalg.norm(tr - tl) + np.linalg.norm(br - bl)) / 2
    height = (np.linalg.norm(bl - tl) + np.linalg.norm(br - tr)) / 2
    src = (np.array([tl, bl, br, tr], np.float32)
           if height > width else np.array([tl, tr, br, bl], np.float32))
    dst = np.array([[0, 0], [out_w - 1, 0],
                    [out_w - 1, out_h - 1], [0, out_h - 1]], np.float32)
    matrix = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(image, matrix, (out_w, out_h),
                               flags=cv2.INTER_CUBIC,
                               borderMode=cv2.BORDER_REPLICATE)


def _merge_centres(candidates: Iterable[tuple[float, float]],
                   min_dist: float = 24.0) -> list[tuple[float, float]]:
    selected: list[tuple[float, float]] = []
    for x, y in candidates:
        x, y = float(x), float(y)
        if not any((x - px) ** 2 + (y - py) ** 2 < min_dist ** 2
                   for px, py in selected):
            selected.append((x, y))
    return selected


def _component_centres(half: np.ndarray) -> list[tuple[float, float]]:
    gray = cv2.cvtColor(half, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(half, cv2.COLOR_BGR2HSV)
    # Saturated pips (orange, yellow, red, blue, green) plus neutral dark pips.
    chroma = cv2.inRange(hsv, np.array([0, 58, 58], np.uint8),
                         np.array([179, 255, 255], np.uint8))
    dark = cv2.inRange(gray, 0, 118)
    mask = cv2.bitwise_or(chroma, dark)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = []
    half_area = float(half.shape[0] * half.shape[1])
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < max(60.0, half_area * 0.001) or area > half_area * 0.075:
            continue
        x, y, w, h = cv2.boundingRect(contour)
        aspect = w / max(1, h)
        if aspect < 0.48 or aspect > 2.05:
            continue
        perimeter = cv2.arcLength(contour, True)
        circularity = 4.0 * np.pi * area / max(1.0, perimeter * perimeter)
        if circularity < 0.13:
            continue
        moments = cv2.moments(contour)
        if abs(moments["m00"]) > 1e-6:
            candidates.append((moments["m10"] / moments["m00"],
                               moments["m01"] / moments["m00"]))
    return candidates


def _hough_centres(half: np.ndarray) -> list[tuple[float, float]]:
    gray = cv2.medianBlur(cv2.cvtColor(half, cv2.COLOR_BGR2GRAY), 5)
    circles = cv2.HoughCircles(
        gray, cv2.HOUGH_GRADIENT, dp=1.2, minDist=28,
        param1=90, param2=22, minRadius=9, maxRadius=38,
    )
    if circles is None:
        return []
    return [(float(x), float(y)) for x, y, _ in np.round(circles[0]).astype(int)]


def count_half_pips(half: np.ndarray) -> tuple[int, list[tuple[float, float]]]:
    if half.size == 0:
        return 0, []
    centres = _merge_centres(_component_centres(half) + _hough_centres(half), 25.0)
    return min(12, len(centres)), centres[:12]


def read_rectified_tile(warped: np.ndarray, confidence: float = 1.0,
                        bbox: tuple[int, int, int, int] = (0, 0, 0, 0),
                        corners: np.ndarray | None = None) -> DominoRead:
    """Count pips on the two physical halves of a rectified landscape domino."""
    h, w = warped.shape[:2]
    gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    y0, y1 = int(h * 0.16), int(h * 0.84)
    x0, x1 = int(w * 0.42), int(w * 0.58)
    divider_x = x0 + int(np.argmin(gray[y0:y1, x0:x1].mean(axis=0)))
    guard = max(4, int(w * 0.012))
    left = warped[:, :max(1, divider_x - guard)]
    right = warped[:, min(w - 1, divider_x + guard):]
    side_a, pips_a = count_half_pips(left)
    side_b, pips_b = count_half_pips(right)
    return DominoRead(
        side_a, side_b, float(confidence), bbox,
        corners if corners is not None else np.zeros((4, 2), np.float32),
        pips_a, pips_b,
    )


def read_from_mask(image: np.ndarray, mask: np.ndarray,
                   confidence: float = 1.0) -> DominoRead | None:
    """Convert one YOLO instance mask into a geometrically validated domino."""
    if image is None or mask is None or image.ndim != 3 or mask.ndim != 2:
        return None
    if mask.shape[:2] != image.shape[:2]:
        mask = cv2.resize(mask.astype(np.uint8), (image.shape[1], image.shape[0]),
                          interpolation=cv2.INTER_NEAREST)
    binary = (mask > 0).astype(np.uint8) * 255
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    contour = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(contour)
    if area < image.shape[0] * image.shape[1] * 0.001:
        return None
    rect = cv2.minAreaRect(contour)
    _, (rw, rh), _ = rect
    if min(rw, rh) < 10:
        return None
    aspect = max(rw, rh) / max(1.0, min(rw, rh))
    if aspect < 1.35 or aspect > 3.2:
        return None
    corners = cv2.boxPoints(rect)
    warped = _rectify(image, corners)
    x, y, w, h = cv2.boundingRect(contour)
    return read_rectified_tile(warped, confidence, (x, y, x + w, y + h), corners)


def draw_read(image: np.ndarray, reads: list[DominoRead]) -> np.ndarray:
    out = image.copy()
    for tile in reads:
        pts = np.round(tile.corners).astype(np.int32)
        cv2.polylines(out, [pts], True, (0, 230, 150), 3)
        x0, y0, _, _ = tile.bbox
        cv2.putText(out, f"[{tile.side_a}|{tile.side_b}] {tile.confidence:.2f}",
                    (x0, max(24, y0 - 8)), cv2.FONT_HERSHEY_SIMPLEX,
                    0.7, (0, 210, 255), 2, cv2.LINE_AA)
    return out
