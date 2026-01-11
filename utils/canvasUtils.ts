
export const processPaperTexture = (
  img: HTMLImageElement, 
  width: number, 
  height: number
): { visual: HTMLCanvasElement; heightMap: HTMLCanvasElement } => {
  // 1. Prepare Visual Canvas (Tiled Image)
  const visualCanvas = document.createElement("canvas");
  const heightCanvas = document.createElement("canvas");

  // SAFETY GUARD: Prevent 0-dimension canvas errors
  if (width <= 0 || height <= 0) {
      visualCanvas.width = 1;
      visualCanvas.height = 1;
      heightCanvas.width = 1;
      heightCanvas.height = 1;
      return { visual: visualCanvas, heightMap: heightCanvas };
  }

  visualCanvas.width = width;
  visualCanvas.height = height;
  const vCtx = visualCanvas.getContext("2d");

  // 2. Prepare Height Map Canvas (Physics)
  heightCanvas.width = width;
  heightCanvas.height = height;
  const hCtx = heightCanvas.getContext("2d");

  if (!vCtx || !hCtx) return { visual: visualCanvas, heightMap: heightCanvas };

  // PRE-FILL: Fill white to handle transparent PNGs correctly.
  vCtx.fillStyle = '#ffffff';
  vCtx.fillRect(0, 0, width, height);

  // SCALE DOWN: Draw the image scaled to fit the tile exactly.
  vCtx.drawImage(img, 0, 0, width, height);

  // 3. Generate Height Map Data BASED ONLY ON INPUT TEXTURE
  const vImg = vCtx.getImageData(0, 0, width, height);
  const hImg = hCtx.createImageData(width, height);
  const vData = vImg.data;
  const hData = hImg.data;
  const length = vData.length;

  for (let i = 0; i < length; i += 4) {
      const r = vData[i];
      const g = vData[i + 1];
      const b = vData[i + 2];

      // Calculate Luminance
      // 0.0 (Black) -> 1.0 (White)
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

      // --- VISUAL LAYER (Greyscale for Multiply) ---
      // We keep the visual texture straightforward greyscale
      vData[i] = r;
      vData[i+1] = g;
      vData[i+2] = b;
      vData[i+3] = 255; // Opaque

      // --- PHYSICS MAPPING: EXTREME 64X ---
      // High Alpha = Paint is Erased (Valley/Pore).
      // Low Alpha = Paint Stays (Peak/Surface).
      
      // 1. Invert: Darker pixels = Deeper Valleys
      let rejection = 1.0 - lum;

      // 2. AMPLIFY (64X Factor)
      // "Aggressively amplify any valleys or pores by a factor of 64X"
      
      // Clean up extremely light noise (white paper grain) so we don't block paint everywhere.
      if (rejection < 0.02) {
          rejection = 0;
      } else {
          // Cubic curve separates pores from surface grain.
          rejection = Math.pow(rejection, 3) * 64.0;
      }

      // 3. Clamp
      rejection = Math.min(1, Math.max(0, rejection));

      // 4. Map to Alpha
      const physicsAlpha = Math.floor(rejection * 255);

      hData[i] = 0;
      hData[i + 1] = 0;
      hData[i + 2] = 0;
      hData[i + 3] = physicsAlpha;
  }

  vCtx.putImageData(vImg, 0, 0);
  hCtx.putImageData(hImg, 0, 0);
  
  return { visual: visualCanvas, heightMap: heightCanvas };
};

export const createNoiseTexture = (width: number, height: number): Promise<{ visual: HTMLCanvasElement; heightMap: HTMLCanvasElement }> => {
    // SAFETY GUARD
    if (width <= 0 || height <= 0) {
        const c = document.createElement('canvas');
        c.width = 1; c.height = 1;
        return Promise.resolve({ visual: c, heightMap: c });
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.resolve({ visual: canvas, heightMap: canvas });

    // 1. Fill Background (Paper White)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // 2. Generate Grain (Simulating Cold Press / Rough Paper)
    
    // Pass 1: Coarse Base Grain (Organic irregular clumps)
    // Using overlapping ellipses to create a "bumpy" topography larger than single pixels
    const grainDensity = 0.4; // Coverage factor
    const grainCount = (width * height) * grainDensity / 10; 

    for (let i = 0; i < grainCount; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        
        // Varying sizes for irregularity (2px to 6px clumps)
        const r = 1.5 + Math.random() * 2.5; 
        
        // Varying shades of off-white/grey
        // Darker = deeper valley. We want subtle undulations.
        const shade = 230 + Math.random() * 25; 
        
        ctx.beginPath();
        // Distorted circle
        ctx.ellipse(
            x, y, 
            r, r * (0.7 + Math.random() * 0.6), 
            Math.random() * Math.PI, 
            0, Math.PI * 2
        );
        ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, 0.5)`; // Semi-transparent to blend
        ctx.fill();
    }

    // Pass 2: Fine Tooth (Pixel level bite)
    const idata = ctx.getImageData(0, 0, width, height);
    const data = idata.data;
    
    for (let i = 0; i < data.length; i += 4) {
        const noise = Math.random();
        
        // Occasional deeper pits (pores)
        if (noise < 0.03) {
             const val = data[i] * 0.9; // Darken
             data[i] = val;
             data[i+1] = val;
             data[i+2] = val;
        } 
    }
    ctx.putImageData(idata, 0, 0);

    // Pass 3: Large Fibers
    ctx.globalCompositeOperation = 'multiply';
    const fiberCount = 600;
    for (let i = 0; i < fiberCount; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        
        // Long thin fibers or small chunks
        const isLong = Math.random() > 0.7;
        const r = 1 + Math.random() * 2.0;
        
        ctx.beginPath();
        if (isLong) {
            ctx.ellipse(x, y, r * 3, r * 0.2, Math.random() * Math.PI, 0, Math.PI * 2);
        } else {
            ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
        }
        
        ctx.fillStyle = `rgba(0,0,0, ${0.02 + Math.random() * 0.04})`; 
        ctx.fill();
    }
    
    // Return to normal
    ctx.globalCompositeOperation = 'source-over';

    // 3. Blur to unify the clumps into hills/valleys
    ctx.filter = 'blur(1.2px)'; 
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';
    
    const img = new Image();
    img.src = canvas.toDataURL();
    
    return new Promise<{ visual: HTMLCanvasElement; heightMap: HTMLCanvasElement }>((resolve) => {
        img.onload = () => {
            resolve(processPaperTexture(img, width, height));
        };
    });
};

export const clearCanvas = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
};
