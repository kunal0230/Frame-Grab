"""
Frame Grab — Studio AI Enhancement Pipeline
Runs on Apple Silicon GPU (Metal/MPS) with CodeFormer, SwinIR, and Studio Stack.
"""
import cv2
import numpy as np
import torch
from pathlib import Path
from backend.models.face_detector import FaceDetectorAndAligner
from backend.models.codeformer_arch import CodeFormer
from backend.models.swinir_arch import SwinIR

MODELS_DIR = Path(__file__).resolve().parent.parent / "models_storage"

class StudioEnhancementPipeline:
    def __init__(self):
        self.device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
        print(f"Initializing Studio Enhancement Pipeline on device: {self.device}")

        # 1. Face Detector (YuNet)
        yunet_path = MODELS_DIR / "face_detection_yunet_2023mar.onnx"
        self.face_aligner = FaceDetectorAndAligner(str(yunet_path) if yunet_path.exists() else None)

        # 2. Lazy-loaded PyTorch Models
        self.codeformer = None
        self.swinir = None

    def get_codeformer(self):
        if self.codeformer is None:
            ckpt_path = MODELS_DIR / "codeformer.pth"
            if not ckpt_path.exists():
                raise FileNotFoundError(f"CodeFormer weights not found in {MODELS_DIR}. Please download it first.")
            print("Loading CodeFormer onto", self.device)
            model = CodeFormer(dim_embd=512, codebook_size=1024, n_head=8, n_layers=9, connect_list=['32', '64', '128', '256'])
            ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
            model.load_state_dict(ckpt["params_ema"], strict=True)
            model.eval()
            self.codeformer = model.to(self.device)
        return self.codeformer

    def get_swinir(self):
        if self.swinir is None:
            ckpt_path = MODELS_DIR / "swinir_realsr_x4.pth"
            if not ckpt_path.exists():
                raise FileNotFoundError(f"SwinIR weights not found in {MODELS_DIR}. Please download it first.")
            print("Loading SwinIR RealSR onto", self.device)
            model = SwinIR(
                upscale=4, in_chans=3, img_size=64, window_size=8, img_range=1.,
                depths=[6, 6, 6, 6, 6, 6], embed_dim=180, num_heads=[6, 6, 6, 6, 6, 6],
                mlp_ratio=2, upsampler='nearest+conv', resi_connection='1conv'
            )
            ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
            param_key = "params_ema" if "params_ema" in ckpt else "params"
            model.load_state_dict(ckpt[param_key] if param_key in ckpt else ckpt, strict=True)
            model.eval()
            self.swinir = model.to(self.device)
        return self.swinir

    def process_codeformer(self, img_bgr: np.ndarray, fidelity: float = 0.6):
        """Restores all human faces in image using CodeFormer VQ-Prior"""
        model = self.get_codeformer()
        faces = self.face_aligner.detect_faces(img_bgr)
        if not faces:
            return img_bgr, 0

        result_bgr = img_bgr.copy()
        for face_info in faces:
            landmarks = face_info["landmarks"]
            cropped_face, affine_mat, inv_affine_mat = self.face_aligner.align_face(result_bgr, landmarks, crop_size=512)

            # Convert to PyTorch Tensor: [1, 3, 512, 512] normalized to [-1, 1]
            face_rgb = cv2.cvtColor(cropped_face, cv2.COLOR_BGR2RGB)
            face_tensor = torch.from_numpy(face_rgb).float() / 255.0
            face_tensor = (face_tensor - 0.5) / 0.5
            face_tensor = face_tensor.permute(2, 0, 1).unsqueeze(0).to(self.device)

            with torch.no_grad():
                # CodeFormer forward pass: returns (restored_tensor, codebook_indices)
                restored_tensor = model(face_tensor, w=fidelity, adain=True)[0]
                restored_tensor = torch.clamp((restored_tensor * 0.5 + 0.5) * 255.0, 0, 255)
                restored_face_rgb = restored_tensor.squeeze(0).permute(1, 2, 0).cpu().numpy().astype(np.uint8)

            restored_face_bgr = cv2.cvtColor(restored_face_rgb, cv2.COLOR_RGB2BGR)
            result_bgr = self.face_aligner.paste_face_back(result_bgr, restored_face_bgr, inv_affine_mat)

        return result_bgr, len(faces)

    def process_swinir(self, img_bgr: np.ndarray, scale: int = 4, tile_size: int = 512, tile_pad: int = 32):
        """Restores full frame with SwinIR RealSR, using tiled inference for large images to preserve memory"""
        model = self.get_swinir()
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        h, w = img_rgb.shape[:2]

        # If image fits within tile_size, run directly
        if h <= tile_size and w <= tile_size:
            tensor = torch.from_numpy(img_rgb).float() / 255.0
            tensor = tensor.permute(2, 0, 1).unsqueeze(0).to(self.device)
            window_size = 8
            mod_pad_h = (window_size - h % window_size) % window_size
            mod_pad_w = (window_size - w % window_size) % window_size
            tensor = torch.nn.functional.pad(tensor, (0, mod_pad_w, 0, mod_pad_h), 'reflect')

            with torch.no_grad():
                out_tensor = model(tensor)
                out_tensor = out_tensor[..., :h * 4, :w * 4]
                out_tensor = torch.clamp(out_tensor * 255.0, 0, 255)
                out_rgb = out_tensor.squeeze(0).permute(1, 2, 0).cpu().numpy().astype(np.uint8)
        else:
            # Tiled inference with overlap blending (prevents MPS OOM on 1080p / 4K / imported photos)
            out_h, out_w = h * 4, w * 4
            out_rgb = np.zeros((out_h, out_w, 3), dtype=np.uint8)

            tiles_x = int(np.ceil(w / tile_size))
            tiles_y = int(np.ceil(h / tile_size))

            for y in range(tiles_y):
                for x in range(tiles_x):
                    ofs_x = x * tile_size
                    ofs_y = y * tile_size

                    input_start_x = max(0, ofs_x - tile_pad)
                    input_end_x = min(w, ofs_x + tile_size + tile_pad)
                    input_start_y = max(0, ofs_y - tile_pad)
                    input_end_y = min(h, ofs_y + tile_size + tile_pad)

                    tile_in = img_rgb[input_start_y:input_end_y, input_start_x:input_end_x]
                    th, tw = tile_in.shape[:2]

                    window_size = 8
                    mod_pad_h = (window_size - th % window_size) % window_size
                    mod_pad_w = (window_size - tw % window_size) % window_size
                    tile_tensor = torch.from_numpy(tile_in).float() / 255.0
                    tile_tensor = tile_tensor.permute(2, 0, 1).unsqueeze(0).to(self.device)
                    tile_tensor = torch.nn.functional.pad(tile_tensor, (0, mod_pad_w, 0, mod_pad_h), 'reflect')

                    with torch.no_grad():
                        tile_out = model(tile_tensor)
                        tile_out = tile_out[..., :th * 4, :tw * 4]
                        tile_out = torch.clamp(tile_out * 255.0, 0, 255)
                        tile_out_rgb = tile_out.squeeze(0).permute(1, 2, 0).cpu().numpy().astype(np.uint8)

                    # Extract inner valid unpadded patch
                    crop_start_x = (ofs_x - input_start_x) * 4
                    crop_end_x = crop_start_x + min(tile_size, w - ofs_x) * 4
                    crop_start_y = (ofs_y - input_start_y) * 4
                    crop_end_y = crop_start_y + min(tile_size, h - ofs_y) * 4

                    dest_start_x = ofs_x * 4
                    dest_end_x = dest_start_x + min(tile_size, w - ofs_x) * 4
                    dest_start_y = ofs_y * 4
                    dest_end_y = dest_start_y + min(tile_size, h - ofs_y) * 4

                    out_rgb[dest_start_y:dest_end_y, dest_start_x:dest_end_x] = tile_out_rgb[crop_start_y:crop_end_y, crop_start_x:crop_end_x]

        out_bgr = cv2.cvtColor(out_rgb, cv2.COLOR_RGB2BGR)

        # Scale downsampling if scale < 4 requested
        if scale == 2:
            out_bgr = cv2.resize(out_bgr, (w * 2, h * 2), interpolation=cv2.INTER_AREA)
        elif scale == 1:
            out_bgr = cv2.resize(out_bgr, (w, h), interpolation=cv2.INTER_AREA)

        return out_bgr

    def process_fast_studio_stack(self, img_bgr: np.ndarray, fidelity: float = 0.6, scale: int = 2):
        """
        Fast Studio Stack: High-order Lanczos4 Super-Resolution + CodeFormer SOTA Face Prior.
        Executes in ~0.6 - 0.8s on Apple M5 (vs 3-4 minutes for SwinIR).
        Delivers crisp full-frame upscaling with razor-sharp facial restoration.
        """
        h, w = img_bgr.shape[:2]
        if scale > 1:
            scaled_bgr = cv2.resize(img_bgr, (w * scale, h * scale), interpolation=cv2.INTER_LANCZOS4)
        else:
            scaled_bgr = img_bgr.copy()

        final_bgr, num_faces = self.process_codeformer(scaled_bgr, fidelity=fidelity)
        return final_bgr, num_faces

    def process_studio_stack(self, img_bgr: np.ndarray, fidelity: float = 0.6, scale: int = 2):
        """Dual-Stage Studio Stack: SwinIR Global Restoration + CodeFormer Face Prior"""
        # Step 1: Global SwinIR super-resolution
        sr_bgr = self.process_swinir(img_bgr, scale=scale)

        # Step 2: CodeFormer facial refinement on the upscaled image
        final_bgr, num_faces = self.process_codeformer(sr_bgr, fidelity=fidelity)
        return final_bgr, num_faces

