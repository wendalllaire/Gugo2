#!/usr/bin/env python3
"""Experimental YOLOE-26 + OpenCV domino benchmark; isolated from production."""
import argparse, json, re, sys
from pathlib import Path
import cv2
import numpy as np
from ultralytics import YOLOE

def expected_pairs(name):
    return sorted(tuple(sorted((int(a), int(b)))) for a,b in re.findall(r"(?<!\d)(\d{1,2})-(\d{1,2})(?!\d)", name))

def count_half(gray, mask=None):
    h,w=gray.shape[:2]
    if min(h,w)<24: return 0
    x0,x1=int(w*.08),max(int(w*.08)+1,int(w*.92))
    y0,y1=int(h*.08),max(int(h*.08)+1,int(h*.92))
    roi=gray[y0:y1,x0:x1]
    if mask is not None and cv2.countNonZero(mask[y0:y1,x0:x1])>0:
        roi=cv2.bitwise_and(roi,roi,mask=mask[y0:y1,x0:x1])
    enhanced=cv2.createCLAHE(clipLimit=2.0,tileGridSize=(4,4)).apply(roi)
    circles=cv2.HoughCircles(cv2.medianBlur(enhanced,5),cv2.HOUGH_GRADIENT,
        dp=1.2,minDist=max(7,round(min(h,w)*.055)),param1=100,param2=34,
        minRadius=max(3,round(min(h,w)*.018)),maxRadius=max(5,round(min(h,w)*.105)))
    if circles is None: return 0
    points=[]
    for x,y,r in circles[0]:
        px,py=int(round(x+x0)),int(round(y+y0))
        if mask is not None and (py<0 or px<0 or py>=mask.shape[0] or px>=mask.shape[1] or mask[py,px]==0): continue
        if all((x-a)**2+(y-b)**2 >= (max(7,round(min(h,w)*.055)*.7))**2 for a,b in points):
            points.append((float(x),float(y)))
    return len(points)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--samples",default="public/samples")
    ap.add_argument("--output",default="artifacts/yolo26-opencv-results.json")
    ap.add_argument("--model",default="yoloe-26n-seg.pt")
    ap.add_argument("--confidence",type=float,default=.12)
    ap.add_argument("--image-size",type=int,default=960)
    args=ap.parse_args()
    paths=sorted(p for p in Path(args.samples).glob("*.jpg") if expected_pairs(p.name))
    if not paths: print("No filename-labelled samples",file=sys.stderr); return 2
    print(f"Loading {args.model}; open-vocabulary prompt: domino tile")
    model=YOLOE(args.model)
    model.set_classes(["domino tile"])
    records=[]; exact=0
    for path in paths:
        image=cv2.imread(str(path))
        if image is None: continue
        gray=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY)
        result=model.predict(image,imgsz=args.image_size,conf=args.confidence,iou=.45,max_det=100,verbose=False)[0]
        predicted=[]; details=[]
        if result.boxes is not None and len(result.boxes):
            boxes=result.boxes.xyxy.cpu().numpy().astype(int)
            scores=result.boxes.conf.cpu().numpy().tolist()
            polygons=result.masks.xy if result.masks is not None else [None]*len(boxes)
            for i,raw in enumerate(boxes):
                x1,y1,x2,y2=map(int,raw[:4]); x1=max(0,x1); y1=max(0,y1); x2=min(gray.shape[1],x2); y2=min(gray.shape[0],y2)
                if x2<=x1 or y2<=y1: continue
                tile=gray[y1:y2,x1:x2]; mask=None
                poly=polygons[i] if i<len(polygons) else None
                if poly is not None and len(poly)>=3:
                    mask=np.zeros(tile.shape,np.uint8); shifted=np.asarray(poly,np.int32).copy()
                    shifted[:,0]-=x1; shifted[:,1]-=y1
                    cv2.fillPoly(mask,[shifted],255)
                h,w=tile.shape
                if w>=h:
                    mid=w//2; a=count_half(tile[:,:mid],mask[:,:mid] if mask is not None else None); b=count_half(tile[:,mid:],mask[:,mid:] if mask is not None else None)
                else:
                    mid=h//2; a=count_half(tile[:mid,:],mask[:mid,:] if mask is not None else None); b=count_half(tile[mid:,:],mask[mid:,:] if mask is not None else None)
                pair=tuple(sorted((a,b))); predicted.append(pair)
                details.append({"sides_physical":[a,b],"pair":list(pair),"confidence":round(float(scores[i]),4),"box":[x1,y1,x2,y2]})
        expected=expected_pairs(path.name); got=sorted(predicted); ok=got==expected; exact+=int(ok)
        records.append({"file":path.name,"expected":[list(x) for x in expected],"predicted":[list(x) for x in got],"detections":details,"exact_match":ok})
        print(f"{'OK' if ok else 'MISS'} {path.name}: expected={expected} predicted={got}")
    report={"model":args.model,"prompt":"domino tile","engine":"YOLOE-26 segmentation + OpenCV HoughCircles","images":len(records),"exact_match_images":exact,"exact_match_rate":exact/max(1,len(records)),"records":records}
    out=Path(args.output); out.parent.mkdir(parents=True,exist_ok=True); out.write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(f"EXACT_MATCH={exact}/{len(records)} ({report['exact_match_rate']:.1%})"); print(f"Report: {out}")
    return 0

if __name__=="__main__": raise SystemExit(main())
