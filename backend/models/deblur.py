"""
Frame Grab — Advanced Motion & Directional Deblur Engine
Provides Point Spread Function (PSF) synthesis, Richardson-Lucy iterative deconvolution,
Wiener frequency-domain filtering with boundary reflection & tapering,
and automatic closed-form structure-tensor trajectory (angle & length) estimation.
"""

import cv2
import numpy as np
import torch


def make_motion_psf(length: float, angle_deg: float) -> np.ndarray:
    """
    Synthesizes a 2D Point Spread Function (PSF) kernel representing linear motion blur.
    Uses subpixel bilinear anti-aliased interpolation with step size <= 0.25px.
    """
    length = max(float(length), 1.0)
    # Kernel size must be odd and comfortably enclose the blur trajectory
    ksize = int(np.ceil(length * 1.5))
    if ksize % 2 == 0:
        ksize += 1
    ksize = max(ksize, 3)

    kernel = np.zeros((ksize, ksize), dtype=np.float32)
    center = (ksize - 1) / 2.0

    rad = np.deg2rad(angle_deg)
    cos_a = np.cos(rad)
    sin_a = np.sin(rad)

    # Subpixel sampling along blur vector (delta_t <= 0.25 px)
    samples = int(np.ceil(length * 4.0))
    t_vals = np.linspace(-length / 2.0, length / 2.0, max(samples, 4))

    for t in t_vals:
        x = center + t * cos_a
        y = center + t * sin_a

        # Bilinear splatting to prevent spatial grid aliasing
        x0 = int(np.floor(x))
        y0 = int(np.floor(y))
        fx = x - x0
        fy = y - y0

        if 0 <= y0 < ksize and 0 <= x0 < ksize:
            kernel[y0, x0] += (1.0 - fx) * (1.0 - fy)
        if 0 <= y0 < ksize and 0 <= x0 + 1 < ksize:
            kernel[y0, x0 + 1] += fx * (1.0 - fy)
        if 0 <= y0 + 1 < ksize and 0 <= x0 < ksize:
            kernel[y0 + 1, x0] += (1.0 - fx) * fy
        if 0 <= y0 + 1 < ksize and 0 <= x0 + 1 < ksize:
            kernel[y0 + 1, x0 + 1] += fx * fy

    k_sum = np.sum(kernel)
    if k_sum > 0:
        kernel /= k_sum
    else:
        kernel[int(center), int(center)] = 1.0

    return kernel


def estimate_blur_parameters(img_bgr: np.ndarray) -> dict:
    """
    Auto-estimates the dominant motion blur angle (degrees) and blur length (pixels).
    Uses the 2x2 Structure Tensor for exact closed-form minimal energy angle estimation,
    followed by 1D derivative autocorrelation for twin-impulse lag detection.
    Rescales detected length linearly to original image resolution.
    """
    h_orig, w_orig = img_bgr.shape[:2]
    # Downscale for instant real-time estimation (~15ms)
    max_dim = 480
    if max(h_orig, w_orig) > max_dim:
        scale = max_dim / float(max(h_orig, w_orig))
        small = cv2.resize(img_bgr, (int(w_orig * scale), int(h_orig * scale)), interpolation=cv2.INTER_AREA)
    else:
        small = img_bgr
        scale = 1.0

    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

    # Compute spatial image gradients
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)

    # Accumulate Structure Tensor components: J = [[Jxx, Jxy], [Jxy, Jyy]]
    jxx = float(np.sum(gx * gx))
    jyy = float(np.sum(gy * gy))
    jxy = float(np.sum(gx * gy))

    # Analytical closed-form angle minimizing directional gradient energy:
    # E(theta) = Jxx cos^2(theta) + Jyy sin^2(theta) + 2 Jxy sin(theta) cos(theta)
    # dE/dtheta = 0 ==> theta* = 0.5 * atan2(-2 Jxy, Jyy - Jxx)
    angle_rad = 0.5 * np.arctan2(-2.0 * jxy, jyy - jxx)
    detected_angle = float(np.rad2deg(angle_rad))

    # Anisotropy / Coherence measure from eigenvalues of Structure Tensor
    # lambda_1,2 = (Jxx + Jyy +/- sqrt((Jxx - Jyy)^2 + 4 Jxy^2)) / 2
    delta_term = np.sqrt((jxx - jyy) ** 2 + 4.0 * (jxy ** 2))
    trace_term = jxx + jyy + 1e-6
    coherence = float(delta_term / trace_term)
    confidence = float(np.clip(coherence * 1.6, 0.2, 0.95))

    # Estimate blur displacement length via 1D derivative autocorrelation
    # Rotate the image so the motion trajectory aligns with the horizontal axis
    sh, sw = gray.shape[:2]
    center = (sw // 2, sh // 2)
    rot_mat = cv2.getRotationMatrix2D(center, detected_angle, 1.0)
    rot_gray = cv2.warpAffine(gray, rot_mat, (sw, sh), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

    # Compute difference along horizontal axis: spatial derivative h'(x) of boxcar PSF
    # yields two opposite impulses delta(x + L/2) - delta(x - L/2).
    # Its autocorrelation yields a distinct negative dip at lag tau = L.
    diff = np.diff(rot_gray.astype(np.float32), axis=1)
    max_lag = min(50, sw // 4)
    if max_lag < 5:
        max_lag = 5

    autocorr = np.zeros(max_lag, dtype=np.float32)
    valid_rows = 0

    step_y = max(1, diff.shape[0] // 60)
    for r in range(0, diff.shape[0], step_y):
        row = diff[r] - np.mean(diff[r])
        norm = np.sum(row ** 2)
        if norm < 1e-4:
            continue
        c = np.correlate(row, row, mode='full')
        mid = len(c) // 2
        autocorr += c[mid:mid + max_lag] / norm
        valid_rows += 1

    estimated_length_thumb = 12.0
    if valid_rows > 0:
        autocorr /= valid_rows
        # Locate the first distinct negative local minimum (dip) at lag tau = L
        dips = np.where((autocorr[2:-2] < autocorr[1:-3]) & (autocorr[2:-2] < autocorr[3:-1]))[0] + 2
        if len(dips) > 0:
            estimated_length_thumb = float(dips[0])
        else:
            # Fallback to zero crossing
            zeros = np.where(autocorr[1:] <= 0)[0] + 1
            if len(zeros) > 0:
                estimated_length_thumb = float(zeros[0])

    # Explicit linear resolution rescaling: L_full = L_thumb * (W_full / W_thumb)
    final_length = float(np.clip(round(estimated_length_thumb / scale), 3, 50))

    return {
        "angle": round(detected_angle, 1),
        "length": final_length,
        "confidence": round(confidence, 2),
    }


def richardson_lucy_deblur(
    img_bgr: np.ndarray,
    length: float,
    angle_deg: float,
    iterations: int = 15,
    damping: float = 0.02,
) -> np.ndarray:
    """
    Advanced Richardson-Lucy deconvolution with edge-aware damping and boundary reflection.
    Executes on Luminance (Y) channel in YCrCb color space to prevent chromatic noise amplification.
    """
    kernel = make_motion_psf(length, angle_deg)
    # Spatially mirrored adjoint kernel: h_flip(x, y) = h(-x, -y)
    kernel_flip = cv2.flip(kernel, -1)
    ksize = kernel.shape[0]
    pad = ksize

    # Reflect-pad image to eliminate boundary edge ringing
    padded = cv2.copyMakeBorder(img_bgr, pad, pad, pad, pad, cv2.BORDER_REFLECT)
    h_pad, w_pad = padded.shape[:2]

    # Convert to YCrCb (OpenCV ordering for BT.601 YCbCr full range)
    ycrcb = cv2.cvtColor(padded, cv2.COLOR_BGR2YCrCb)
    y_chan, cr, cb = cv2.split(ycrcb)

    y_f = y_chan.astype(np.float32) / 255.0
    recon_y = y_f.copy()

    # Damping threshold delta: prevents noise divergence
    damp_thresh = max(float(damping), 0.001)

    for _ in range(max(1, int(iterations))):
        # Forward blur model: conv(recon_y, h)
        est_conv = cv2.filter2D(recon_y, -1, kernel)
        est_conv = np.maximum(est_conv, 1e-6)

        # Ratio of observation to estimate: R(x, y) = g / (conv(f, h) + epsilon)
        ratio = y_f / est_conv

        # Damping applied BEFORE convolving with adjoint kernel h_flip
        if damp_thresh > 0:
            diff = ratio - 1.0
            ratio = 1.0 + np.sign(diff) * np.maximum(0.0, np.abs(diff) - damp_thresh)

        # Back-project error ratio using flipped adjoint kernel h_flip
        correction = cv2.filter2D(ratio, -1, kernel_flip)
        recon_y = np.clip(recon_y * correction, 0.0, 1.0)

    # Reconstruct Y channel
    restored_y = (recon_y * 255.0).astype(np.uint8)

    merged = cv2.merge([restored_y, cr, cb])
    result_padded = cv2.cvtColor(merged, cv2.COLOR_YCrCb2BGR)

    # Crop out the reflection padding
    out_h, out_w = img_bgr.shape[:2]
    return result_padded[pad:pad + out_h, pad:pad + out_w]


def wiener_deblur(
    img_bgr: np.ndarray,
    length: float,
    angle_deg: float,
    snr: float = 25.0,
) -> np.ndarray:
    """
    Fast frequency-domain Wiener filter deconvolution.
    Incorporates boundary reflection padding and edge tapering (Tukey windowing)
    to eliminate periodic circular convolution boundary streaking.
    """
    h_orig, w_orig = img_bgr.shape[:2]
    pad = max(int(np.ceil(length * 2)), 16)

    # 1. Boundary reflection padding
    padded = cv2.copyMakeBorder(img_bgr, pad, pad, pad, pad, cv2.BORDER_REFLECT)
    h, w = padded.shape[:2]

    # 2. Boundary edge tapering via separable Tukey window on the padded zone
    win_y = np.ones(h, dtype=np.float32)
    win_x = np.ones(w, dtype=np.float32)
    taper_len = pad
    ramp = 0.5 * (1.0 - np.cos(np.linspace(0, np.pi, taper_len, dtype=np.float32)))
    win_y[:taper_len] = ramp
    win_y[-taper_len:] = ramp[::-1]
    win_x[:taper_len] = ramp
    win_x[-taper_len:] = ramp[::-1]
    window_2d = np.outer(win_y, win_x)[:, :, None]

    # Synthesize Point Spread Function
    kernel = make_motion_psf(length, angle_deg)
    kh, kw = kernel.shape[:2]

    # Embed kernel into padded matrix matching image size for FFT
    psf_padded = np.zeros((h, w), dtype=np.float32)
    psf_padded[:kh, :kw] = kernel

    # Circularly roll kernel so center is at (0, 0)
    psf_padded = np.roll(psf_padded, -kh // 2, axis=0)
    psf_padded = np.roll(psf_padded, -kw // 2, axis=1)

    # 2D FFT of Point Spread Function
    H = np.fft.fft2(psf_padded)
    H_conj = np.conj(H)
    H_mag2 = np.abs(H) ** 2

    # Regularization constant derived from SNR in dB: K_reg = 10^(-SNR / 10)
    reg = 10.0 ** (-float(snr) / 10.0)
    W = H_conj / (H_mag2 + reg)

    # Process each color channel
    result_channels = []
    for c in range(3):
        chan = (padded[:, :, c].astype(np.float32) / 255.0) * window_2d[:, :, 0]
        G = np.fft.fft2(chan)
        F_est = G * W
        f_restored = np.real(np.fft.ifft2(F_est))
        f_restored = np.clip(f_restored * 255.0, 0, 255).astype(np.uint8)
        result_channels.append(f_restored)

    deblurred_padded = cv2.merge(result_channels)
    # Crop out padding to restore exact original dimensions
    return deblurred_padded[pad:pad + h_orig, pad:pad + w_orig]
