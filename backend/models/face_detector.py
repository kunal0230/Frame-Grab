"""
Frame Grab — High-Precision Face Alignment & Blending
Uses deep-learning YuNet detector + standard 5-point facial landmark affine warping.
"""
import cv2
import numpy as np
from pathlib import Path

# Standard 5-point landmark template for 512x512 face alignment (ArcFace / FFHQ standard)
FFHQ_512_LANDMARKS = np.array([
    [192.98138, 239.94708],  # left eye
    [318.90277, 240.0436],   # right eye
    [256.0102, 314.01935],   # nose
    [201.26117, 371.41043],  # left mouth corner
    [313.89905, 371.15118]   # right mouth corner
], dtype=np.float32)

class FaceDetectorAndAligner:
    def __init__(self, yunet_path: str = None):
        self.detector = None
        if yunet_path and Path(yunet_path).exists():
            try:
                self.detector = cv2.FaceDetectorYN.create(str(yunet_path), "", (320, 320))
            except Exception as e:
                print("YuNet init failed:", e)

    def detect_faces(self, image_bgr: np.ndarray, score_threshold=0.6):
        h, w = image_bgr.shape[:2]
        if self.detector is not None:
            self.detector.setInputSize((w, h))
            self.detector.setScoreThreshold(score_threshold)
            _, faces = self.detector.detect(image_bgr)
            results = []
            if faces is not None and len(faces) > 0:
                for f in faces:
                    bbox = f[0:4].astype(np.int32)
                    landmarks = f[4:14].reshape((5, 2)).astype(np.float32)
                    score = float(f[14])
                    results.append({"bbox": bbox, "landmarks": landmarks, "score": score})
            return results

        # Safe fallback if detector is None
        try:
            gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
            cascade_path = getattr(cv2.data, 'haarcascades', '') + 'haarcascade_frontalface_default.xml'
            if Path(cascade_path).exists():
                face_cascade = cv2.CascadeClassifier(cascade_path)
                faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
                results = []
                for (x, y, fw, fh) in faces:
                    l_eye = np.array([x + fw * 0.35, y + fh * 0.38], dtype=np.float32)
                    r_eye = np.array([x + fw * 0.65, y + fh * 0.38], dtype=np.float32)
                    nose = np.array([x + fw * 0.5, y + fh * 0.55], dtype=np.float32)
                    l_mouth = np.array([x + fw * 0.38, y + fh * 0.75], dtype=np.float32)
                    r_mouth = np.array([x + fw * 0.62, y + fh * 0.75], dtype=np.float32)
                    landmarks = np.stack([l_eye, r_eye, nose, l_mouth, r_mouth])
                    results.append({"bbox": np.array([x, y, fw, fh]), "landmarks": landmarks, "score": 0.8})
                return results
        except Exception:
            pass

        return []

    def align_face(self, image_bgr: np.ndarray, landmarks: np.ndarray, crop_size=512):
        """Aligns face to 512x512 standard template via similarity transform"""
        src_pts = landmarks.astype(np.float32)
        dst_pts = FFHQ_512_LANDMARKS * (crop_size / 512.0)

        # Estimate partial affine (similarity transform: translation, rotation, scale)
        affine_mat, _ = cv2.estimateAffinePartial2D(src_pts, dst_pts)
        if affine_mat is None:
            # Fallback identity
            affine_mat = np.array([[1, 0, 0], [0, 1, 0]], dtype=np.float32)

        cropped_face = cv2.warpAffine(
            image_bgr,
            affine_mat,
            (crop_size, crop_size),
            flags=cv2.INTER_LANCZOS4,
            borderMode=cv2.BORDER_REFLECT
        )

        # Compute inverse affine matrix for pasting back
        inv_affine_mat = cv2.invertAffineTransform(affine_mat)
        return cropped_face, affine_mat, inv_affine_mat

    def paste_face_back(self, original_bgr: np.ndarray, restored_face_512: np.ndarray, inv_affine_mat: np.ndarray):
        """Pastes the restored 512x512 face back into the original image using soft Gaussian blending"""
        orig_h, orig_w = original_bgr.shape[:2]
        crop_size = restored_face_512.shape[0]

        # Create soft elliptical mask
        mask = np.zeros((crop_size, crop_size), dtype=np.float32)
        center = (crop_size // 2, crop_size // 2)
        axes = (int(crop_size * 0.42), int(crop_size * 0.46))
        cv2.ellipse(mask, center, axes, 0, 0, 360, 1.0, -1)
        mask = cv2.GaussianBlur(mask, (31, 31), 11.0)
        mask = np.clip(mask, 0.0, 1.0)

        # Warp restored face and mask back to original coordinate frame
        warped_face = cv2.warpAffine(
            restored_face_512,
            inv_affine_mat,
            (orig_w, orig_h),
            flags=cv2.INTER_LANCZOS4,
            borderMode=cv2.BORDER_CONSTANT
        )

        warped_mask = cv2.warpAffine(
            mask,
            inv_affine_mat,
            (orig_w, orig_h),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT
        )

        warped_mask = warped_mask[:, :, np.newaxis]

        # Alpha composite
        output_bgr = (warped_face * warped_mask + original_bgr * (1.0 - warped_mask)).astype(np.uint8)
        return output_bgr
