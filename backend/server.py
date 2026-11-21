"""
Frame Grab — Apple M5 GPU Enhancement Server
FastAPI backend powered by PyTorch (MPS) for CodeFormer, SwinIR, and Studio Stack.
"""
import io
import time
import uuid
from typing import Optional
import cv2
import numpy as np
import torch
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel

from backend.download_manager import get_installed_models_info, clear_all_models, download_model, is_model_installed
from backend.models.pipeline import StudioEnhancementPipeline
from backend.models.deblur import make_motion_psf, estimate_blur_parameters, richardson_lucy_deblur, wiener_deblur

app = FastAPI(title="Frame Grab AI Enhancement Engine", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Session Frame Cache (holds recent frames in memory so slider tweaks don't re-upload full frames)
FRAME_CACHE: dict[str, dict] = {}
MAX_CACHED_FRAMES = 8

async def get_or_cache_frame(frame_id: Optional[str], file: Optional[UploadFile]) -> tuple[np.ndarray, str]:
    """Retrieves an existing cached frame or decodes and caches an uploaded frame."""
    global FRAME_CACHE
    if frame_id and frame_id in FRAME_CACHE:
        entry = FRAME_CACHE[frame_id]
        entry["timestamp"] = time.time()
        return entry["img_bgr"], frame_id

    if file is None:
        raise HTTPException(status_code=400, detail="Missing frame: neither valid frame_id nor file provided.")

    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise HTTPException(status_code=400, detail="Invalid image file uploaded.")

    # Evict oldest if cache limit reached
    if len(FRAME_CACHE) >= MAX_CACHED_FRAMES:
        oldest_id = min(FRAME_CACHE.keys(), key=lambda k: FRAME_CACHE[k]["timestamp"])
        del FRAME_CACHE[oldest_id]

    new_id = uuid.uuid4().hex[:12]
    FRAME_CACHE[new_id] = {
        "img_bgr": img_bgr,
        "timestamp": time.time(),
    }
    return img_bgr, new_id

# Global pipeline instance
pipeline = None

def get_pipeline():
    global pipeline
    if pipeline is None:
        pipeline = StudioEnhancementPipeline()
    return pipeline

@app.get("/api/health")
def health_check():
    mps_available = torch.backends.mps.is_available()
    device_name = "Apple Silicon Metal (MPS)" if mps_available else "CPU"
    return {
        "status": "online",
        "engine": "Frame Grab PyTorch Backend",
        "device": device_name,
        "chip": "Apple M5",
        "unified_memory_gb": 24,
        "models_storage": str(get_installed_models_info()["storage_folder"]),
        "total_models_size_mb": get_installed_models_info()["total_storage_mb"],
    }

@app.get("/api/models")
def list_models():
    """Lists all models and their installation state in backend/models_storage/"""
    return get_installed_models_info()

@app.delete("/api/models/clear")
def clear_models_storage():
    """Wipes all downloaded models in backend/models_storage/ to immediately free disk space"""
    res = clear_all_models()
    return {
        "status": "success",
        "message": f"Successfully freed {res['freed_mb']} MB of disk space.",
        "freed_mb": res["freed_mb"],
        "deleted_files": res["deleted_files"],
    }

class DownloadRequest(BaseModel):
    model_key: str

@app.post("/api/models/download")
def trigger_download(req: DownloadRequest):
    try:
        path = download_model(req.model_key)
        return {"status": "success", "model_key": req.model_key, "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/enhance")
async def enhance_image(
    file: UploadFile = File(...),
    model: str = Form("codeformer"),     # 'codeformer', 'studio_stack', 'fast_stack', 'swinir'
    fidelity: float = Form(0.6),         # 0.0 to 1.0 (for CodeFormer)
    scale: int = Form(2),                # 1, 2, or 4
    stack_mode: str = Form("fast"),      # 'fast' (~0.8s) or 'deep' (~2-3m SwinIR)
):
    start_time = time.time()
    pipe = get_pipeline()

    # Read uploaded bytes into OpenCV image
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img_bgr is None:
        raise HTTPException(status_code=400, detail="Invalid image file uploaded.")

    in_h, in_w = img_bgr.shape[:2]
    num_faces = 0

    try:
        actual_model_used = model
        if model == "codeformer":
            result_bgr, num_faces = pipe.process_codeformer(img_bgr, fidelity=fidelity)
            actual_model_used = "CodeFormer Face Prior"
        elif model == "fast_stack" or (model == "studio_stack" and stack_mode == "fast"):
            result_bgr, num_faces = pipe.process_fast_studio_stack(img_bgr, fidelity=fidelity, scale=scale)
            actual_model_used = f"Fast {scale}x HD Stack"
        elif model == "studio_stack" and stack_mode == "deep":
            result_bgr, num_faces = pipe.process_studio_stack(img_bgr, fidelity=fidelity, scale=scale)
            actual_model_used = f"Deep SwinIR {scale}x + CodeFormer"
        elif model == "swinir":
            result_bgr = pipe.process_swinir(img_bgr, scale=scale)
            actual_model_used = f"SwinIR RealSR {scale}x"
        else:
            # Default fallback to fast stack
            result_bgr, num_faces = pipe.process_fast_studio_stack(img_bgr, fidelity=fidelity, scale=scale)
            actual_model_used = f"Fast {scale}x HD Stack"

        out_h, out_w = result_bgr.shape[:2]
        duration_ms = round((time.time() - start_time) * 1000)

        # Encode back to lossless PNG
        success, encoded_png = cv2.imencode(".png", result_bgr, [cv2.IMWRITE_PNG_COMPRESSION, 3])
        if not success:
            raise HTTPException(status_code=500, detail="Failed to encode enhanced PNG.")

        return Response(
            content=encoded_png.tobytes(),
            media_type="image/png",
            headers={
                "X-Duration-Ms": str(duration_ms),
                "X-Faces-Detected": str(num_faces),
                "X-Model-Used": actual_model_used,
                "X-Output-Resolution": f"{out_w}x{out_h}",
                "X-Device": str(pipe.device),
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Enhancement error: {str(e)}")

@app.post("/api/deblur/detect")
async def detect_blur(
    file: Optional[UploadFile] = File(None),
    frame_id: Optional[str] = Form(None),
):
    """Auto-detects dominant motion blur trajectory (angle in degrees and displacement length in px). Supports session frame caching."""
    img_bgr, active_frame_id = await get_or_cache_frame(frame_id, file)

    params = estimate_blur_parameters(img_bgr)
    return {
        "status": "success",
        "frame_id": active_frame_id,
        "angle": params["angle"],
        "length": params["length"],
        "confidence": params["confidence"],
    }

@app.post("/api/deblur")
async def deblur_image(
    file: Optional[UploadFile] = File(None),
    frame_id: Optional[str] = Form(None),
    angle: float = Form(0.0),
    length: float = Form(12.0),
    method: str = Form("richardson_lucy"),  # 'richardson_lucy' or 'wiener'
    iterations: int = Form(15),
    damping: float = Form(0.02),
    snr: float = Form(25.0),
    auto_detect: bool = Form(False),
):
    """
    Advanced Directional & Motion Blur Deconvolution.
    Restores blurred frames using regularized Richardson-Lucy or frequency Wiener filters.
    Supports in-memory session frame caching via frame_id to avoid redundant multi-megabyte uploads on slider drags.
    """
    start_time = time.time()
    img_bgr, active_frame_id = await get_or_cache_frame(frame_id, file)

    effective_angle = angle
    effective_length = length
    detected_conf = 0.0

    if auto_detect:
        params = estimate_blur_parameters(img_bgr)
        effective_angle = params["angle"]
        effective_length = params["length"]
        detected_conf = params["confidence"]

    try:
        if method == "wiener":
            result_bgr = wiener_deblur(img_bgr, length=effective_length, angle_deg=effective_angle, snr=snr)
            method_label = f"Wiener Deconvolution ({effective_length:.1f}px @ {effective_angle:.1f}°)"
        else:
            result_bgr = richardson_lucy_deblur(
                img_bgr,
                length=effective_length,
                angle_deg=effective_angle,
                iterations=iterations,
                damping=damping,
            )
            method_label = f"Richardson-Lucy Deconvolution ({iterations} iters, {effective_length:.1f}px @ {effective_angle:.1f}°)"

        out_h, out_w = result_bgr.shape[:2]
        duration_ms = round((time.time() - start_time) * 1000)

        success, encoded_png = cv2.imencode(".png", result_bgr, [cv2.IMWRITE_PNG_COMPRESSION, 3])
        if not success:
            raise HTTPException(status_code=500, detail="Failed to encode deblurred PNG.")

        return Response(
            content=encoded_png.tobytes(),
            media_type="image/png",
            headers={
                "X-Frame-Id": active_frame_id,
                "X-Duration-Ms": str(duration_ms),
                "X-Model-Used": method_label,
                "X-Detected-Angle": str(effective_angle),
                "X-Detected-Length": str(effective_length),
                "X-Detected-Confidence": str(detected_conf),
                "X-Output-Resolution": f"{out_w}x{out_h}",
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Deblur error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    print("Starting Frame Grab GPU Backend on http://localhost:8000 ...")
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")

