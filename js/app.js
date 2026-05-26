/**
 * 主应用入口
 * 协调各模块工作
 * 支持后端API换脸（高质量）和本地换脸（降级方案）
 */

// 安全保护模块 - 防止调试和F12
(function() {
    'use strict';
    
    // 禁用右键菜单
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        return false;
    });
    
    // 禁用F12、Ctrl+Shift+I、Ctrl+U等快捷键
    document.addEventListener('keydown', function(e) {
        // F12
        if (e.keyCode === 123) {
            e.preventDefault();
            return false;
        }
        // Ctrl+Shift+I
        if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
            e.preventDefault();
            return false;
        }
        // Ctrl+Shift+J
        if (e.ctrlKey && e.shiftKey && e.keyCode === 74) {
            e.preventDefault();
            return false;
        }
        // Ctrl+U
        if (e.ctrlKey && e.keyCode === 85) {
            e.preventDefault();
            return false;
        }
    });
    
    // 检测开发者工具打开
    let devToolsOpen = false;
    const threshold = 160;
    
    const checkDevTools = function() {
        const widthThreshold = window.outerWidth - window.innerWidth > threshold;
        const heightThreshold = window.outerHeight - window.innerHeight > threshold;
        
        if (widthThreshold || heightThreshold) {
            if (!devToolsOpen) {
                devToolsOpen = true;
                // 开发者工具打开时，可以执行一些操作
                console.clear();
            }
        } else {
            devToolsOpen = false;
        }
    };
    
    // 定期检查
    setInterval(checkDevTools, 1000);
    
    // 禁用拖放
    document.addEventListener('dragstart', function(e) {
        e.preventDefault();
    });
    
    // 禁用选择文本（可选）
    // document.addEventListener('selectstart', function(e) {
    //     e.preventDefault();
    // });
})();

const App = {
    // 状态
    state: {
        initialized: false,
        cameraReady: false,
        detectorReady: false,
        isSwapping: false,
        targetFace: null,
        performanceLevel: 'medium',
        // 换脸模式: 'api' (后端高质量) 或 'local' (本地降级)
        swapMode: 'api',
        apiConnected: false
    },
    
    // 渲染循环ID
    animationFrameId: null,
    
    // 工作Canvas
    sourceCanvas: null,
    
    // FPS计数器
    fpsCounter: null,
    latencyTracker: null,
    
    // 当前设置
    settings: null,
    
    // API请求节流控制
    lastApiCallTime: 0,
    apiCallInterval: 200,  // API调用最小间隔（毫秒）- 降低频率减少卡顿
    pendingApiCall: false,
    lastSwappedImage: null, // 缓存上一次换脸结果
    
    // 比例裁剪区域（9:16竖屏时从中心裁剪）
    cropRegion: null,

    /**
     * 初始化应用
     */
    async init() {
        
        try {
            // 检查浏览器兼容性
            const compatibility = Utils.checkBrowserCompatibility();
            if (!compatibility.compatible) {
                const criticalFeatures = ['webGL', 'indexedDB', 'localStorage'];
                const criticalUnsupported = compatibility.unsupported.filter(feature => criticalFeatures.includes(feature));
                
                if (criticalUnsupported.length > 0) {
                    Utils.showToast(`浏览器不支持以下关键功能: ${criticalUnsupported.join(', ')}`, 'error');
                    return false;
                }
                
                // 非关键功能不阻止应用启动，只显示警告
                Utils.showToast('部分功能可能不可用，应用将以有限模式运行', 'warning');
            }
            
            // 无论是否支持getUserMedia，都继续运行
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                Utils.showToast('未检测到摄像头功能，将在选择人脸后尝试使用本地文件模式', 'warning');
            }
            
            // 初始化存储
            await StorageManager.init();
            
            // 加载设置
            this.settings = StorageManager.getSettings();
            
            // 加载API配置
            if (this.settings.apiUrl) {
                ApiClient.setBaseUrl(this.settings.apiUrl);
            }
            
            // 初始化UI
            UI.init();
            UI.loadSettings();
            
            // 初始化换脸模块（本地降级方案）
            FaceSwap.init();
            
            // 初始化高级换脸模块（如果可用）
            if (typeof AdvancedFaceSwap !== 'undefined') {
                try {
                    this.advancedFaceSwap = new AdvancedFaceSwap();
                    await this.advancedFaceSwap.init();
                } catch (e) {
                    console.warn('AdvancedFaceSwap initialization failed:', e);
                    this.advancedFaceSwap = null;
                }
            } else {
                console.warn('AdvancedFaceSwap class not available');
                this.advancedFaceSwap = null;
            }
            
            // 创建工作Canvas
            this.sourceCanvas = document.createElement('canvas');
            
            // 创建FPS和延迟跟踪器
            this.fpsCounter = Utils.createFpsCounter();
            this.latencyTracker = Utils.createLatencyTracker();
            
            // 检测设备性能
            await this.detectPerformance();
            
            // 初始化摄像头
            await this.initCamera();
            
            // 加载人脸素材
            await UI.refreshFaceGrid();
            
            // 加载已选中的素材
            const selectedFace = await StorageManager.getSelectedFace();
            if (selectedFace) {
                await this.onFaceSelected(selectedFace);
            }
            
            // 检查API服务连接
            this.checkApiConnection();
            
            // 检查是否首次访问
            if (this.settings.firstVisit) {
                setTimeout(() => {
                    UI.showTutorial();
                    StorageManager.saveSettings({ firstVisit: false });
                }, 1000);
            }
            
            this.state.initialized = true;
            
            return true;
        } catch (error) {
            console.error('App initialization error:', error);
            Utils.showToast('应用初始化失败: ' + error.message, 'error');
            return false;
        }
    },
    
    /**
     * 检查API服务连接
     */
    async checkApiConnection() {
        UI.updateApiStatus('checking', '正在连接...');
        
        const result = await ApiClient.healthCheck();
        
        if (result.status === 'ok') {
            this.state.apiConnected = true;
            this.state.swapMode = 'api';
            UI.updateApiStatus('connected', 'API已连接');
            Utils.showToast('已连接到换脸服务器，将使用高质量换脸', 'success');
        } else {
            this.state.apiConnected = false;
            this.state.swapMode = 'local';
            UI.updateApiStatus('disconnected', 'API未连接');
            // 不显示错误提示，因为本地模式也可以工作
        }
        
        return this.state.apiConnected;
    },
    
    /**
     * 切换换脸模式
     */
    setSwapMode(mode) {
        if (mode === 'api' && !this.state.apiConnected) {
            Utils.showToast('API服务未连接，无法切换到高质量模式', 'error');
            return false;
        }
        this.state.swapMode = mode;
        Utils.showToast(mode === 'api' ? '已切换到高质量模式' : '已切换到本地模式', 'info');
        return true;
    },

    /**
     * 检测设备性能
     */
    async detectPerformance() {
        try {
            const performance = await Utils.detectPerformance();
            this.state.performanceLevel = performance.level;
            
            UI.updatePerformanceMode(performance.level);
            UI.updateGpuStatus(true, performance.gpuInfo);
            
            
            // 根据性能自动调整设置
            if (performance.level === 'low' && !this.settings.powerSaveMode) {
                Utils.showToast('检测到设备性能较低，建议开启节能模式', 'info');
            }
        } catch (error) {
            console.warn('Performance detection failed:', error);
        }
    },

    /**
     * 初始化摄像头
     */
    async initCamera() {
        // 获取视频元素
        const videoElement = document.getElementById('originalVideo');
        
        // 检查摄像头是否可用
        if (!CameraManager.isAvailable()) {
            Utils.showToast('未检测到摄像头功能，将在选择人脸后尝试使用本地文件模式', 'warning');
            UI.updateCameraStatus(false);
            UI.updateCameraList([]); // 清空摄像头列表
            return false;
        }
        
        try {
            // 初始化摄像头管理器
            const devices = await CameraManager.init(videoElement);
            
            // 更新摄像头列表
            UI.updateCameraList(devices);
            
            // 监听设备变化
            CameraManager.onDeviceChange((newDevices) => {
                UI.updateCameraList(newDevices);
            });
            
            // 如果有保存的摄像头ID，使用它
            const savedCameraId = this.settings.cameraId;
            
            // 现在固定使用720p分辨率以获得最佳效果
            const resolution = 720;
            
            // 尝试获取摄像头原始输出，不强制横屏
            const result = await CameraManager.start(savedCameraId, { 
                width: { ideal: resolution === 720 ? 1280 : 640 },
                height: { ideal: resolution === 720 ? 720 : 480 }
            });
            
            if (result.success) {
                this.state.cameraReady = true;
                UI.updateCameraStatus(true);
                
                // 设置源Canvas尺寸（摄像头实际尺寸）
                this.sourceCanvas.width = result.settings.width;
                this.sourceCanvas.height = result.settings.height;
                
                // 设置输出Canvas尺寸（根据比例）
                const aspect = this.settings.aspectRatio || '9:16';
                this.updateOutputCanvasSize(aspect, result.settings.width, result.settings.height);
                
            } else {
                UI.updateCameraStatus(false);
                Utils.showToast(`摄像头启动失败: ${result.error}，将在选择人脸后尝试使用本地文件模式`, 'warning');
            }
            
            return result.success;
        } catch (error) {
            console.error('Camera initialization error:', error);
            UI.updateCameraStatus(false);
            UI.updateCameraList([]); // 清空摄像头列表
            Utils.showToast(`摄像头初始化失败: ${error.message}，将在选择人脸后尝试使用本地文件模式`, 'warning');
            return false;
        }
    },

    /**
     * 初始化人脸检测器
     */
    async initDetector() {
        if (this.state.detectorReady) return true;
        
        try {
            Utils.showLoading('正在加载人脸检测模型...');
            
            const success = await FaceDetector.init((progress, message) => {
                document.getElementById('loadingText').textContent = message;
            });
            
            Utils.hideLoading();
            
            if (success) {
                this.state.detectorReady = true;
            } else {
                // MediaPipe 不可用，但可以使用 API 模式
                this.state.detectorReady = false;
                // 强制使用 API 模式
                if (this.state.apiConnected) {
                    this.state.swapMode = 'api';
                }
            }
            
            return true;  // 允许继续（可以用API模式）
        } catch (error) {
            Utils.hideLoading();
            console.warn('Detector init error:', error);
            // 不阻止应用运行，可以使用API模式
            return true;
        }
    },

    /**
     * 开始换脸
     */
    async startSwap() {
        // 检查是否有目标人脸
        if (!this.state.targetFace) {
            Utils.showToast('请先选择一个目标人脸素材', 'error');
            return;
        }
        
        // 初始化人脸检测器（懒加载）- 本地模式需要
        if (!this.state.detectorReady) {
            const success = await this.initDetector();
            if (!success) return;
        }
        
        // 检查摄像头是否就绪
        if (!this.state.cameraReady) {
            // 摄像头未就绪，尝试使用本地文件模式
            Utils.showToast('摄像头未就绪，尝试使用本地文件模式', 'warning');
            this.startLocalFileMode();
            return;
        }
        
        // 如果使用API模式，先设置源人脸
        if (this.state.swapMode === 'api' && this.state.apiConnected) {
            Utils.showLoading('正在设置目标人脸...');
            const result = await ApiClient.setSourceFace(this.state.targetFace.imageData);
            Utils.hideLoading();
            
            if (!result.success) {
                Utils.showToast(`设置目标人脸失败: ${result.error}，将使用本地模式`, 'warning');
                this.state.swapMode = 'local';
            }
        }
        
        // 设置换脸参数（本地模式用）
        FaceSwap.updateConfig({
            similarity: this.settings.similarity / 100,
            repairStrength: this.settings.repairStrength / 100
        });
        
        // 设置目标人脸（本地模式用）
        await FaceSwap.setTargetFace(this.state.targetFace);
        
        // 设置检测回调
        FaceDetector.setOnResults((results, detected) => {
            UI.updateFaceStatus(detected);
        });
        
        // 开始状态
        this.state.isSwapping = true;
        UI.setSwapButtonState(true);
        UI.updateSwapStatus(this.state.swapMode === 'api' ? '高质量换脸中...' : '本地换脸中...');
        
        // 开始渲染循环
        this.startRenderLoop();
        
        Utils.showToast(`换脸已开始 (${this.state.swapMode === 'api' ? '高质量模式' : '本地模式'})`, 'success');
    },
    
    /**
     * 开始本地文件模式
     */
    startLocalFileMode() {
        // 显示文件上传对话框
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,video/*';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                Utils.showLoading('正在处理文件...');
                
                if (file.type.startsWith('image/')) {
                    // 处理图片文件
                    await this.processLocalImage(file);
                } else if (file.type.startsWith('video/')) {
                    // 处理视频文件
                    await this.processLocalVideo(file);
                } else {
                    Utils.showToast('不支持的文件类型', 'error');
                }
            } catch (error) {
                console.error('Local file processing error:', error);
                Utils.showToast(`文件处理失败: ${error.message}`, 'error');
            } finally {
                Utils.hideLoading();
            }
        };
        
        input.click();
    },
    
    /**
     * 处理本地图片文件
     */
    async processLocalImage(file) {
        const dataURL = await Utils.blobToDataURL(file);
        const img = await Utils.loadImage(dataURL);
        
        // 设置Canvas尺寸
        this.sourceCanvas.width = img.width;
        this.sourceCanvas.height = img.height;
        
        const swappedCanvas = document.getElementById('swappedCanvas');
        swappedCanvas.width = img.width;
        swappedCanvas.height = img.height;
        
        // 绘制图片到工作Canvas
        const ctx = this.sourceCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0, this.sourceCanvas.width, this.sourceCanvas.height);
        
        // 执行换脸
        await this.renderLocal(this.sourceCanvas, swappedCanvas, performance.now());
        
        Utils.showToast('图片换脸完成', 'success');
    },
    
    /**
     * 处理本地视频文件
     */
    async processLocalVideo(file) {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        
        video.onloadedmetadata = async () => {
            // 设置Canvas尺寸
            this.sourceCanvas.width = video.videoWidth;
            this.sourceCanvas.height = video.videoHeight;
            
            const swappedCanvas = document.getElementById('swappedCanvas');
            swappedCanvas.width = video.videoWidth;
            swappedCanvas.height = video.videoHeight;
            
            // 播放视频
            video.play();
            
            // 开始渲染循环
            this.startVideoRenderLoop(video);
        };
        
        video.onerror = () => {
            Utils.showToast('视频加载失败', 'error');
        };
    },
    
    /**
     * 视频渲染循环
     */
    startVideoRenderLoop(video) {
        const swappedCanvas = document.getElementById('swappedCanvas');
        
        const render = async () => {
            if (!video.paused && !video.ended) {
                // 绘制视频帧到工作Canvas
                const ctx = this.sourceCanvas.getContext('2d');
                ctx.drawImage(video, 0, 0, this.sourceCanvas.width, this.sourceCanvas.height);
                
                // 执行换脸
                await this.renderLocal(this.sourceCanvas, swappedCanvas, performance.now());
                
                requestAnimationFrame(render);
            } else {
                Utils.showToast('视频换脸完成', 'success');
            }
        };
        
        render();
    },

    /**
     * 停止换脸
     */
    async stopSwap() {
        this.state.isSwapping = false;
        
        // 停止渲染循环
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        UI.setSwapButtonState(false);
        UI.updateSwapStatus('已停止');
        
        // 清空换脸画布
        const swappedCanvas = document.getElementById('swappedCanvas');
        const ctx = swappedCanvas.getContext('2d');
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(0, 0, swappedCanvas.width, swappedCanvas.height);
        
        Utils.showToast('换脸已停止', 'info');
    },

    /**
     * 开始渲染循环 - 优化版
     */
    startRenderLoop() {
        const originalVideo = document.getElementById('originalVideo');
        const swappedCanvas = document.getElementById('swappedCanvas');
        
        // 帧跳过计数器（禁用 - 保证流畅度）
        let frameCount = 0;
        const skipFrames = 0;  // 不跳帧
        
        // 禁用自适应帧率控制
        let adaptiveSkip = 0;
        
        const render = async () => {
            if (!this.state.isSwapping) return;
            
            const startTime = performance.now();
            
            frameCount++;
            
            // 帧跳过逻辑 - 结合节能模式和自适应跳帧
            const totalSkip = Math.max(skipFrames, adaptiveSkip);
            if (frameCount % (totalSkip + 1) !== 0) {
                this.animationFrameId = requestAnimationFrame(render);
                return;
            }
            
            try {
                // 捕获当前帧到工作Canvas
                if (CameraManager.captureFrame(this.sourceCanvas)) {
                    // 根据模式选择换脸方法
                    if (this.state.swapMode === 'api' && this.state.apiConnected) {
                        await this.renderWithApi(this.sourceCanvas, swappedCanvas, startTime);
                    } else {
                        await this.renderLocal(this.sourceCanvas, swappedCanvas, startTime);
                    }
                }
                
                // 禁用自适应帧率控制 - 保证流畅度
                // lastLatency = this.latencyTracker.getAverage();
                // if (lastLatency > 150) {
                //     adaptiveSkip = Math.min(adaptiveSkip + 1, 3);
                // } else if (lastLatency < 80 && adaptiveSkip > 0) {
                //     adaptiveSkip = Math.max(adaptiveSkip - 1, 0);
                // }
            } catch (error) {
                console.error('Render error:', error);
            }
            
            this.animationFrameId = requestAnimationFrame(render);
        };
        
        this.animationFrameId = requestAnimationFrame(render);
    },
    
    /**
     * 使用后端API进行高质量换脸
     */
    async renderWithApi(sourceCanvas, swappedCanvas, startTime) {
        const ctx = swappedCanvas.getContext('2d');
        const now = performance.now();
        
        // 如果有上一帧缓存，先显示缓存（保持画面连续）
        if (this.lastSwappedImage && (this.pendingApiCall || now - this.lastApiCallTime < this.apiCallInterval)) {
            this.drawToCanvas(ctx, this.lastSwappedImage, swappedCanvas);
            return;
        }
        
        // 如果正在请求中，跳过
        if (this.pendingApiCall) {
            return;
        }
        
        this.pendingApiCall = true;
        this.lastApiCallTime = now;
        
        try {
            // 固定使用高质量压缩 - 保证换脸效果
            const quality = 0.9;
            
            // 将Canvas转为Base64
            const imageData = sourceCanvas.toDataURL('image/jpeg', quality);
            
            // 调用API换脸
            const result = await ApiClient.swapFace(imageData);
            
            if (result.success && result.image) {
                // 检查是否未检测到人脸但返回了缓存
                if (result.noFace && this.lastSwappedImage) {
                    // 未检测到人脸，但有缓存，继续显示缓存
                    this.drawToCanvas(ctx, this.lastSwappedImage, swappedCanvas);
                    return;
                }
                
                // 将返回的图片绘制到输出Canvas
                const img = await Utils.loadImage(result.image);
                
                // 只有成功换脸才缓存（不是 noFace 情况）
                if (!result.noFace) {
                    this.lastSwappedImage = img;
                }
                
                // 应用裁剪绘制
                this.drawToCanvas(ctx, img, swappedCanvas);
                
                // 更新统计
                const fps = this.fpsCounter.tick();
                const latency = result.processTime || (performance.now() - startTime);
                this.latencyTracker.record(latency);
                
                UI.updateFps(CameraManager.getFps(), fps);
                UI.updateLatency(this.latencyTracker.getAverage());
                UI.updateFaceStatus(!result.noFace);
            } else {
                // API换脸失败，优先显示缓存
                if (this.lastSwappedImage) {
                    this.drawToCanvas(ctx, this.lastSwappedImage, swappedCanvas);
                } else {
                    // 完全没有缓存才显示原始画面
                    this.drawToCanvas(ctx, sourceCanvas, swappedCanvas);
                }
            }
        } catch (error) {
            console.error('API换脸错误:', error);
            // 出错时优先显示缓存
            if (this.lastSwappedImage) {
                this.drawToCanvas(ctx, this.lastSwappedImage, swappedCanvas);
            } else {
                this.drawToCanvas(ctx, sourceCanvas, swappedCanvas);
            }
        } finally {
            this.pendingApiCall = false;
        }
    },
    
    /**
     * 绘制图像到目标Canvas（支持裁剪）
     */
    drawToCanvas(ctx, source, targetCanvas) {
        if (this.cropRegion) {
            // 有裁剪区域，从源图像中心裁剪
            ctx.drawImage(
                source,
                this.cropRegion.x, this.cropRegion.y,
                this.cropRegion.width, this.cropRegion.height,
                0, 0,
                targetCanvas.width, targetCanvas.height
            );
        } else {
            // 无裁剪，直接绘制
            ctx.drawImage(source, 0, 0, targetCanvas.width, targetCanvas.height);
        }
    },
    
    /**
     * 使用本地换脸渲染
     */
    async renderLocal(sourceCanvas, swappedCanvas, startTime) {
        const ctx = swappedCanvas.getContext('2d');
        
        // 检测人脸
        const results = await FaceDetector.detect(sourceCanvas);
        
        if (results && results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            // 获取68点特征点
            const landmarks = FaceDetector.get68Landmarks(
                results,
                sourceCanvas.width,
                sourceCanvas.height
            );
            
            if (this.cropRegion) {
                // 有裁剪：先在临时Canvas上换脸，再裁剪
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = sourceCanvas.width;
                tempCanvas.height = sourceCanvas.height;
                
                // 在临时Canvas上执行换脸
                FaceSwap.processFrame(sourceCanvas, tempCanvas, landmarks);
                
                // 裁剪到目标Canvas
                this.drawToCanvas(ctx, tempCanvas, swappedCanvas);
            } else {
                // 无裁剪：直接换脸
                FaceSwap.processFrame(sourceCanvas, swappedCanvas, landmarks);
            }
        } else {
            // 没有检测到人脸，显示原始画面
            this.drawToCanvas(ctx, sourceCanvas, swappedCanvas);
        }
        
        // 更新统计
        const fps = this.fpsCounter.tick();
        const latency = performance.now() - startTime;
        this.latencyTracker.record(latency);
        
        UI.updateFps(CameraManager.getFps(), fps);
        UI.updateLatency(this.latencyTracker.getAverage());
    },

    // ==================== 事件回调 ====================

    /**
     * 选择人脸素材回调
     */
    async onFaceSelected(face) {
        this.state.targetFace = face;
        
        if (!face) {
            return;
        }
        
        
        // 如果API已连接，设置源人脸到后端
        if (this.state.apiConnected && face.imageData) {
            const result = await ApiClient.setSourceFace(face.imageData);
            if (result.success) {
            } else {
                console.warn('Failed to set source face:', result.error);
            }
        }
        
        // 如果正在换脸，更新目标人脸（本地模式用）
        if (this.state.isSwapping && FaceSwap) {
            await FaceSwap.setTargetFace(face);
            // 同时更新高级换脸模块
            if (this.advancedFaceSwap) {
                await this.advancedFaceSwap.setTargetFace(face);
            }
        }
    },

    /**
     * 删除人脸素材回调
     */
    onFaceDeleted(id) {
        // 如果删除的是当前目标人脸，停止换脸
        if (this.state.targetFace && this.state.targetFace.id === id) {
            this.state.targetFace = null;
            
            if (this.state.isSwapping) {
                this.stopSwap();
                Utils.showToast('目标人脸已删除，换脸已停止', 'info');
            }
        }
    },

    /**
     * 设置变更回调
     */
    onSettingsChange(settings) {
        this.settings = { ...this.settings, ...settings };
        
        // 更新换脸配置
        if (FaceSwap && this.state.isSwapping) {
            FaceSwap.updateConfig({
                similarity: this.settings.similarity / 100,
                repairStrength: this.settings.repairStrength / 100
            });
        }
    },

    /**
     * 分辨率变更回调
     * 注意：当前已禁用分辨率切换功能
     */
    async onResolutionChange(resolution) {
        // 分辨率切换功能已禁用
        // 默认使用720p分辨率以获得最佳效果
        Utils.showToast('分辨率切换功能已禁用，使用默认720p', 'info');
    },
    
    /**
     * 比例变更回调
     */
    async onAspectChange(aspect) {
        this.settings.aspectRatio = aspect;
        
        // 更新输出Canvas尺寸
        const cameraSize = CameraManager.getVideoSize();
        if (cameraSize.width > 0) {
            this.updateOutputCanvasSize(aspect, cameraSize.width, cameraSize.height);
            
            // 重要：重新绘制原始视频画面
            this.drawOriginalVideo();
        }
        
        Utils.showToast(`已切换至 ${aspect} 比例`, 'success');
    },
    
    /**
     * 更新输出Canvas尺寸
     */
    updateOutputCanvasSize(aspect, cameraWidth, cameraHeight) {
        const swappedCanvas = document.getElementById('swappedCanvas');
        const isVertical = aspect === '9:16';
        const container = document.getElementById('swappedContainer');
        const videoContainer = document.getElementById('originalVideo')?.parentElement;
        
        if (isVertical) {
            // 9:16竖屏模式：创建合适的输出尺寸
            const maxWidth = 300; // 降低最大宽度，让布局更紧凑
            const maxHeight = Math.floor(maxWidth * 16 / 9); // 300*16/9 ≈ 533
            
            // 根据摄像头比例调整输出尺寸
            const cameraAspect = cameraWidth / cameraHeight;
            const targetAspect = 9 / 16;
            
            let outputWidth, outputHeight;
            
            if (cameraAspect > targetAspect) {
                // 摄像头是横屏（如4:3, 16:9），需要从中心裁剪成9:16
                outputHeight = Math.min(cameraHeight, maxHeight);
                outputWidth = Math.floor(outputHeight * 9 / 16);
                
                // 计算裁剪区域（从宽度方向中心裁剪）
                const cropX = Math.floor((cameraWidth - outputWidth) / 2);
                const cropY = 0;
                
                this.cropRegion = {
                    x: cropX,
                    y: cropY,
                    width: outputWidth,
                    height: outputHeight
                };
            } else {
                // 摄像头本身就是竖屏或接近9:16
                outputWidth = Math.min(cameraWidth, maxWidth);
                outputHeight = Math.floor(outputWidth * 16 / 9);
                
                // 如果高度超出限制，以高度为准
                if (outputHeight > maxHeight) {
                    outputHeight = maxHeight;
                    outputWidth = Math.floor(outputHeight * 9 / 16);
                }
                
                // 计算裁剪区域（从高度方向中心裁剪，如果需要的话）
                const cropX = 0;
                const cropY = Math.floor((cameraHeight - outputHeight) / 2);
                
                this.cropRegion = {
                    x: cropX,
                    y: cropY,
                    width: outputWidth,
                    height: outputHeight
                };
            }
            
            // 设置画布尺寸
            swappedCanvas.width = outputWidth;
            swappedCanvas.height = outputHeight;
        } else {
            // 16:9横屏模式：直接使用摄像头尺寸，但限制最大尺寸
            const maxWidth = 600;
            const maxHeight = 400;
            
            let outputWidth = Math.min(cameraWidth, maxWidth);
            let outputHeight = Math.min(cameraHeight, maxHeight);
            
            // 保持原有比例
            const cameraAspect = cameraWidth / cameraHeight;
            if (outputWidth / outputHeight > cameraAspect) {
                outputWidth = Math.floor(outputHeight * cameraAspect);
            } else {
                outputHeight = Math.floor(outputWidth / cameraAspect);
            }
            
            swappedCanvas.width = outputWidth;
            swappedCanvas.height = outputHeight;
            this.cropRegion = null;
        }
        
        // 记录当前比例模式
        this.aspectMode = aspect;
        
        // 更新容器样式以适配OBS
        if (container) {
            if (isVertical) {
                container.style.aspectRatio = '9/16';
                container.style.width = '100%';
                container.style.height = 'auto';
                container.style.maxWidth = '300px';
                container.style.maxHeight = '533px';
                container.style.margin = '0 auto';
            } else {
                container.style.aspectRatio = '';
                container.style.width = '';
                container.style.height = '';
                container.style.maxWidth = '';
                container.style.maxHeight = '';
                container.style.margin = '';
            }
        }
        
        if (videoContainer) {
            if (isVertical) {
                videoContainer.style.aspectRatio = '9/16';
                videoContainer.style.width = '100%';
                videoContainer.style.height = 'auto';
                videoContainer.style.maxWidth = '300px';
                videoContainer.style.maxHeight = '533px';
                videoContainer.style.margin = '0 auto';
            } else {
                videoContainer.style.aspectRatio = '';
                videoContainer.style.width = '';
                videoContainer.style.height = '';
                videoContainer.style.maxWidth = '';
                videoContainer.style.maxHeight = '';
                videoContainer.style.margin = '';
            }
        }
        
    },
    
    /**
     * 绘制原始视频到Canvas（用于比例切换时刷新显示）
     */
    drawOriginalVideo() {
        const originalCanvas = document.getElementById('originalCanvas');
        const originalVideo = document.getElementById('originalVideo');
        
        if (!originalCanvas || !originalVideo) return;
        
        const ctx = originalCanvas.getContext('2d');
        if (!ctx) return;
        
        // 绘制当前视频帧到原始画布
        try {
            ctx.drawImage(originalVideo, 0, 0, originalCanvas.width, originalCanvas.height);
        } catch (e) {
            console.warn('drawOriginalVideo error:', e);
        }
    },

    /**
     * 摄像头变更回调
     */
    async onCameraChange(deviceId) {
        if (this.state.cameraReady) {
            const wasSwapping = this.state.isSwapping;
            
            // 暂停换脸
            if (wasSwapping) {
                this.stopSwap();
            }
            
            // 切换摄像头
            const result = await CameraManager.switchCamera(deviceId);
            
            if (result.success) {
                Utils.showToast('摄像头已切换', 'success');
                
                // 恢复换脸
                if (wasSwapping) {
                    await this.startSwap();
                }
            } else {
                Utils.showToast(result.error || '摄像头切换失败', 'error');
            }
        }
    },

    /**
     * 节能模式变更回调
     */
    async onPowerSaveChange(enabled) {
        this.settings.powerSaveMode = enabled;
        
        if (enabled) {
            // 切换到480p
            await this.onResolutionChange(480);
            UI.updatePerformanceMode('low');
            Utils.showToast('节能模式已开启', 'info');
        } else {
            UI.updatePerformanceMode(this.state.performanceLevel);
            Utils.showToast('节能模式已关闭', 'info');
        }
    },
    
    /**
     * API地址变更回调
     */
    async onApiUrlChange(url) {
        if (!url) return;
            
        // 保存设置
        StorageManager.saveSettings({ apiUrl: url });
            
        // 更新API客户端
        ApiClient.setBaseUrl(url);
            
        // 如果正在换脸，先停止
        if (this.state.isSwapping) {
            await this.stopSwap();
        }
            
        // 重新检查连接
        await this.checkApiConnection();
    },
        
    /**
     * 切换OBS全屏模式
     */
    toggleObsFullscreen() {
        const container = document.getElementById('swappedContainer');
        if (!container) return;
            
        const isFullscreen = container.classList.contains('obs-fullscreen');
            
        if (isFullscreen) {
            // 退出全屏
            container.classList.remove('obs-fullscreen');
            container.style.position = '';
            container.style.top = '';
            container.style.left = '';
            container.style.zIndex = '';
            container.style.width = '';
            container.style.height = '';
            container.style.backgroundColor = '';
                
            // 恢复原来的aspect ratio设置
            const aspect = this.settings.aspectRatio || '9:16';
            const isVertical = aspect === '9:16';
            if (isVertical) {
                container.style.aspectRatio = '9/16';
                container.style.width = '100%';
                container.style.height = 'auto';
                container.style.maxWidth = '400px';
                container.style.margin = '0 auto';
            }
                
            // 移除OBS全屏类
            document.body.classList.remove('obs-fullscreen');
        } else {
            // 进入全屏
            container.style.position = 'fixed';
            container.style.top = '0';
            container.style.left = '0';
            container.style.zIndex = '9999';
            container.style.width = '100vw';
            container.style.height = '100vh';
            container.style.backgroundColor = 'black';
            container.style.aspectRatio = '';
                
            // 添加OBS全屏类，用于隐藏激活层
            document.body.classList.add('obs-fullscreen');
                
            // 确保激活层被隐藏
            const activationOverlay = document.getElementById('activationOverlay');
            if (activationOverlay) {
                activationOverlay.style.display = 'none';
                activationOverlay.style.visibility = 'hidden';
            }
        }
            
        // 切换按钮文本
        const obsBtn = document.getElementById('obsFullscreenBtn');
        if (obsBtn) {
            obsBtn.textContent = isFullscreen ? 'OBS全屏' : '退出全屏';
        }
    },
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// 页面关闭前清理
window.addEventListener('beforeunload', () => {
    if (App.state.isSwapping) {
        App.stopSwap();
    }
    CameraManager.stop();
});

// 导出到全局
window.App = App;