# YOLOE-26 + OpenCV: isolated domino-reader experiment

This folder is an **evaluation-only prototype**. It does not replace the production TypeScript reader and is not included in the Android APK.

## Pipeline

1. Ultralytics **YOLOE-26s segmentation** receives one visual example: the complete white domino in `public/samples/0-10.jpg` (box `[40, 155, 515, 400]`, XYXY pixels).
2. The model proposes one instance mask per visually similar domino.
3. OpenCV validates the mask geometry, rectifies the tile with a perspective transform, finds the central divider, then counts each physical half using connected components plus Hough circles.
4. Side A remains left/top and side B right/bottom. The pipeline never sorts the two values.

Visual prompting is chosen because the current photographs provide value labels in filenames but do not provide a reliable set of hand-verified tile bounding boxes for supervised YOLO training. It also avoids the large text encoder download required by YOLOE text prompts.

## Run

```bash
python -m pip install -r experiments/yolo26-opencv/requirements.txt
PYTHONPATH=experiments/yolo26-opencv python -m unittest discover -s experiments/yolo26-opencv/tests -v
python experiments/yolo26-opencv/benchmark_yoloe26.py \
  --samples public/samples \
  --reference-image public/samples/0-10.jpg \
  --reference-box 40 155 515 400 \
  --include-transforms \
  --output artifacts/yolo26-opencv
```

The first run downloads `yoloe-26s-seg.pt`. The workflow uploads `results.json` and annotated originals even when the benchmark fails.

## Evaluation contract

The benchmark compares:
- every filename-labelled photo against its expected unordered domino-pair multiset;
- the original 0-N photos against physical A=0 / B=N order;
- the original reference photo against its documented 3-tile gold standard and physical order;
- the same 90/180/270-degree and brightness/contrast/saturation transforms used by the existing TypeScript regression suite;
- both full-sequence photos against the exact 0-1 through 0-12 set.

A workflow failure means the detector did **not** pass the gold standard. It is not acceptable to reduce thresholds or remove samples to make the run green.

## Licensing and deployment gate

Ultralytics software and YOLOE-26 weights are supplied under AGPL-3.0 by default (or a separate Enterprise licence). This is why the prototype is isolated from the app and APK. Do not package this model in a distributed app or make a production integration until the project's licensing position has been reviewed. The model weights are downloaded by CI and are not committed to this repository.

The current prototype runs model inference through Ultralytics/PyTorch and uses OpenCV for the image-processing stage. ONNX/OpenCV-DNN or ONNX Runtime Android export is a later deployment step, and should only be attempted after this benchmark shows a real accuracy gain.
