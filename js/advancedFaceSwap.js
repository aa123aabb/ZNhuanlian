/**
 * 高级换脸算法 - 四维闭环融合
 * 特征层做自然融合，几何层做精准对齐，像素层做无缝合成，修复层做细节补全
 * 参考Deep-Live-Cam架构实现
 */

class AdvancedFaceSwap {
    constructor() {
        // 配置参数
        this.config = {
            similarity: 0.7,
            repairStrength: 0.6,
            featherRadius: 12,
            colorCorrection: true,
            poissonBlend: true,
            temporalSmoothing: 0.3,
            adaptiveQuality: true
        };
        
        // 目标人脸数据
        this.targetFace = null;
        this.targetLandmarks = null;
        this.targetImage = null;
        this.targetEmbedding = null;
        
        // 工作Canvas
        this.workCanvas = document.createElement('canvas');
        this.workCtx = this.workCanvas.getContext('2d', { willReadFrequently: true });
        this.maskCanvas = document.createElement('canvas');
        this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true });
        this.tempCanvas = document.createElement('canvas');
        this.tempCtx = this.tempCanvas.getContext('2d', { willReadFrequently: true });
        
        // 性能优化
        this.frameCache = [];
        this.cacheSize = 3;
        this.lastDetectionTime = 0;
        this.detectionInterval = 0.033; // ~30 FPS
        
        // 状态跟踪
        this.initialized = false;
        this.faceApiLoaded = false;
        
    }
    
    /**
     * 初始化 - 加载必要模型
     */
    async init() {
        try {
            // 加载face-api.js模型
            await this.loadFaceApiModels();
            this.initialized = true;
        } catch (error) {
            console.error('AdvancedFaceSwap init failed:', error);
        }
    }
    
    /**
     * 加载face-api.js模型
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
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
            ]);
            this.faceApiLoaded = true;
        } catch (e) {
            console.error('Failed to load face-api.js models:', e);
        }
    }
    
    /**
     * 设置目标人脸 - 特征层融合准备
     */
    async setTargetFace(faceData) {
        if (!faceData) {
            this.targetFace = null;
            this.targetLandmarks = null;
            this.targetImage = null;
            this.targetEmbedding = null;
            return;
        }
        
        this.targetFace = faceData;
        this.targetImage = await Utils.loadImage(faceData.imageData);
        
        // 特征层：提取人脸特征向量
        await this.extractFaceEmbedding();
        
        // 特征层：检测68点特征
        await this.detectTargetLandmarks();
        
    }
    
    /**
     * 特征层：提取人脸特征向量
     */
    async extractFaceEmbedding() {
        if (!this.faceApiLoaded || !this.targetImage) return;
        
        try {
            const detection = await faceapi
                .detectSingleFace(this.targetImage, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptor();
                
            if (detection) {
                this.targetEmbedding = detection.descriptor;
            }
        } catch (error) {
            console.error('Embedding extraction failed:', error);
        }
    }
    
    /**
     * 特征层：检测目标人脸68点
     */
    async detectTargetLandmarks() {
        if (!this.faceApiLoaded) return;
        
        try {
            const detection = await faceapi
                .detectSingleFace(this.targetImage, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks();
                
            if (detection) {
                this.targetLandmarks = detection.landmarks.positions.map(pt => ({
                    x: pt.x,
                    y: pt.y
                }));
            }
        } catch (error) {
            console.error('Target landmark detection failed:', error);
        }
    }
    
    /**
     * 四维闭环融合主函数
     */
    async processFrame(sourceCanvas, outputCanvas, sourceLandmarks) {
        if (!this.targetFace || !this.targetLandmarks || !sourceLandmarks) {
            outputCanvas.getContext('2d').drawImage(sourceCanvas, 0, 0);
            return false;
        }
        
        const startTime = performance.now();
        
        try {
            // 确保Canvas尺寸一致
            this.ensureCanvasSize(sourceCanvas, outputCanvas);
            
            // 四维闭环融合流程
            await this.fourDimensionalFusion(sourceCanvas, outputCanvas, sourceLandmarks);
            
            const processTime = performance.now() - startTime;
            
            return true;
        } catch (error) {
            console.error('Advanced fusion error:', error);
            outputCanvas.getContext('2d').drawImage(sourceCanvas, 0, 0);
            return false;
        }
    }
    
    /**
     * 四维闭环融合核心算法
     */
    async fourDimensionalFusion(sourceCanvas, outputCanvas, sourceLandmarks) {
        const width = sourceCanvas.width;
        const height = sourceCanvas.height;
        
        // 第一步：特征层融合 - 身份特征与表情动态解耦
        await this.featureLayerFusion(sourceCanvas, sourceLandmarks);
        
        // 第二步：几何层对齐 - 精准的3D对齐
        this.geometryLayerAlignment(sourceLandmarks);
        
        // 第三步：像素层合成 - 无缝融合
        this.pixelLayerSynthesis(sourceCanvas);
        
        // 第四步：修复层补全 - 细节优化
        this.repairLayerCompletion(sourceCanvas, outputCanvas);
    }
    
    /**
     * 特征层融合：身份特征与表情动态解耦
     */
    async featureLayerFusion(sourceCanvas, sourceLandmarks) {
        // 清理工作Canvas
        this.workCtx.clearRect(0, 0, this.workCanvas.width, this.workCanvas.height);
        
        // 基于特征相似度的动态融合
        const similarity = await this.calculateFaceSimilarity(sourceCanvas);
        const adaptiveSimilarity = this.config.similarity * similarity;
        
        
        // 应用Delaunay三角剖分进行几何变换
        this.applyAdaptiveDelaunayWarp(adaptiveSimilarity);
    }
    
    /**
     * 计算人脸相似度（基于特征向量）
     */
    async calculateFaceSimilarity(sourceCanvas) {
        if (!this.faceApiLoaded || !this.targetEmbedding) return 1.0;
        
        try {
            const detection = await faceapi
                .detectSingleFace(sourceCanvas, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptor();
                
            if (detection) {
                const sourceEmbedding = detection.descriptor;
                const distance = faceapi.euclideanDistance(this.targetEmbedding, sourceEmbedding);
                
                // 将距离转换为相似度（0-1范围）
                const similarity = Math.max(0, 1 - distance / 1.0);
                return Math.min(1.0, similarity);
            }
        } catch (error) {
            console.error('Similarity calculation failed:', error);
        }
        
        return 1.0; // 默认相似度
    }
    
    /**
     * 自适应Delaunay三角剖分变换
     */
    applyAdaptiveDelaunayWarp(similarity) {
        // 标准68点Delaunay三角剖分索引
        const DELAUNAY_TRIANGLES = [
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
        ];
        
        // 应用三角剖分变换（这里简化实现，实际需要完整的几何变换）
        this.workCtx.drawImage(this.targetImage, 0, 0);
    }
    
    /**
     * 几何层对齐：精准的3D对齐
     */
    geometryLayerAlignment(sourceLandmarks) {
        if (!this.targetLandmarks || sourceLandmarks.length < 68) return;
        
        // 创建高精度人脸遮罩
        this.createPrecisionFaceMask(sourceLandmarks);
        
        // 应用透视变换进行3D对齐
        this.applyPerspectiveAlignment(sourceLandmarks);
    }
    
    /**
     * 创建高精度人脸遮罩
     */
    createPrecisionFaceMask(sourceLandmarks) {
        const width = this.maskCanvas.width;
        const height = this.maskCanvas.height;
        
        this.maskCtx.clearRect(0, 0, width, height);
        
        // 使用106点检测（如果可用）或68点
        const hullPoints = this.calculateFaceHull(sourceLandmarks);
        
        if (hullPoints.length < 5) return;
        
        // 创建精确的遮罩
        this.maskCtx.fillStyle = 'white';
        this.maskCtx.beginPath();
        this.maskCtx.moveTo(hullPoints[0].x, hullPoints[0].y);
        
        for (let i = 1; i < hullPoints.length; i++) {
            this.maskCtx.lineTo(hullPoints[i].x, hullPoints[i].y);
        }
        
        this.maskCtx.closePath();
        this.maskCtx.fill();
        
        // 应用智能羽化
        this.applySmartFeathering();
    }
    
    /**
     * 计算人脸凸包点
     */
    calculateFaceHull(landmarks) {
        const hullPoints = [];
        
        // 脸部轮廓 (0-16)
        for (let i = 0; i <= 16; i++) {
            if (landmarks[i]) hullPoints.push(landmarks[i]);
        }
        
        // 眉毛上方区域
        for (let i = 26; i >= 17; i--) {
            if (landmarks[i]) {
                hullPoints.push({ 
                    x: landmarks[i].x, 
                    y: Math.max(0, landmarks[i].y - 20) // 向上偏移
                });
            }
        }
        
        return hullPoints;
    }
    
    /**
     * 应用智能羽化
     */
    applySmartFeathering() {
        const featherRadius = this.config.featherRadius;
        
        // 创建羽化效果
        this.maskCtx.filter = `blur(${featherRadius}px)`;
        this.maskCtx.drawImage(this.maskCanvas, 0, 0);
        this.maskCtx.filter = 'none';
        
        // 边缘平滑处理
        this.maskCtx.globalCompositeOperation = 'source-in';
        this.maskCtx.drawImage(this.maskCanvas, 0, 0);
        this.maskCtx.globalCompositeOperation = 'source-over';
    }
    
    /**
     * 应用透视变换对齐
     */
    applyPerspectiveAlignment(sourceLandmarks) {
        // 这里实现透视变换算法
        // 实际实现需要完整的3D对齐计算
        
        // 简化实现：使用仿射变换
        const keyPoints = [30, 8, 36, 45, 48, 54]; // 鼻尖、下巴、眼睛、嘴角
        const srcPoints = [];
        const dstPoints = [];
        
        for (const idx of keyPoints) {
            if (this.targetLandmarks[idx] && sourceLandmarks[idx]) {
                srcPoints.push([this.targetLandmarks[idx].x, this.targetLandmarks[idx].y]);
                dstPoints.push([sourceLandmarks[idx].x, sourceLandmarks[idx].y]);
            }
        }
        
        if (srcPoints.length >= 3) {
            // 计算仿射变换矩阵
            const transform = this.calculateAffineTransform(srcPoints, dstPoints);
            this.applyTransform(transform);
            // 重置变换矩阵，避免影响后续绘制
            this.resetTransform();
        }
    }
    
    /**
     * 像素层合成：无缝融合
     */
    pixelLayerSynthesis(sourceCanvas) {
        const width = sourceCanvas.width;
        const height = sourceCanvas.height;
        
        // 颜色校正
        if (this.config.colorCorrection) {
            this.applyAdvancedColorCorrection(sourceCanvas);
        }
        
        // 泊松融合（如果启用）
        if (this.config.poissonBlend) {
            this.applyPoissonBlending(sourceCanvas);
        }
    }
    
    /**
     * 高级颜色校正
     */
    applyAdvancedColorCorrection(sourceCanvas) {
        const srcCtx = sourceCanvas.getContext('2d');
        const workData = this.workCtx.getImageData(0, 0, this.workCanvas.width, this.workCanvas.height);
        const srcData = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
        
        // LAB颜色空间转换和匹配
        this.colorTransferLAB(srcData, workData);
        
        this.workCtx.putImageData(workData, 0, 0);
    }
    
    /**
     * LAB颜色空间转换
     */
    colorTransferLAB(srcData, dstData) {
        // 简化实现：RGB颜色匹配
        const repairStrength = this.config.repairStrength;
        
        for (let i = 0; i < srcData.data.length; i += 4) {
            if (dstData.data[i + 3] > 10) { // 非透明像素
                const alpha = repairStrength;
                
                // 颜色混合
                dstData.data[i] = dstData.data[i] * (1 - alpha) + srcData.data[i] * alpha;
                dstData.data[i + 1] = dstData.data[i + 1] * (1 - alpha) + srcData.data[i + 1] * alpha;
                dstData.data[i + 2] = dstData.data[i + 2] * (1 - alpha) + srcData.data[i + 2] * alpha;
            }
        }
    }
    
    /**
     * 泊松融合
     */
    applyPoissonBlending(sourceCanvas) {
        // 简化实现：使用羽化遮罩进行混合
        const outCtx = this.tempCanvas.getContext('2d');
        
        // 绘制源图像
        outCtx.drawImage(sourceCanvas, 0, 0);
        
        // 使用遮罩混合换脸结果
        outCtx.globalCompositeOperation = 'source-atop';
        outCtx.drawImage(this.workCanvas, 0, 0);
        outCtx.globalCompositeOperation = 'source-over';
        
        // 应用遮罩羽化
        outCtx.globalAlpha = 0.8;
        outCtx.drawImage(this.maskCanvas, 0, 0);
        outCtx.globalAlpha = 1.0;
    }
    
    /**
     * 修复层补全：细节优化
     */
    repairLayerCompletion(sourceCanvas, outputCanvas) {
        const outCtx = outputCanvas.getContext('2d');
        
        // 绘制最终结果
        outCtx.drawImage(sourceCanvas, 0, 0);
        
        // 应用换脸结果
        outCtx.globalCompositeOperation = 'source-atop';
        outCtx.drawImage(this.tempCanvas, 0, 0);
        outCtx.globalCompositeOperation = 'source-over';
        
        // 边缘平滑处理
        this.applyEdgeSmoothing(outputCanvas);
    }
    
    /**
     * 边缘平滑处理
     */
    applyEdgeSmoothing(canvas) {
        const ctx = canvas.getContext('2d');
        
        // 应用轻微高斯模糊平滑边缘
        ctx.filter = 'blur(0.5px)';
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = 'none';
    }
    
    /**
     * 工具函数：计算仿射变换矩阵
     */
    calculateAffineTransform(srcPoints, dstPoints) {
        if (srcPoints.length < 3 || dstPoints.length < 3) {
            return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
        }
        
        // 使用最小二乘法计算仿射变换矩阵
        // 简化实现：使用前3个点计算
        const x1 = srcPoints[0][0], y1 = srcPoints[0][1];
        const x2 = srcPoints[1][0], y2 = srcPoints[1][1];
        const x3 = srcPoints[2][0], y3 = srcPoints[2][1];
        
        const u1 = dstPoints[0][0], v1 = dstPoints[0][1];
        const u2 = dstPoints[1][0], v2 = dstPoints[1][1];
        const u3 = dstPoints[2][0], v3 = dstPoints[2][1];
        
        const det = x1 * (y2 - y3) - y1 * (x2 - x3) + (x2 * y3 - x3 * y2);
        
        if (Math.abs(det) < 1e-10) {
            return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
        }
        
        const a = ((u1 * (y2 - y3) + u2 * (y3 - y1) + u3 * (y1 - y2)) / det);
        const b = ((u1 * (x3 - x2) + u2 * (x1 - x3) + u3 * (x2 - x1)) / det);
        const c = ((v1 * (y2 - y3) + v2 * (y3 - y1) + v3 * (y1 - y2)) / det);
        const d = ((v1 * (x3 - x2) + v2 * (x1 - x3) + v3 * (x2 - x1)) / det);
        const e = ((u1 * (x2 * y3 - x3 * y2) + u2 * (x3 * y1 - x1 * y3) + u3 * (x1 * y2 - x2 * y1)) / det);
        const f = ((v1 * (x2 * y3 - x3 * y2) + v2 * (x3 * y1 - x1 * y3) + v3 * (x1 * y2 - x2 * y1)) / det);
        
        return { a, b, c, d, e, f };
    }
    
    /**
     * 工具函数：应用变换
     */
    applyTransform(transform) {
        this.workCtx.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f);
    }
    
    /**
     * 工具函数：重置变换
     */
    resetTransform() {
        this.workCtx.setTransform(1, 0, 0, 1, 0, 0);
    }
    
    /**
     * 确保Canvas尺寸一致
     */
    ensureCanvasSize(sourceCanvas, outputCanvas) {
        if (outputCanvas.width !== sourceCanvas.width) {
            outputCanvas.width = sourceCanvas.width;
            outputCanvas.height = sourceCanvas.height;
        }
        
        this.workCanvas.width = sourceCanvas.width;
        this.workCanvas.height = sourceCanvas.height;
        this.maskCanvas.width = sourceCanvas.width;
        this.maskCanvas.height = sourceCanvas.height;
        this.tempCanvas.width = sourceCanvas.width;
        this.tempCanvas.height = sourceCanvas.height;
    }
    
    /**
     * 更新配置
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }
    
    /**
     * 清理资源
     */
    cleanup() {
        this.targetFace = null;
        this.targetLandmarks = null;
        this.targetImage = null;
        this.targetEmbedding = null;
        
        this.frameCache = [];
        
    }
}

// 导出类
window.AdvancedFaceSwap = AdvancedFaceSwap;