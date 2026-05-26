/**
 * 人脸检测模块 - 使用MediaPipe Face Mesh
 */

const FaceDetector = {
    // Face Mesh实例
    faceMesh: null,
    // 是否已初始化
    initialized: false,
    // 是否正在加载
    loading: false,
    // 最新检测结果
    lastResults: null,
    // 检测回调
    onResultsCallback: null,
    // 是否检测到人脸
    faceDetected: false,
    // 连续丢失帧计数
    lostFrameCount: 0,
    // 丢失阈值
    lostThreshold: 10,
    // 脸部跟踪稳定性增强
    faceTracking: {
        // 历史帧缓存
        history: [],
        maxHistory: 5,
        // 预测算法
        predictionEnabled: true,
        // 插值平滑
        smoothingFactor: 0.7,
        // 角度变化阈值
        maxAngleChange: 30,
        // 位置变化阈值
        maxPositionChange: 0.3
    },

    // 关键人脸特征点索引 (MediaPipe Face Mesh 468点)
    LANDMARKS: {
        // 脸部轮廓 (36个点)
        FACE_OVAL: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
        
        // 左眼 (16个点)
        LEFT_EYE: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
        
        // 右眼 (16个点)
        RIGHT_EYE: [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],
        
        // 左眉毛 (8个点)
        LEFT_EYEBROW: [70, 63, 105, 66, 107, 55, 65, 52],
        
        // 右眉毛 (8个点)
        RIGHT_EYEBROW: [300, 293, 334, 296, 336, 285, 295, 282],
        
        // 鼻子 (9个点)
        NOSE: [1, 2, 98, 327, 4, 5, 6, 168, 197],
        
        // 嘴唇外轮廓 (20个点)
        LIPS_OUTER: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
        
        // 嘴唇内轮廓 (8个点)
        LIPS_INNER: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13],

        // 用于换脸的核心点 (简化版，68点兼容)
        CORE_68: [
            // 脸部轮廓 (17点)
            10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 152,
            // 左眉毛 (5点)
            70, 63, 105, 66, 107,
            // 右眉毛 (5点)
            336, 296, 334, 293, 300,
            // 鼻梁 (4点)
            168, 6, 197, 195,
            // 鼻子下部 (5点)
            4, 45, 220, 115, 48,
            // 左眼 (6点)
            33, 160, 158, 133, 153, 144,
            // 右眼 (6点)
            362, 385, 387, 263, 373, 380,
            // 外唇 (12点)
            61, 40, 37, 0, 267, 269, 291, 405, 314, 17, 84, 181,
            // 内唇 (8点)
            78, 82, 13, 312, 308, 317, 14, 87
        ]
    },

    /**
     * 初始化人脸检测器
     * @param {Function} onProgress - 加载进度回调
     */
    async init(onProgress) {
        if (this.initialized || this.loading) {
            return this.initialized;
        }

        this.loading = true;
        
        try {
            if (onProgress) onProgress(0, '正在加载人脸检测模型...');
            
            // 检查FaceMesh是否可用
            const FaceMeshClass = window.FaceMesh;
            if (!FaceMeshClass) {
                console.warn('MediaPipe FaceMesh 库未加载，将使用API模式进行换脸');
                this.loading = false;
                this.initialized = false;
                // 不抛出错误，允许应用继续运行
                return false;
            }
            
            // 创建Face Mesh实例
            this.faceMesh = new FaceMeshClass({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
                }
            });

            // 配置选项
            this.faceMesh.setOptions({
                maxNumFaces: 1,           // 只检测一个人脸
                refineLandmarks: true,    // 精细化特征点
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            // 设置结果回调
            this.faceMesh.onResults((results) => {
                this.handleResults(results);
            });

            if (onProgress) onProgress(50, '正在初始化模型...');

            // 预热模型 - 使用空白canvas
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = 640;
            tempCanvas.height = 480;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.fillStyle = '#000000';
            tempCtx.fillRect(0, 0, 640, 480);
            
            await this.faceMesh.send({ image: tempCanvas });

            if (onProgress) onProgress(100, '模型加载完成');

            this.initialized = true;
            this.loading = false;
            
            return true;
        } catch (error) {
            console.warn('FaceDetector init failed, will use API mode:', error.message);
            this.loading = false;
            this.initialized = false;
            // 不抛出错误，允许应用继续运行
            return false;
        }
    },

    /**
     * 处理检测结果
     */
    handleResults(results) {
        this.lastResults = results;
        
        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            this.faceDetected = true;
            this.lostFrameCount = 0;
            
            // 增强脸部跟踪稳定性
            this.enhanceFaceTracking(results);
        } else {
            this.lostFrameCount++;
            if (this.lostFrameCount > this.lostThreshold) {
                this.faceDetected = false;
                // 清空历史记录
                this.faceTracking.history = [];
            }
        }
        
        if (this.onResultsCallback) {
            this.onResultsCallback(results, this.faceDetected);
        }
    },

    /**
     * 增强脸部跟踪稳定性 - 参考Deep-Live-Cam算法
     */
    enhanceFaceTracking(results) {
        if (!this.faceTracking.predictionEnabled) return;
        
        const currentFace = results.multiFaceLandmarks[0];
        
        // 计算当前帧的人脸中心点
        const currentCenter = this.calculateFaceCenter(currentFace);
        
        // 添加到历史记录
        this.faceTracking.history.push({
            landmarks: currentFace,
            center: currentCenter,
            timestamp: Date.now()
        });
        
        // 保持历史记录长度
        if (this.faceTracking.history.length > this.faceTracking.maxHistory) {
            this.faceTracking.history.shift();
        }
        
        // 如果历史记录足够，进行平滑处理
        if (this.faceTracking.history.length >= 2) {
            this.applySmoothing(results);
        }
    },

    /**
     * 计算人脸中心点
     */
    calculateFaceCenter(landmarks) {
        let sumX = 0, sumY = 0, sumZ = 0;
        const count = landmarks.length;
        
        landmarks.forEach(point => {
            sumX += point.x;
            sumY += point.y;
            sumZ += point.z;
        });
        
        return {
            x: sumX / count,
            y: sumY / count,
            z: sumZ / count
        };
    },

    /**
     * 应用平滑处理
     */
    applySmoothing(results) {
        const current = this.faceTracking.history[this.faceTracking.history.length - 1];
        const previous = this.faceTracking.history[this.faceTracking.history.length - 2];
        
        // 计算移动向量
        const dx = current.center.x - previous.center.x;
        const dy = current.center.y - previous.center.y;
        
        // 计算移动距离
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 如果移动过大，应用平滑
        if (distance > this.faceTracking.maxPositionChange) {
            const smoothing = this.faceTracking.smoothingFactor;
            const currentLandmarks = results.multiFaceLandmarks[0];
            
            // 对当前特征点进行平滑处理
            for (let i = 0; i < currentLandmarks.length; i++) {
                currentLandmarks[i].x = previous.landmarks[i].x * (1 - smoothing) + currentLandmarks[i].x * smoothing;
                currentLandmarks[i].y = previous.landmarks[i].y * (1 - smoothing) + currentLandmarks[i].y * smoothing;
                currentLandmarks[i].z = previous.landmarks[i].z * (1 - smoothing) + currentLandmarks[i].z * smoothing;
            }
        }
    },

    /**
     * 检测单帧
     * @param {HTMLVideoElement|HTMLCanvasElement|HTMLImageElement} input - 输入源
     */
    async detect(input) {
        if (!this.initialized) {
            console.warn('FaceDetector not initialized');
            return null;
        }
        
        try {
            await this.faceMesh.send({ image: input });
            return this.lastResults;
        } catch (error) {
            console.error('Detection error:', error);
            return null;
        }
    },

    /**
     * 设置结果回调
     * @param {Function} callback - 回调函数
     */
    setOnResults(callback) {
        this.onResultsCallback = callback;
    },

    /**
     * 获取归一化的特征点坐标
     * @param {object} results - 检测结果
     * @param {number} width - 图像宽度
     * @param {number} height - 图像高度
     * @returns {Array} - 特征点数组 [{x, y, z}, ...]
     */
    getLandmarks(results, width, height) {
        if (!results || !results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            return null;
        }
        
        const landmarks = results.multiFaceLandmarks[0];
        
        // 转换为像素坐标
        return landmarks.map(point => ({
            x: point.x * width,
            y: point.y * height,
            z: point.z * width  // z也使用width进行缩放
        }));
    },

    /**
     * 获取68点兼容的特征点
     */
    get68Landmarks(results, width, height) {
        const fullLandmarks = this.getLandmarks(results, width, height);
        if (!fullLandmarks) return null;
        
        return this.LANDMARKS.CORE_68.map(idx => fullLandmarks[idx]);
    },

    /**
     * 获取人脸边界框
     * @param {object} results - 检测结果
     * @param {number} width - 图像宽度
     * @param {number} height - 图像高度
     */
    getBoundingBox(results, width, height) {
        const landmarks = this.getLandmarks(results, width, height);
        if (!landmarks) return null;
        
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        landmarks.forEach(point => {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        });
        
        // 添加一些边距
        const padding = 0.1;
        const w = maxX - minX;
        const h = maxY - minY;
        
        return {
            x: Math.max(0, minX - w * padding),
            y: Math.max(0, minY - h * padding),
            width: Math.min(width - minX, w * (1 + padding * 2)),
            height: Math.min(height - minY, h * (1 + padding * 2))
        };
    },

    /**
     * 获取人脸角度（旋转）
     */
    getFaceRotation(results, width, height) {
        const landmarks = this.getLandmarks(results, width, height);
        if (!landmarks) return null;
        
        // 使用鼻子和眼睛来计算旋转
        const leftEye = landmarks[33];   // 左眼内角
        const rightEye = landmarks[263]; // 右眼内角
        const noseTip = landmarks[1];    // 鼻尖
        
        // 计算偏航角 (yaw) - 左右旋转
        const eyeCenter = {
            x: (leftEye.x + rightEye.x) / 2,
            y: (leftEye.y + rightEye.y) / 2
        };
        
        // 计算俯仰角 (pitch) - 上下旋转
        const eyeDistance = Utils.distance(leftEye, rightEye);
        const noseToEye = noseTip.y - eyeCenter.y;
        const pitch = Math.atan2(noseToEye, eyeDistance);
        
        // 计算滚转角 (roll) - 倾斜
        const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
        
        // 计算偏航角 (使用3D坐标)
        const yaw = Math.atan2(noseTip.z - eyeCenter.x, eyeDistance);
        
        return {
            pitch: Utils.radToDeg(pitch),
            yaw: Utils.radToDeg(yaw),
            roll: Utils.radToDeg(roll)
        };
    },

    /**
     * 从图片检测人脸
     * @param {HTMLImageElement|string} image - 图片元素或URL
     */
    async detectFromImage(image) {
        if (!this.initialized) {
            throw new Error('FaceDetector not initialized');
        }
        
        // 如果是URL，先加载图片
        let img = image;
        if (typeof image === 'string') {
            img = await Utils.loadImage(image);
        }
        
        // 检测人脸
        await this.faceMesh.send({ image: img });
        
        return {
            results: this.lastResults,
            detected: this.lastResults?.multiFaceLandmarks?.length > 0,
            landmarks: this.getLandmarks(this.lastResults, img.width, img.height)
        };
    },

    /**
     * 验证图片中是否有有效人脸
     * @param {HTMLImageElement|string} image - 图片
     */
    async validateFace(image) {
        const detection = await this.detectFromImage(image);
        
        if (!detection.detected) {
            return {
                valid: false,
                reason: '未检测到人脸'
            };
        }
        
        // 获取边界框检查人脸大小
        let img = image;
        if (typeof image === 'string') {
            img = await Utils.loadImage(image);
        }
        
        const bbox = this.getBoundingBox(this.lastResults, img.width, img.height);
        const faceArea = bbox.width * bbox.height;
        const imageArea = img.width * img.height;
        const faceRatio = faceArea / imageArea;
        
        // 人脸太小
        if (faceRatio < 0.05) {
            return {
                valid: false,
                reason: '人脸太小，请使用更大的人脸图片'
            };
        }
        
        // 角度检测仅作为参考，不阻止上传
        const rotation = this.getFaceRotation(this.lastResults, img.width, img.height);
        // 不再限制角度，允许所有人脸图片
        
        return {
            valid: true,
            landmarks: detection.landmarks,
            boundingBox: bbox,
            rotation
        };
    },

    /**
     * 绘制特征点（调试用）
     * @param {CanvasRenderingContext2D} ctx - Canvas上下文
     * @param {object} results - 检测结果
     * @param {number} width - 画布宽度
     * @param {number} height - 画布高度
     */
    drawLandmarks(ctx, results, width, height) {
        const landmarks = this.getLandmarks(results, width, height);
        if (!landmarks) return;
        
        ctx.fillStyle = '#00ff00';
        landmarks.forEach((point, index) => {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 1, 0, Math.PI * 2);
            ctx.fill();
        });
        
        // 绘制轮廓连接线
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
        ctx.lineWidth = 1;
        
        // 脸部轮廓
        this.drawConnections(ctx, landmarks, this.LANDMARKS.FACE_OVAL, true);
        
        // 眼睛
        this.drawConnections(ctx, landmarks, this.LANDMARKS.LEFT_EYE, true);
        this.drawConnections(ctx, landmarks, this.LANDMARKS.RIGHT_EYE, true);
        
        // 嘴唇
        this.drawConnections(ctx, landmarks, this.LANDMARKS.LIPS_OUTER, true);
    },

    /**
     * 绘制连接线
     */
    drawConnections(ctx, landmarks, indices, closed = false) {
        if (indices.length < 2) return;
        
        ctx.beginPath();
        const firstPoint = landmarks[indices[0]];
        ctx.moveTo(firstPoint.x, firstPoint.y);
        
        for (let i = 1; i < indices.length; i++) {
            const point = landmarks[indices[i]];
            ctx.lineTo(point.x, point.y);
        }
        
        if (closed) {
            ctx.closePath();
        }
        
        ctx.stroke();
    },

    /**
     * 是否已检测到人脸
     */
    isFaceDetected() {
        return this.faceDetected;
    },

    /**
     * 获取最新结果
     */
    getLastResults() {
        return this.lastResults;
    },

    /**
     * 重置状态
     */
    reset() {
        this.lastResults = null;
        this.faceDetected = false;
        this.lostFrameCount = 0;
    },

    /**
     * 销毁实例
     */
    destroy() {
        if (this.faceMesh) {
            this.faceMesh.close();
            this.faceMesh = null;
        }
        this.initialized = false;
        this.reset();
    }
};

// 导出到全局
window.FaceDetector = FaceDetector;
