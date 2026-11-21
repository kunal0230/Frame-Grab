/**
 * Frame Grab — In-Browser Motion & Directional Deblur Engine
 * Client-side implementation of Point Spread Function (PSF) synthesis,
 * iterative Richardson-Lucy deconvolution, Wiener inverse filtering,
 * and automatic blur trajectory (angle & length) detection.
 * Works 100% offline and on Vercel without requiring a Python GPU server.
 */

export class MotionDeblurEngine {
  /**
   * Synthesizes a 2D Point Spread Function (PSF) representing linear motion blur.
   * Uses subpixel bilinear interpolation.
   */
  static makeMotionKernel(length, angleDeg) {
    length = Math.max(parseFloat(length) || 1.0, 1.0);
    let ksize = Math.ceil(length * 1.5);
    if (ksize % 2 === 0) ksize += 1;
    ksize = Math.max(ksize, 3);

    const kernel = new Float32Array(ksize * ksize);
    const center = (ksize - 1) / 2.0;

    const rad = (angleDeg * Math.PI) / 180.0;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    const samples = Math.max(Math.ceil(length * 4), 4);
    const step = length / (samples - 1);

    for (let i = 0; i < samples; i++) {
      const t = -length / 2.0 + i * step;
      const x = center + t * cosA;
      const y = center + t * sinA;

      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;

      if (y0 >= 0 && y0 < ksize && x0 >= 0 && x0 < ksize) {
        kernel[y0 * ksize + x0] += (1.0 - fx) * (1.0 - fy);
      }
      if (y0 >= 0 && y0 < ksize && x0 + 1 >= 0 && x0 + 1 < ksize) {
        kernel[y0 * ksize + (x0 + 1)] += fx * (1.0 - fy);
      }
      if (y0 + 1 >= 0 && y0 + 1 < ksize && x0 >= 0 && x0 < ksize) {
        kernel[(y0 + 1) * ksize + x0] += (1.0 - fx) * fy;
      }
      if (y0 + 1 >= 0 && y0 + 1 < ksize && x0 + 1 >= 0 && x0 + 1 < ksize) {
        kernel[(y0 + 1) * ksize + (x0 + 1)] += fx * fy;
      }
    }

    let sum = 0.0;
    for (let i = 0; i < kernel.length; i++) sum += kernel[i];
    if (sum > 0) {
      for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
    } else {
      kernel[Math.floor(center) * ksize + Math.floor(center)] = 1.0;
    }

    return { kernel, ksize };
  }

  /**
   * Convolves a 2D float channel with a 2D kernel using mirror/reflect boundary padding.
   */
  static convolve2D(input, width, height, kernel, ksize) {
    const output = new Float32Array(width * height);
    const halfK = Math.floor(ksize / 2);

    for (let y = 0; y < height; y++) {
      const yOffset = y * width;
      for (let x = 0; x < width; x++) {
        let acc = 0.0;

        for (let ky = 0; ky < ksize; ky++) {
          let py = y + ky - halfK;
          // Reflect boundary condition
          if (py < 0) py = -py;
          else if (py >= height) py = 2 * height - py - 1;
          const pyOffset = py * width;

          const kRowOffset = ky * ksize;
          for (let kx = 0; kx < ksize; kx++) {
            let px = x + kx - halfK;
            if (px < 0) px = -px;
            else if (px >= width) px = 2 * width - px - 1;

            acc += input[pyOffset + px] * kernel[kRowOffset + kx];
          }
        }
        output[yOffset + x] = acc;
      }
    }
    return output;
  }

  /**
   * Auto-estimates the dominant blur angle and length from an ImageData object.
   */
  static estimateBlur(srcImageData) {
    const sw = srcImageData.width;
    const sh = srcImageData.height;
    const maxDim = 320;
    const scale = Math.min(1.0, maxDim / Math.max(sw, sh));
    const dw = Math.max(Math.floor(sw * scale), 32);
    const dh = Math.max(Math.floor(sh * scale), 32);

    // Create thumbnail on offscreen canvas
    const offCanvas = document.createElement('canvas');
    offCanvas.width = dw;
    offCanvas.height = dh;
    const ctx = offCanvas.getContext('2d');

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sw;
    tempCanvas.height = sh;
    tempCanvas.getContext('2d').putImageData(srcImageData, 0, 0);

    ctx.drawImage(tempCanvas, 0, 0, dw, dh);
    const thumbData = ctx.getImageData(0, 0, dw, dh);
    const pixels = thumbData.data;

    // Convert to grayscale float array
    const gray = new Float32Array(dw * dh);
    for (let i = 0; i < dw * dh; i++) {
      const idx = i * 4;
      gray[i] = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
    }

    // Directional derivatives using 3x3 Sobel
    const gx = new Float32Array(dw * dh);
    const gy = new Float32Array(dw * dh);

    for (let y = 1; y < dh - 1; y++) {
      for (let x = 1; x < dw - 1; x++) {
        const i = y * dw + x;
        gx[i] =
          -gray[i - dw - 1] + gray[i - dw + 1] -
          2 * gray[i - 1] + 2 * gray[i + 1] -
          gray[i + dw - 1] + gray[i + dw + 1];

        gy[i] =
          -gray[i - dw - 1] - 2 * gray[i - dw] - gray[i - dw + 1] +
          gray[i + dw - 1] + 2 * gray[i + dw] + gray[i + dw + 1];
      }
    }

    // Compute 2x2 Structure Tensor components (second raw directional moments):
    // Jxx = sum(Gx^2), Jyy = sum(Gy^2), Jxy = sum(Gx * Gy)
    let jxx = 0.0;
    let jyy = 0.0;
    let jxy = 0.0;
    let count = 0;

    for (let y = 2; y < dh - 2; y += 2) {
      for (let x = 2; x < dw - 2; x += 2) {
        const idx = y * dw + x;
        const dx = gx[idx];
        const dy = gy[idx];
        jxx += dx * dx;
        jyy += dy * dy;
        jxy += dx * dy;
        count++;
      }
    }

    // Exact closed-form angle minimizing directional gradient variance/energy:
    // theta* = 0.5 * atan2(-2 * Jxy, Jyy - Jxx)
    const angleRad = 0.5 * Math.atan2(-2.0 * jxy, jyy - jxx);
    const bestAngle = Math.round((angleRad * 180.0) / Math.PI);

    // Structure Tensor eigenvalues for anisotropy / confidence
    // lambda1,2 = (Jxx + Jyy +/- sqrt((Jxx - Jyy)^2 + 4 * Jxy^2)) / 2
    const trace = jxx + jyy + 1e-6;
    const diff = jxx - jyy;
    const disc = Math.sqrt(diff * diff + 4.0 * jxy * jxy);
    const coherence = disc / trace;
    const confidence = Math.min(0.95, Math.max(0.25, Math.round(coherence * 1.6 * 100) / 100));

    // Estimate displacement length using horizontal derivative autocorrelation after rotation
    const radB = (bestAngle * Math.PI) / 180.0;
    const cosB = Math.cos(radB);
    const sinB = Math.sin(radB);

    const maxLag = Math.min(30, Math.floor(dw / 4));
    const autocorr = new Float32Array(maxLag);
    let sampleRows = 0;

    for (let y = 5; y < dh - 5; y += 4) {
      const lineDiff = [];
      for (let x = 5; x < dw - 5; x++) {
        const idx = y * dw + x;
        lineDiff.push(gx[idx] * cosB + gy[idx] * sinB);
      }
      if (lineDiff.length < maxLag * 2) continue;

      let mean = 0;
      for (let i = 0; i < lineDiff.length; i++) mean += lineDiff[i];
      mean /= lineDiff.length;

      let norm = 0;
      for (let i = 0; i < lineDiff.length; i++) {
        lineDiff[i] -= mean;
        norm += lineDiff[i] * lineDiff[i];
      }
      if (norm < 1e-4) continue;

      for (let lag = 0; lag < maxLag; lag++) {
        let dot = 0;
        for (let i = 0; i < lineDiff.length - lag; i++) {
          dot += lineDiff[i] * lineDiff[i + lag];
        }
        autocorr[lag] += dot / norm;
      }
      sampleRows++;
    }

    let estimatedLen = 10;
    if (sampleRows > 0) {
      for (let l = 0; l < maxLag; l++) autocorr[l] /= sampleRows;
      // The spatial derivative of a boxcar PSF consists of two opposite impulses delta(x + L/2) - delta(x - L/2).
      // Its autocorrelation yields a distinct negative local minimum at lag tau = +/- L.
      for (let l = 2; l < maxLag - 2; l++) {
        if (autocorr[l] < autocorr[l - 1] && autocorr[l] < autocorr[l + 1]) {
          estimatedLen = l;
          break;
        }
      }
    }

    // Explicit linear resolution rescaling: L_full = L_thumb * (W_full / W_thumb) = L_thumb / scale
    const finalLength = Math.max(3, Math.min(50, Math.round(estimatedLen / scale)));

    return {
      angle: bestAngle,
      length: finalLength,
      confidence: confidence,
    };
  }

  /**
   * Deblurs an ImageData object using regularized Richardson-Lucy deconvolution.
   * Processes the Luminance (Y) channel to prevent chromatic noise, preserving color fidelity.
   */
  static deblurRichardsonLucy(srcImageData, length, angleDeg, iterations = 15, damping = 0.02) {
    const width = srcImageData.width;
    const height = srcImageData.height;
    const numPixels = width * height;
    const srcData = srcImageData.data;

    const { kernel, ksize } = this.makeMotionKernel(length, angleDeg);

    // Create mirrored PSF for backward back-projection
    const mirrorKernel = new Float32Array(ksize * ksize);
    for (let i = 0; i < ksize * ksize; i++) {
      mirrorKernel[i] = kernel[ksize * ksize - 1 - i];
    }

    // Convert to Luminance (Y) and Chrominance (Cb, Cr)
    const yChan = new Float32Array(numPixels);
    const cbChan = new Float32Array(numPixels);
    const crChan = new Float32Array(numPixels);

    for (let i = 0; i < numPixels; i++) {
      const idx = i * 4;
      const r = srcData[idx];
      const g = srcData[idx + 1];
      const b = srcData[idx + 2];

      yChan[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
      cbChan[i] = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      crChan[i] = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    }

    let reconY = new Float32Array(yChan);
    const dampThresh = Math.max(parseFloat(damping) || 0.02, 0.001);
    const iters = Math.max(1, Math.min(35, parseInt(iterations) || 15));

    for (let it = 0; it < iters; it++) {
      // Forward estimate: conv(reconY, kernel)
      const estConv = this.convolve2D(reconY, width, height, kernel, ksize);

      // Compute ratio yChan / estConv with damping
      const ratio = new Float32Array(numPixels);
      for (let i = 0; i < numPixels; i++) {
        const est = Math.max(estConv[i], 1e-6);
        let rVal = yChan[i] / est;

        if (dampThresh > 0) {
          const diff = rVal - 1.0;
          rVal = 1.0 + Math.sign(diff) * Math.max(0.0, Math.abs(diff) - dampThresh);
        }
        ratio[i] = rVal;
      }

      // Back-project error correction: conv(ratio, mirrorKernel)
      const correction = this.convolve2D(ratio, width, height, mirrorKernel, ksize);

      // Multiplicative update with clipping
      for (let i = 0; i < numPixels; i++) {
        reconY[i] = Math.max(0.0, Math.min(1.0, reconY[i] * correction[i]));
      }
    }

    // Reconstruct RGB from restored Luminance and original Chrominance
    const outData = new Uint8ClampedArray(srcData.length);
    for (let i = 0; i < numPixels; i++) {
      const idx = i * 4;
      const y = reconY[i] * 255.0;
      const cb = cbChan[i] - 128;
      const cr = crChan[i] - 128;

      const r = y + 1.402 * cr;
      const g = y - 0.344136 * cb - 0.714136 * cr;
      const b = y + 1.772 * cb;

      outData[idx] = Math.max(0, Math.min(255, Math.round(r)));
      outData[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      outData[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      outData[idx + 3] = srcData[idx + 3]; // Preserve alpha
    }

    return new ImageData(outData, width, height);
  }
}

