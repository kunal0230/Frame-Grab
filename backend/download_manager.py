"""
Frame Grab — Model Weights Download & Storage Manager
Keeps ALL model weights in one single folder (backend/models_storage)
for easy management and one-click clearing.
"""
import os
import shutil
import time
import requests
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models_storage"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

MODEL_REGISTRY = {
    "yunet": {
        "name": "YuNet Face Landmark Detector",
        "filename": "face_detection_yunet_2023mar.onnx",
        "size_mb": 0.23,
        "url": "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
        "description": "Deep Learning 5-point facial landmark and bounding box detector (OpenCV Zoo)",
    },
    "codeformer": {
        "name": "CodeFormer (Face VQ-Prior)",
        "filename": "codeformer.pth",
        "size_mb": 376.6,
        "url": "https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/codeformer.pth",
        "description": "NeurIPS SOTA Face Restoration model using Vector-Quantized facial codebook prior",
    },
    "swinir_realsr": {
        "name": "SwinIR RealSR (x4)",
        "filename": "swinir_realsr_x4.pth",
        "size_mb": 64.0,
        "url": "https://github.com/JingyunLiang/SwinIR/releases/download/v0.0/003_realSR_BSRGAN_DFO_s64w8_SwinIR-M_x4_GAN.pth",
        "description": "Swin Transformer Real-World Super-Resolution and de-noising (ICCV 2021)",
    },
    "seedvr2_3b": {
        "name": "ByteDance SeedVR2-3B",
        "filename": "seedvr2_3b_fp8.safetensors",
        "size_mb": 3840.0,
        "url": "https://huggingface.co/ByteDance-Seed/SeedVR2-3B/resolve/main/model.safetensors",
        "description": "ByteDance 3B Parameter One-Step Diffusion Transformer for Video & Image Restoration",
    },
}

def get_storage_path(filename: str) -> Path:
    return MODELS_DIR / filename

def is_model_installed(key: str) -> bool:
    if key not in MODEL_REGISTRY:
        return False
    filename = MODEL_REGISTRY[key]["filename"]
    p = MODELS_DIR / filename
    return p.exists() and p.stat().st_size > 10000

def get_installed_models_info():
    result = []
    total_bytes = 0
    for key, info in MODEL_REGISTRY.items():
        p = MODELS_DIR / info["filename"]
        installed = p.exists() and p.stat().st_size > 10000
        size_on_disk = p.stat().st_size if installed else 0
        total_bytes += size_on_disk
        result.append({
            "key": key,
            "name": info["name"],
            "filename": info["filename"],
            "description": info["description"],
            "expected_mb": info["size_mb"],
            "installed": installed,
            "size_mb": round(size_on_disk / (1024 * 1024), 2),
            "path": str(p) if installed else None,
        })
    return {
        "storage_folder": str(MODELS_DIR),
        "total_storage_mb": round(total_bytes / (1024 * 1024), 2),
        "models": result,
    }

def clear_all_models():
    """Deletes all files in backend/models_storage/ to immediately free disk space"""
    deleted_files = []
    total_freed_bytes = 0
    for item in MODELS_DIR.iterdir():
        if item.is_file():
            size = item.stat().st_size
            total_freed_bytes += size
            item.unlink()
            deleted_files.append(item.name)
        elif item.is_dir():
            shutil.rmtree(item)
            deleted_files.append(item.name)
    return {
        "freed_mb": round(total_freed_bytes / (1024 * 1024), 2),
        "deleted_files": deleted_files,
    }

def download_model(key: str, progress_callback=None):
    if key not in MODEL_REGISTRY:
        raise ValueError(f"Unknown model key: {key}")
    
    info = MODEL_REGISTRY[key]
    dest_path = MODELS_DIR / info["filename"]

    if dest_path.exists() and dest_path.stat().st_size > 10000:
        return str(dest_path)

    temp_path = dest_path.with_suffix(".tmp")
    url = info["url"]

    headers = {"User-Agent": "Mozilla/5.0 FrameGrab"}
    response = requests.get(url, stream=True, headers=headers, timeout=30)
    response.raise_for_status()

    total_size = int(response.headers.get("content-length", 0))
    downloaded = 0
    chunk_size = 1024 * 1024  # 1 MB chunk

    with open(temp_path, "wb") as f:
        for chunk in response.iter_content(chunk_size=chunk_size):
            if chunk:
                f.write(chunk)
                downloaded += len(chunk)
                if progress_callback and total_size > 0:
                    pct = round((downloaded / total_size) * 100, 1)
                    progress_callback(pct, downloaded, total_size)

    # Rename tmp to final
    temp_path.rename(dest_path)
    return str(dest_path)

if __name__ == "__main__":
    import sys
    print("Models Storage Directory:", MODELS_DIR)
    print("Status:", get_installed_models_info())
