/**
 * Frame Grab — Demo Video Generator
 * Generates in-browser high-definition test video reels:
 * 1. "portrait": Realistic studio human subject reel designed specifically for testing
 *    skin detection, bilateral surface smoothing, CLAHE shadow lift, and eye enhancement.
 * 2. "benchmark": 60 FPS motion graphics & timecodes for frame extraction verification.
 */

export async function createDemoVideoBlob(type = 'portrait') {
  const width = 1280;
  const height = 720;
  const fps = 30; // 30 fps is ideal for portrait motion
  const durationSec = 3.5;
  const totalFrames = Math.round(durationSec * fps);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const stream = canvas.captureStream(fps);
  let mimeType = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm';
  }

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 12000000, // 12 Mbps
  });

  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const recordingPromise = new Promise((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolve(blob);
    };
  });

  recorder.start();

  for (let f = 0; f < totalFrames; f++) {
    const time = f / fps;
    if (type === 'portrait') {
      renderPortraitFrame(ctx, width, height, f, totalFrames, time, fps);
    } else {
      renderBenchmarkFrame(ctx, width, height, f, totalFrames, time, fps);
    }
    // Yield to let canvas capture stream take frame
    await new Promise((r) => setTimeout(r, 1000 / fps));
  }

  recorder.stop();
  return recordingPromise;
}

/**
 * Renders a studio portrait frame with human facial anatomy, skin gradients, eyes, hair, and lighting
 */
function renderPortraitFrame(ctx, width, height, frame, totalFrames, time, fps) {
  // 1. Studio Background: Cinematic dark teal/amber vignette
  const bgGrad = ctx.createRadialGradient(width * 0.45, height * 0.4, 60, width / 2, height / 2, width * 0.7);
  bgGrad.addColorStop(0, '#1c2438');
  bgGrad.addColorStop(0.5, '#0e1422');
  bgGrad.addColorStop(1, '#05070d');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle studio bokeh circles in background
  const bokehCount = 6;
  for (let i = 0; i < bokehCount; i++) {
    const bx = 180 + i * 180 + Math.sin(time + i) * 15;
    const by = 150 + Math.cos(time * 0.7 + i) * 40;
    const bGrad = ctx.createRadialGradient(bx, by, 10, bx, by, 70);
    bGrad.addColorStop(0, 'rgba(56, 189, 248, 0.12)');
    bGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = bGrad;
    ctx.beginPath();
    ctx.arc(bx, by, 70, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head Motion Dynamics (Gentle breathing, head turn & micro-expression)
  const headBob = Math.sin(time * 2.2) * 4;
  const headTurn = Math.sin(time * 1.5) * 8;
  const centerX = width / 2 + headTurn;
  const centerY = height * 0.46 + headBob;

  ctx.save();

  // 2. Body / Clothing Shoulders
  const neckW = 85;
  const neckH = 140;
  // Neck with realistic skin shadow
  const neckGrad = ctx.createLinearGradient(centerX - neckW / 2, centerY + 130, centerX + neckW / 2, centerY + 130);
  neckGrad.addColorStop(0, '#c68a6d');
  neckGrad.addColorStop(0.4, '#d89b7e');
  neckGrad.addColorStop(1, '#ad6f53');
  ctx.fillStyle = neckGrad;
  ctx.beginPath();
  ctx.rect(centerX - neckW / 2, centerY + 130, neckW, neckH);
  ctx.fill();

  // Dark studio charcoal coat/collar
  ctx.fillStyle = '#181b24';
  ctx.beginPath();
  ctx.moveTo(centerX - 240, height);
  ctx.lineTo(centerX - 120, centerY + 220);
  ctx.lineTo(centerX - neckW / 2, centerY + 180);
  ctx.lineTo(centerX, centerY + 240);
  ctx.lineTo(centerX + neckW / 2, centerY + 180);
  ctx.lineTo(centerX + 120, centerY + 220);
  ctx.lineTo(centerX + 240, height);
  ctx.closePath();
  ctx.fill();

  // Coat Lapels
  ctx.strokeStyle = '#2d3345';
  ctx.lineWidth = 3;
  ctx.stroke();

  // 3. Hair Back Volume
  ctx.fillStyle = '#1c130d';
  ctx.beginPath();
  ctx.ellipse(centerX, centerY - 20, 160, 200, 0, 0, Math.PI * 2);
  ctx.fill();

  // 4. Face Contour / Anatomical Oval
  const faceW = 125;
  const faceH = 175;
  const faceGrad = ctx.createRadialGradient(centerX - 35, centerY - 30, 20, centerX, centerY, faceH);
  // Natural realistic human skin tones (Fitzpatrick type II-III)
  faceGrad.addColorStop(0, '#f2bfab'); // Highlight key light
  faceGrad.addColorStop(0.4, '#e5aa92'); // Mid-tone
  faceGrad.addColorStop(0.8, '#cb8b71'); // Shadow transition
  faceGrad.addColorStop(1, '#9e5e45'); // Shadow rim

  ctx.fillStyle = faceGrad;
  ctx.beginPath();
  // Jawline path
  ctx.moveTo(centerX - faceW, centerY - 40);
  ctx.bezierCurveTo(centerX - faceW, centerY + 80, centerX - 50, centerY + faceH, centerX, centerY + faceH);
  ctx.bezierCurveTo(centerX + 50, centerY + faceH, centerX + faceW, centerY + 80, centerX + faceW, centerY - 40);
  ctx.bezierCurveTo(centerX + faceW, centerY - 150, centerX - faceW, centerY - 150, centerX - faceW, centerY - 40);
  ctx.fill();

  // Rosy cheek flush (hemoglobin balance)
  const leftCheek = ctx.createRadialGradient(centerX - 55, centerY + 15, 5, centerX - 55, centerY + 15, 45);
  leftCheek.addColorStop(0, 'rgba(215, 95, 95, 0.22)');
  leftCheek.addColorStop(1, 'rgba(215, 95, 95, 0)');
  ctx.fillStyle = leftCheek;
  ctx.beginPath();
  ctx.arc(centerX - 55, centerY + 15, 45, 0, Math.PI * 2);
  ctx.fill();

  const rightCheek = ctx.createRadialGradient(centerX + 55, centerY + 15, 5, centerX + 55, centerY + 15, 45);
  rightCheek.addColorStop(0, 'rgba(215, 95, 95, 0.18)');
  rightCheek.addColorStop(1, 'rgba(215, 95, 95, 0)');
  ctx.fillStyle = rightCheek;
  ctx.beginPath();
  ctx.arc(centerX + 55, centerY + 15, 45, 0, Math.PI * 2);
  ctx.fill();

  // 5. Eyebrows
  ctx.fillStyle = '#2d1b13';
  // Left brow
  ctx.beginPath();
  ctx.moveTo(centerX - 75, centerY - 38);
  ctx.quadraticCurveTo(centerX - 45, centerY - 52, centerX - 18, centerY - 42);
  ctx.quadraticCurveTo(centerX - 45, centerY - 46, centerX - 75, centerY - 38);
  ctx.fill();

  // Right brow
  ctx.beginPath();
  ctx.moveTo(centerX + 18, centerY - 42);
  ctx.quadraticCurveTo(centerX + 45, centerY - 52, centerX + 75, centerY - 38);
  ctx.quadraticCurveTo(centerX + 45, centerY - 46, centerX + 18, centerY - 42);
  ctx.fill();

  // 6. Eyes (Sclera, Iris, Pupil, Catchlights, Eyelashes)
  // Eye blink calculation (subtle blink at 1.8s)
  let eyeOpen = 1.0;
  const blinkCycle = time % 2.5;
  if (blinkCycle > 1.7 && blinkCycle < 1.9) {
    eyeOpen = 0.1;
  }

  const renderEye = (eyeX, eyeY, isLeft) => {
    ctx.save();
    ctx.translate(eyeX, eyeY);
    ctx.scale(1, eyeOpen);

    // Eye socket shadow
    ctx.fillStyle = 'rgba(110, 65, 45, 0.2)';
    ctx.beginPath();
    ctx.ellipse(0, -6, 28, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sclera (White of the eye)
    ctx.fillStyle = '#f8f4f0';
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.quadraticCurveTo(0, -13, 24, 0);
    ctx.quadraticCurveTo(0, 13, -24, 0);
    ctx.fill();

    // Iris (Hazel / Amber Green depth)
    const irisGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 12);
    irisGrad.addColorStop(0, '#5a4528');
    irisGrad.addColorStop(0.6, '#3a583e');
    irisGrad.addColorStop(1, '#1b2c1f');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = '#0a0d0e';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    // Specular Corneal Catchlight (Crucial for portrait life & AI enhancement)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-3, -3, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(3, 2, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Upper Eyelash line
    ctx.strokeStyle = '#1b120c';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-25, 0);
    ctx.quadraticCurveTo(0, -14, 25, 0);
    ctx.stroke();

    ctx.restore();
  };

  renderEye(centerX - 46, centerY - 24, true);
  renderEye(centerX + 46, centerY - 24, false);

  // 7. Nose (Bridge, tip, nostrils, shadow)
  const noseTipY = centerY + 38;
  // Nose bridge shadow
  ctx.strokeStyle = 'rgba(165, 95, 70, 0.25)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(centerX - 8, centerY - 20);
  ctx.lineTo(centerX - 12, noseTipY - 6);
  ctx.stroke();

  // Nose tip highlight
  ctx.fillStyle = 'rgba(255, 240, 230, 0.35)';
  ctx.beginPath();
  ctx.arc(centerX, noseTipY - 4, 7, 0, Math.PI * 2);
  ctx.fill();

  // Nostrils
  ctx.fillStyle = 'rgba(115, 55, 38, 0.6)';
  ctx.beginPath();
  ctx.ellipse(centerX - 12, noseTipY, 4, 2.5, -0.2, 0, Math.PI * 2);
  ctx.ellipse(centerX + 12, noseTipY, 4, 2.5, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // 8. Lips (Natural vermilion tone, cupid's bow, mouth line)
  const mouthY = centerY + 85;
  // Upper lip
  const upperLipGrad = ctx.createLinearGradient(centerX, mouthY - 10, centerX, mouthY);
  upperLipGrad.addColorStop(0, '#b8544c');
  upperLipGrad.addColorStop(1, '#9b3f38');
  ctx.fillStyle = upperLipGrad;
  ctx.beginPath();
  ctx.moveTo(centerX - 35, mouthY);
  ctx.quadraticCurveTo(centerX - 18, mouthY - 10, centerX - 6, mouthY - 6);
  ctx.lineTo(centerX, mouthY - 4);
  ctx.lineTo(centerX + 6, mouthY - 6);
  ctx.quadraticCurveTo(centerX + 18, mouthY - 10, centerX + 35, mouthY);
  ctx.quadraticCurveTo(centerX, mouthY + 2, centerX - 35, mouthY);
  ctx.fill();

  // Lower lip
  const lowerLipGrad = ctx.createLinearGradient(centerX, mouthY, centerX, mouthY + 18);
  lowerLipGrad.addColorStop(0, '#c75e55');
  lowerLipGrad.addColorStop(0.5, '#e07970'); // Specular center
  lowerLipGrad.addColorStop(1, '#a6443c');
  ctx.fillStyle = lowerLipGrad;
  ctx.beginPath();
  ctx.moveTo(centerX - 33, mouthY);
  ctx.quadraticCurveTo(centerX, mouthY + 20, centerX + 33, mouthY);
  ctx.quadraticCurveTo(centerX, mouthY + 4, centerX - 33, mouthY);
  ctx.fill();

  // Lip gloss specular highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  ctx.ellipse(centerX, mouthY + 8, 12, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // 9. Hair Styling (Front strands, volume & highlights)
  ctx.fillStyle = '#231710';
  ctx.beginPath();
  ctx.moveTo(centerX - faceW - 10, centerY - 10);
  ctx.bezierCurveTo(centerX - 130, centerY - 160, centerX - 40, centerY - 180, centerX + 20, centerY - 180);
  ctx.bezierCurveTo(centerX + 110, centerY - 180, centerX + faceW + 15, centerY - 130, centerX + faceW + 10, centerY + 20);
  ctx.bezierCurveTo(centerX + 95, centerY - 100, centerX + 60, centerY - 110, centerX + 10, centerY - 110);
  ctx.bezierCurveTo(centerX - 40, centerY - 110, centerX - 95, centerY - 90, centerX - faceW - 10, centerY - 10);
  ctx.fill();

  // Hair strand highlights
  ctx.strokeStyle = '#4a3224';
  ctx.lineWidth = 2;
  for (let s = -80; s <= 80; s += 20) {
    ctx.beginPath();
    ctx.moveTo(centerX + s, centerY - 170);
    ctx.quadraticCurveTo(centerX + s * 1.2, centerY - 130, centerX + s * 1.3, centerY - 95);
    ctx.stroke();
  }

  ctx.restore();

  // 10. Studio Watermark & Info Badges
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
  ctx.lineWidth = 1.5;
  const badgeW = 420;
  const badgeH = 75;
  const badgeX = 30;
  const badgeY = height - 105;
  ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
  ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

  ctx.fillStyle = '#00f2fe';
  ctx.font = 'bold 20px "Outfit", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('PORTRAIT STUDIO TEST REEL', badgeX + 20, badgeY + 32);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px "JetBrains Mono", monospace';
  ctx.fillText(`FRAME #${String(frame).padStart(4, '0')}  •  SMPTE: 00:00:0${Math.floor(time)}:${String(frame % fps).padStart(2, '0')}`, badgeX + 20, badgeY + 58);
}

/**
 * 60 FPS Benchmark Reel (Geometric and aperture rotation)
 */
function renderBenchmarkFrame(ctx, width, height, frame, totalFrames, time, fps) {
  // Deep studio background
  const grad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, width);
  grad.addColorStop(0, '#131c31');
  grad.addColorStop(1, '#080c14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Rotating geometric aperture
  ctx.save();
  ctx.translate(width / 2, height / 2);
  const angle = (frame / totalFrames) * Math.PI * 4;
  ctx.rotate(angle);

  ctx.strokeStyle = '#00f2fe';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 160, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 8; i++) {
    const spokeAngle = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(spokeAngle) * 160, Math.sin(spokeAngle) * 160);
    ctx.stroke();
  }
  ctx.restore();

  // Fast moving pendulum
  const ballProgress = (Math.sin(time * 4) + 1) / 2;
  const ballX = 120 + ballProgress * (width - 240);
  const ballY = 160 + Math.abs(Math.sin(time * 8)) * 140;

  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(ballX, ballY, 24, 0, Math.PI * 2);
  ctx.fill();

  // Header Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FRAME GRAB — 60 FPS BENCHMARK', width / 2, 90);

  // Timecode Banner Box
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.strokeStyle = 'rgba(0, 242, 254, 0.5)';
  ctx.lineWidth = 2;
  const boxW = 540;
  const boxH = 90;
  const boxX = (width - boxW) / 2;
  const boxY = height - 130;
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.fillStyle = '#00f2fe';
  ctx.font = 'bold 42px "JetBrains Mono", monospace';
  ctx.fillText(`00:00:0${Math.floor(time)}:${String(frame % fps).padStart(2, '0')}`, width / 2, boxY + 46);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '18px "JetBrains Mono", monospace';
  ctx.fillText(`FRAME #${String(frame).padStart(4, '0')} / ${totalFrames}  •  ${fps} FPS`, width / 2, boxY + 74);
}
