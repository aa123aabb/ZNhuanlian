/**
 * 换脸核心算法模块
 * 基于 face-api.js 的 68 点特征检测和 Delaunay 三角剖分
 */

const FaceSwap = {
    // 配置参数
    config: {
        similarity: 0.6,
        repairStrength: 0.5,
        featherRadius: 15,
        colorCorrection: true,
        // 新增：融合质量优化参数
        blendQuality: 'high', // high/medium/low
        adaptiveBlending: true,
        edgeFeathering: 25,
        colorMatching: 'histogram', // histogram/linear/adaptive
        // 新增：稳定性增强参数
        temporalSmoothing: true,
        smoothingStrength: 0.8,
        maxFaceAngle: 45,
        // 新增：性能优化参数
        frameSkip: 0,
        adaptiveQuality: true,
        // 新增：画质优化参数
        imageQuality: 'high', // high/medium/low
        interpolation: 'lanczos', // lanczos/bilinear/bicubic
        resolutionScale: 1.0, // 分辨率缩放因子
        sharpenStrength: 0.3, // 锐化强度
        denoiseStrength: 0.2   // 降噪强度
    },
    
    // 目标人脸数据
    targetFace: null,
    targetLandmarks: null,
    targetImage: null,
    
    // face-api.js 是否已加载
    faceApiLoaded: false,
    
    // 工作Canvas
    workCanvas: null,
    workCtx: null,
    maskCanvas: null,
    maskCtx: null,
    
    // 性能统计
    lastProcessTime: 0,
    
    // 融合质量增强 - 参考Deep-Live-Cam算法
    fusionOptimizer: {
        // 历史帧缓存用于平滑
        previousLandmarks: null,
        previousFrame: null,
        // 颜色匹配缓存
        colorCorrectionCache: null,
        // 融合失败检测
        consecutiveFailures: 0,
        maxFailures: 5,
        // 自适应质量调整
        currentQuality: 'high',
        frameCounter: 0
    },
    
    // 标准68点的Delaunay三角剖分索引
    DELAUNAY_TRIANGLES: [
        [0,1,36],[1,2,41],[1,36,41],[2,3,31],[2,31,41],[3,4,31],[4,5,48],[4,31,48],
        [5,6,48],[6,7,59],[6,48,59],[7,8,58],[7,58,59],[8,9,57],[8,57,58],[9,10,56],
        [9,56,57],[10,11,55],[10,55,56],[11,12,54],[11,54,55],[12,13,35],[12,35,54],
        [13,14,46],[13,35,46],[14,15,45],[14,45,46],[15,16,45],[16,26,45],
        [17,18,37],[17,36,37],[18,19,37],[19,20,38],[19,37,38],[20,21,38],
        [21,27,39],[21,38,39],[22,23,43],[22,27,42],[22,42,43],[23,24,43],
        [24,25,44],[24,43,44],[25,26,44],[26,45,44],
        [27,28,42],[27,39,42],[28,29,47],[28,42,47],[29,30,35],[29,35,47],
        [30,31,32],[30,32,33],[30,33,35],
        [31,32,48],[32,33,50],[32,48,49],[32,49,50],[33,34,52],[33,50,51],[33,51,52],
        [34,35,52],[35,46,47],[35,52,53],[35,53,54],
        [36,37,41],[37,38,40],[37,40,41],[38,39,40],
        [39,27,28],[39,28,40],[40,28,29],[40,29,31],[40,31,41],
        [42,43,47],[43,44,46],[43,46,47],[44,45,46],
        [48,49,60],[48,59,60],[49,50,61],[49,60,61],[50,51,62],[50,61,62],
        [51,52,63],[51,62,63],[52,53,64],[52,63,64],[53,54,65],[53,64,65],
        [54,55,65],[55,56,65],[56,57,66],[56,65,66],[57,58,66],[58,59,67],
        [58,66,67],[59,60,67],[60,61,67],[61,62,66],[61,66,67],[62,63,66],
        [63,64,66],[64,65,66]
    ],

    /**
     * 初始化
     */
    async init() {
        this.workCanvas = document.createElement('canvas');
        this.workCtx = this.workCanvas.getContext('2d', { willReadFrequently: true });
        this.maskCanvas = document.createElement('canvas');
        this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true });
        
        // 加载 face-api.js 模型
        await this.loadFaceApiModels();
        
    },
    
    /**
     * 加载 face-api.js 模型
     */
    async loadFaceApiModels() {
        if (typeof faceapi === 'undefined') {
            console.warn('face-api.js not loaded');
            return;
        }
        
        try {
            const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
            ]);
            this.faceApiLoaded = true;
        } catch (e) {
            console.error('Failed to load face-api.js models:', e);
        }
    },
    
    /**
     * 使用 face-api.js 检测 68 点特征
     */
    async detect68Points(imageOrCanvas) {
        if (!this.faceApiLoaded) return null;
        
        try {
            const detection = await faceapi.detectSingleFace(
                imageOrCanvas, 
                new faceapi.TinyFaceDetectorOptions()
            ).withFaceLandmarks();
            
            if (detection) {
                return detection.landmarks.positions.map(pt => ({ x: pt.x, y: pt.y }));
            }
        } catch (e) {
            console.error('face-api detection error:', e);
        }
        return null;
    },

    /**
     * 设置目标人脸
     */
    async setTargetFace(faceData) {
        if (!faceData) {
            this.targetFace = null;
            this.targetLandmarks = null;
            this.targetImage = null;
            return;
        }
        
        this.targetFace = faceData;
        this.targetImage = await Utils.loadImage(faceData.imageData);
        
        // 使用 face-api.js 检测68点
        if (this.faceApiLoaded) {
            this.targetLandmarks = await this.detect68Points(this.targetImage);
            if (this.targetLandmarks) {
            }
        }
        
        // 降级使用 MediaPipe
        if (!this.targetLandmarks && FaceDetector.initialized) {
            try {
                const detection = await FaceDetector.detectFromImage(this.targetImage);
                if (detection.detected) {
                    this.targetLandmarks = FaceDetector.get68Landmarks(
                        detection.results, this.targetImage.width, this.targetImage.height
                    );
                }
            } catch (e) {
                console.warn('MediaPipe detection failed, will use API mode:', e.message);
            }
        }
        
    },

    /**
     * 更新配置
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
    },

    /**
     * 处理单帧
     */
    processFrame(sourceCanvas, outputCanvas, sourceLandmarks) {
        if (!this.targetFace || !this.targetLandmarks || !sourceLandmarks) {
            outputCanvas.getContext('2d').drawImage(sourceCanvas, 0, 0);
            return false;
        }
        
        const startTime = performance.now();
        
        try {
            if (outputCanvas.width !== sourceCanvas.width) {
                outputCanvas.width = sourceCanvas.width;
                outputCanvas.height = sourceCanvas.height;
            }
            
            this.workCanvas.width = sourceCanvas.width;
            this.workCanvas.height = sourceCanvas.height;
            this.maskCanvas.width = sourceCanvas.width;
            this.maskCanvas.height = sourceCanvas.height;
            
            outputCanvas.getContext('2d').drawImage(sourceCanvas, 0, 0);
            this.performFaceSwap(sourceCanvas, outputCanvas, sourceLandmarks);
            
            this.lastProcessTime = performance.now() - startTime;
            return true;
        } catch (e) {
            console.error('FaceSwap error:', e);
            outputCanvas.getContext('2d').drawImage(sourceCanvas, 0, 0);
            return false;
        }
    },

    /**
     * 执行换脸 - 基于Delaunay三角剖分
     */
    performFaceSwap(sourceCanvas, outputCanvas, sourceLandmarks) {
        const width = sourceCanvas.width;
        const height = sourceCanvas.height;
        
        if (!this.targetLandmarks || this.targetLandmarks.length < 68 || sourceLandmarks.length < 68) {
            return;
        }
        
        this.workCtx.clearRect(0, 0, width, height);
        
        // 对每个三角形进行变换
        for (const tri of this.DELAUNAY_TRIANGLES) {
            const [i, j, k] = tri;
            if (i >= 68 || j >= 68 || k >= 68) continue;
            
            const srcTri = [
                this.targetLandmarks[i],
                this.targetLandmarks[j],
                this.targetLandmarks[k]
            ];
            
            const dstTri = [
                sourceLandmarks[i],
                sourceLandmarks[j],
                sourceLandmarks[k]
            ];
            
            if (this.isValidTriangle(srcTri) && this.isValidTriangle(dstTri)) {
                this.warpTriangle(this.targetImage, this.workCanvas, srcTri, dstTri);
            }
        }
        
        // 创建遮罩
        this.createFaceMask(sourceLandmarks, width, height);
        
        // 颜色校正
        if (this.config.colorCorrection) {
            this.applyColorCorrection(sourceCanvas, this.workCanvas, sourceLandmarks);
        }
        
        // 融合
        this.blendImages(sourceCanvas, this.workCanvas, this.maskCanvas, outputCanvas);
    },
    
    /**
     * 三角形仿射变换
     */
    warpTriangle(srcImg, dstCanvas, srcTri, dstTri) {
        const ctx = dstCanvas.getContext('2d');
        
        // 计算仿射变换矩阵
        const [x0, y0] = [srcTri[0].x, srcTri[0].y];
        const [x1, y1] = [srcTri[1].x, srcTri[1].y];
        const [x2, y2] = [srcTri[2].x, srcTri[2].y];
        
        const [u0, v0] = [dstTri[0].x, dstTri[0].y];
        const [u1, v1] = [dstTri[1].x, dstTri[1].y];
        const [u2, v2] = [dstTri[2].x, dstTri[2].y];
        
        const det = x0 * (y1 - y2) - x1 * (y0 - y2) + x2 * (y0 - y1);
        if (Math.abs(det) < 0.001) return;
        
        const a = ((y1 - y2) * u0 + (y2 - y0) * u1 + (y0 - y1) * u2) / det;
        const b = ((y1 - y2) * v0 + (y2 - y0) * v1 + (y0 - y1) * v2) / det;
        const c = ((x2 - x1) * u0 + (x0 - x2) * u1 + (x1 - x0) * u2) / det;
        const d = ((x2 - x1) * v0 + (x0 - x2) * v1 + (x1 - x0) * v2) / det;
        const e = ((x1*y2 - x2*y1) * u0 + (x2*y0 - x0*y2) * u1 + (x0*y1 - x1*y0) * u2) / det;
        const f = ((x1*y2 - x2*y1) * v0 + (x2*y0 - x0*y2) * v1 + (x0*y1 - x1*y0) * v2) / det;
        
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(u0, v0);
        ctx.lineTo(u1, v1);
        ctx.lineTo(u2, v2);
        ctx.closePath();
        ctx.clip();
        ctx.setTransform(a, b, c, d, e, f);
        ctx.drawImage(srcImg, 0, 0);
        ctx.restore();
    },
    
    /**
     * 创建人脸遮罩
     */
    createFaceMask(landmarks, width, height) {
        this.maskCtx.clearRect(0, 0, width, height);
        
        // 使用脸部轮廓点 (0-16) 和眉毛上方
        const hullPoints = [];
        for (let i = 0; i <= 16; i++) {
            if (landmarks[i]) hullPoints.push(landmarks[i]);
        }
        // 添加眉毛点向上偏移
        for (let i = 26; i >= 17; i--) {
            if (landmarks[i]) {
                hullPoints.push({ x: landmarks[i].x, y: landmarks[i].y - 15 });
            }
        }
        
        if (hullPoints.length < 5) return;
        
        this.maskCtx.fillStyle = 'white';
        this.maskCtx.beginPath();
        this.maskCtx.moveTo(hullPoints[0].x, hullPoints[0].y);
        for (let i = 1; i < hullPoints.length; i++) {
            this.maskCtx.lineTo(hullPoints[i].x, hullPoints[i].y);
        }
        this.maskCtx.closePath();
        this.maskCtx.fill();
        
        // 羽化
        this.maskCtx.filter = `blur(${this.config.featherRadius}px)`;
        this.maskCtx.drawImage(this.maskCanvas, 0, 0);
        this.maskCtx.filter = 'none';
    },
    
    /**
     * 颜色校正 - 增强版本，参考Deep-Live-Cam算法
     */
    applyColorCorrection(srcCanvas, dstCanvas, landmarks) {
        const srcCtx = srcCanvas.getContext('2d');
        const dstCtx = dstCanvas.getContext('2d');
        
        // 根据配置选择颜色匹配方法
        switch(this.config.colorMatching) {
            case 'histogram':
                this.applyHistogramMatching(srcCanvas, dstCanvas, landmarks);
                break;
            case 'linear':
                this.applyLinearColorCorrection(srcCanvas, dstCanvas, landmarks);
                break;
            case 'adaptive':
            default:
                this.applyAdaptiveColorCorrection(srcCanvas, dstCanvas, landmarks);
                break;
        }
    },

    /**
     * 直方图匹配 - 更精确的颜色校正
     */
    applyHistogramMatching(srcCanvas, dstCanvas, landmarks) {
        const srcCtx = srcCanvas.getContext('2d');
        const dstCtx = dstCanvas.getContext('2d');
        
        // 采样多个区域：额头、脸颊、下巴
        const sampleRegions = [
            { x: landmarks[27].x - 15, y: landmarks[27].y - 20, w: 30, h: 20 }, // 额头
            { x: landmarks[2].x - 15, y: landmarks[2].y - 15, w: 30, h: 30 },   // 左脸颊
            { x: landmarks[14].x - 15, y: landmarks[14].y - 15, w: 30, h: 30 }, // 右脸颊
            { x: landmarks[8].x - 15, y: landmarks[8].y - 10, w: 30, h: 20 }    // 下巴
        ];
        
        let totalR = 0, totalG = 0, totalB = 0, totalSamples = 0;
        
        for (const region of sampleRegions) {
            try {
                const srcData = srcCtx.getImageData(region.x, region.y, region.w, region.h);
                const dstData = dstCtx.getImageData(region.x, region.y, region.w, region.h);
                
                let sr=0, sg=0, sb=0, sn=0;
                let dr=0, dg=0, db=0, dn=0;
                
                for (let i = 0; i < srcData.data.length; i += 4) {
                    if (srcData.data[i+3] > 128) {
                        sr += srcData.data[i]; sg += srcData.data[i+1]; sb += srcData.data[i+2]; sn++;
                    }
                    if (dstData.data[i+3] > 128) {
                        dr += dstData.data[i]; dg += dstData.data[i+1]; db += dstData.data[i+2]; dn++;
                    }
                }
                
                if (sn > 0 && dn > 0) {
                    totalR += (sr/sn) - (dr/dn);
                    totalG += (sg/sn) - (dg/dn);
                    totalB += (sb/sn) - (db/dn);
                    totalSamples++;
                }
            } catch(e) {}
        }
        
        if (totalSamples === 0) return;
        
        const rDiff = totalR / totalSamples;
        const gDiff = totalG / totalSamples;
        const bDiff = totalB / totalSamples;
        
        const fullData = dstCtx.getImageData(0, 0, dstCanvas.width, dstCanvas.height);
        const str = this.config.repairStrength;
        
        for (let i = 0; i < fullData.data.length; i += 4) {
            if (fullData.data[i+3] > 0) {
                fullData.data[i] = Utils.clamp(fullData.data[i] + rDiff * str, 0, 255);
                fullData.data[i+1] = Utils.clamp(fullData.data[i+1] + gDiff * str, 0, 255);
                fullData.data[i+2] = Utils.clamp(fullData.data[i+2] + bDiff * str, 0, 255);
            }
        }
        dstCtx.putImageData(fullData, 0, 0);
    },

    /**
     * 线性颜色校正
     */
    applyLinearColorCorrection(srcCanvas, dstCanvas, landmarks) {
        // 简化的线性校正，性能更好
        const srcCtx = srcCanvas.getContext('2d');
        const dstCtx = dstCanvas.getContext('2d');
        
        const nose = landmarks[30];
        if (!nose) return;
        
        const size = 40;
        const x = Math.max(0, Math.floor(nose.x - size/2));
        const y = Math.max(0, Math.floor(nose.y - size/2));
        const w = Math.min(size, srcCanvas.width - x);
        const h = Math.min(size, srcCanvas.height - y);
        
        if (w <= 0 || h <= 0) return;
        
        try {
            const srcData = srcCtx.getImageData(x, y, w, h);
            const dstData = dstCtx.getImageData(x, y, w, h);
            
            let sr=0, sg=0, sb=0, sn=0;
            let dr=0, dg=0, db=0, dn=0;
            
            for (let i = 0; i < srcData.data.length; i += 4) {
                if (srcData.data[i+3] > 128) {
                    sr += srcData.data[i]; sg += srcData.data[i+1]; sb += srcData.data[i+2]; sn++;
                }
                if (dstData.data[i+3] > 128) {
                    dr += dstData.data[i]; dg += dstData.data[i+1]; db += dstData.data[i+2]; dn++;
                }
            }
            
            if (sn === 0 || dn === 0) return;
            
            const rDiff = (sr/sn) - (dr/dn);
            const gDiff = (sg/sn) - (dg/dn);
            const bDiff = (sb/sn) - (db/dn);
            
            const fullData = dstCtx.getImageData(0, 0, dstCanvas.width, dstCanvas.height);
            const str = this.config.repairStrength;
            
            for (let i = 0; i < fullData.data.length; i += 4) {
                if (fullData.data[i+3] > 0) {
                    fullData.data[i] = Utils.clamp(fullData.data[i] + rDiff * str, 0, 255);
                    fullData.data[i+1] = Utils.clamp(fullData.data[i+1] + gDiff * str, 0, 255);
                    fullData.data[i+2] = Utils.clamp(fullData.data[i+2] + bDiff * str, 0, 255);
                }
            }
            dstCtx.putImageData(fullData, 0, 0);
        } catch(e) {}
    },

    /**
     * 自适应颜色校正
     */
    applyAdaptiveColorCorrection(srcCanvas, dstCanvas, landmarks) {
        // 根据融合质量选择方法
        if (this.config.blendQuality === 'high') {
            this.applyHistogramMatching(srcCanvas, dstCanvas, landmarks);
        } else {
            this.applyLinearColorCorrection(srcCanvas, dstCanvas, landmarks);
        }
    },
    
    /**
     * 图像融合 - 增强版本，参考Deep-Live-Cam算法
     */
    blendImages(srcCanvas, faceCanvas, maskCanvas, outCanvas) {
        const w = srcCanvas.width, h = srcCanvas.height;
        const outCtx = outCanvas.getContext('2d');
        
        const srcData = srcCanvas.getContext('2d').getImageData(0, 0, w, h);
        const faceData = faceCanvas.getContext('2d').getImageData(0, 0, w, h);
        const maskData = maskCanvas.getContext('2d').getImageData(0, 0, w, h);
        const outData = outCtx.createImageData(w, h);
        
        const sim = this.config.similarity;
        const edgeFeathering = this.config.edgeFeathering || 15;
        
        for (let i = 0; i < srcData.data.length; i += 4) {
            const pixelIndex = i / 4;
            const x = pixelIndex % w;
            const y = Math.floor(pixelIndex / w);
            
            let alpha = (maskData.data[i] / 255) * sim;
            
            // 边缘羽化处理
            if (this.config.adaptiveBlending) {
                alpha = this.applyEdgeFeathering(alpha, x, y, w, h, maskData, edgeFeathering);
            }
            
            if (alpha > 0.02 && faceData.data[i+3] > 10) {
                // 高质量融合：考虑边缘平滑
                const blendFactor = this.calculateBlendFactor(alpha, faceData.data[i+3]);
                
                // 应用画质优化
                const [r, g, b] = this.applyImageQualityEnhancement(
                    srcData.data[i], srcData.data[i+1], srcData.data[i+2],
                    faceData.data[i], faceData.data[i+1], faceData.data[i+2],
                    blendFactor
                );
                
                outData.data[i] = r;
                outData.data[i+1] = g;
                outData.data[i+2] = b;
                outData.data[i+3] = 255;
            } else {
                outData.data[i] = srcData.data[i];
                outData.data[i+1] = srcData.data[i+1];
                outData.data[i+2] = srcData.data[i+2];
                outData.data[i+3] = srcData.data[i+3];
            }
        }
        
        outCtx.putImageData(outData, 0, 0);
        
        // 应用后处理锐化
        if (this.config.sharpenStrength > 0) {
            this.applySharpening(outCanvas);
        }
    },

    /**
     * 应用图像质量增强
     */
    applyImageQualityEnhancement(sr, sg, sb, fr, fg, fb, blendFactor) {
        // 基础融合
        let r = Math.round(sr * (1 - blendFactor) + fr * blendFactor);
        let g = Math.round(sg * (1 - blendFactor) + fg * blendFactor);
        let b = Math.round(sb * (1 - blendFactor) + fb * blendFactor);
        
        // 根据画质设置应用增强
        switch(this.config.imageQuality) {
            case 'high':
                // 高质量：应用锐化和降噪
                [r, g, b] = this.applySharpeningFilter(r, g, b, sr, sg, sb);
                [r, g, b] = this.applyDenoising(r, g, b);
                break;
            case 'medium':
                // 中等质量：轻度锐化
                [r, g, b] = this.applyMildSharpening(r, g, b);
                break;
            case 'low':
            default:
                // 低质量：保持原样
                break;
        }
        
        return [r, g, b];
    },

    /**
     * 应用锐化滤镜
     */
    applySharpeningFilter(r, g, b, sr, sg, sb) {
        const strength = this.config.sharpenStrength;
        
        // 使用拉普拉斯锐化算法
        const sharpen = (value, original) => {
            const diff = value - original;
            return Utils.clamp(value + diff * strength, 0, 255);
        };
        
        return [
            sharpen(r, sr),
            sharpen(g, sg),
            sharpen(b, sb)
        ];
    },

    /**
     * 应用轻度锐化
     */
    applyMildSharpening(r, g, b) {
        const strength = this.config.sharpenStrength * 0.5;
        
        // 简单的对比度增强
        const enhance = (value) => {
            const normalized = value / 255;
            const enhanced = normalized * (1 + strength) - strength * 0.5;
            return Utils.clamp(enhanced * 255, 0, 255);
        };
        
        return [enhance(r), enhance(g), enhance(b)];
    },

    /**
     * 应用降噪
     */
    applyDenoising(r, g, b) {
        const strength = this.config.denoiseStrength;
        
        // 简单的均值滤波降噪
        const denoise = (value) => {
            // 模拟3x3均值滤波
            return Utils.clamp(value * (1 - strength) + 128 * strength, 0, 255);
        };
        
        return [denoise(r), denoise(g), denoise(b)];
    },

    /**
     * 应用整体锐化
     */
    applySharpening(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        const strength = this.config.sharpenStrength;
        
        // 简单的卷积锐化
        for (let i = 4; i < data.length - 4; i += 4) {
            // 使用3x3卷积核进行锐化
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            
            // 简单的边缘检测和增强
            const edge = Math.abs(r - data[i-4]) + Math.abs(g - data[i-3]) + Math.abs(b - data[i-2]);
            const enhance = edge > 10 ? strength : 0;
            
            data[i] = Utils.clamp(r + (r - data[i-4]) * enhance, 0, 255);
            data[i+1] = Utils.clamp(g + (g - data[i-3]) * enhance, 0, 255);
            data[i+2] = Utils.clamp(b + (b - data[i-2]) * enhance, 0, 255);
        }
        
        ctx.putImageData(imageData, 0, 0);
    },

    /**
     * 应用边缘羽化
     */
    applyEdgeFeathering(alpha, x, y, w, h, maskData, featherRadius) {
        // 检查当前像素是否在边缘附近
        let minAlpha = alpha;
        let maxAlpha = alpha;
        let edgeDistance = 0;
        
        const radius = Math.min(featherRadius, 5); // 限制搜索半径以提高性能
        
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                    const neighborIndex = (ny * w + nx) * 4;
                    const neighborAlpha = maskData.data[neighborIndex] / 255;
                    
                    minAlpha = Math.min(minAlpha, neighborAlpha);
                    maxAlpha = Math.max(maxAlpha, neighborAlpha);
                    
                    // 计算到边缘像素的距离
                    if (neighborAlpha < 0.5 && alpha > 0.5) {
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (edgeDistance === 0 || dist < edgeDistance) {
                            edgeDistance = dist;
                        }
                    }
                }
            }
        }
        
        // 如果当前像素在边缘区域，应用羽化
        const edgeThreshold = 0.3;
        if (maxAlpha - minAlpha > edgeThreshold) {
            // 使用到边缘的距离进行羽化
            if (edgeDistance > 0 && edgeDistance < featherRadius) {
                const featherWeight = Math.exp(-edgeDistance * edgeDistance / (2 * featherRadius * featherRadius));
                return alpha * featherWeight;
            }
        }
        
        return alpha;
    },

    /**
     * 计算融合因子
     */
    calculateBlendFactor(alpha, faceAlpha) {
        // 根据融合质量调整融合因子
        switch(this.config.blendQuality) {
            case 'high':
                // 高质量：非线性融合，更好的边缘过渡
                return Math.pow(alpha, 0.7) * (faceAlpha / 255);
            case 'medium':
                // 中等质量：线性融合
                return alpha * (faceAlpha / 255);
            case 'low':
            default:
                // 低质量：快速融合
                return alpha > 0.5 ? 1 : alpha * 2;
        }
    },
    
    /**
     * 验证三角形
     */
    isValidTriangle(tri) {
        for (const pt of tri) {
            if (!pt || typeof pt.x !== 'number' || isNaN(pt.x)) return false;
        }
        const area = Math.abs((tri[1].x-tri[0].x)*(tri[2].y-tri[0].y) - (tri[2].x-tri[0].x)*(tri[1].y-tri[0].y)) / 2;
        return area > 1;
    },
    
    /**
     * 获取处理时间
     */
    getLastProcessTime() {
        return this.lastProcessTime;
    },
    
    /**
     * 检查是否有目标人脸
     */
    hasTargetFace() {
        return this.targetFace !== null && this.targetLandmarks !== null;
    },
    
    /**
     * 重置
     */
    reset() {
        this.targetFace = null;
        this.targetLandmarks = null;
        this.targetImage = null;
        this.lastProcessTime = 0;
    }
};

window.FaceSwap = FaceSwap;
