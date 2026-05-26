/**
 * 摄像头管理模块
 */

const CameraManager = {
    // 当前视频流
    stream: null,
    // 当前设备ID
    currentDeviceId: null,
    // 可用的摄像头设备列表
    devices: [],
    // 当前分辨率设置 - 默认使用720p以获得最佳效果
    resolution: { width: 1280, height: 720 },
    // 视频元素
    videoElement: null,
    // 是否正在运行
    isRunning: false,
    // FPS计数器
    fpsCounter: null,

    /**
     * 初始化摄像头管理器
     * @param {HTMLVideoElement} videoElement - 视频元素
     */
    async init(videoElement) {
        this.videoElement = videoElement;
        this.fpsCounter = Utils.createFpsCounter();
        
        // 获取摄像头设备列表
        await this.refreshDevices();
        
        return this.devices;
    },

    /**
     * 刷新设备列表
     */
    async refreshDevices() {
        try {
            // 检查navigator.mediaDevices是否可用
            if (!navigator.mediaDevices) {
                this.devices = [];
                return this.devices;
            }
            
            // 需要先请求权限才能获取完整的设备信息
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.devices = devices.filter(device => device.kind === 'videoinput');
            
            // 如果设备列表为空或没有标签，说明还没有权限
            if (this.devices.length === 0 || !this.devices[0].label) {
                // 请求临时权限以获取设备信息
                try {
                    if (navigator.mediaDevices.getUserMedia) {
                        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
                        tempStream.getTracks().forEach(track => track.stop());
                        
                        // 重新获取设备列表
                        const updatedDevices = await navigator.mediaDevices.enumerateDevices();
                        this.devices = updatedDevices.filter(device => device.kind === 'videoinput');
                    }
                } catch (e) {
                }
            }
            
            return this.devices;
        } catch (error) {
            console.error('Error refreshing devices:', error);
            this.devices = [];
            return [];
        }
    },

    /**
     * 请求摄像头权限
     */
    async requestPermission() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (error) {
            console.error('Camera permission denied:', error);
            return false;
        }
    },

    /**
     * 启动摄像头
     * @param {string} deviceId - 设备ID（可选）
     * @param {object} resolution - 分辨率设置（可选）
     */
    async start(deviceId = null, resolution = null) {
        try {
            // 停止当前流
            if (this.stream) {
                this.stop();
            }

            // 更新分辨率设置
            if (resolution) {
                this.resolution = resolution;
            }

            // 构建约束条件
            const constraints = {
                video: {
                    width: { ideal: this.resolution.width },
                    height: { ideal: this.resolution.height },
                    frameRate: { ideal: 30 }
                },
                audio: false
            };

            // 指定设备
            if (deviceId) {
                constraints.video.deviceId = { exact: deviceId };
                this.currentDeviceId = deviceId;
            } else if (this.currentDeviceId) {
                constraints.video.deviceId = { exact: this.currentDeviceId };
            }

            // 获取媒体流
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // 绑定到视频元素
            if (this.videoElement) {
                this.videoElement.srcObject = this.stream;
                await this.videoElement.play();
            }

            this.isRunning = true;
            
            // 获取实际的视频轨道设置
            const videoTrack = this.stream.getVideoTracks()[0];
            const settings = videoTrack.getSettings();
            
            
            return {
                success: true,
                settings: {
                    width: settings.width,
                    height: settings.height,
                    frameRate: settings.frameRate,
                    deviceId: settings.deviceId
                }
            };
        } catch (error) {
            console.error('Error starting camera:', error);
            this.isRunning = false;
            
            let errorMessage = '摄像头启动失败';
            if (error.name === 'NotAllowedError') {
                errorMessage = '摄像头权限被拒绝';
            } else if (error.name === 'NotFoundError') {
                errorMessage = '未找到摄像头设备';
            } else if (error.name === 'NotReadableError') {
                errorMessage = '摄像头被其他应用占用';
            } else if (error.name === 'OverconstrainedError') {
                errorMessage = '不支持请求的分辨率';
            }
            
            return {
                success: false,
                error: errorMessage,
                originalError: error
            };
        }
    },

    /**
     * 停止摄像头
     */
    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.stop();
            });
            this.stream = null;
        }
        
        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
        
        this.isRunning = false;
    },

    /**
     * 切换摄像头
     * @param {string} deviceId - 设备ID
     */
    async switchCamera(deviceId) {
        if (deviceId === this.currentDeviceId) {
            return { success: true };
        }
        
        return await this.start(deviceId, this.resolution);
    },

    /**
     * 切换分辨率
     * @param {number} height - 目标高度 (480 或 720)
     */
    async switchResolution(height) {
        const resolutions = {
            480: { width: 640, height: 480 },
            720: { width: 1280, height: 720 }
        };
        
        const newResolution = resolutions[height];
        if (!newResolution) {
            return { success: false, error: '不支持的分辨率' };
        }
        
        if (this.resolution.height === height) {
            return { success: true };
        }
        
        return await this.start(this.currentDeviceId, newResolution);
    },

    /**
     * 获取当前帧
     * @returns {ImageData|null}
     */
    getFrame() {
        if (!this.isRunning || !this.videoElement) {
            return null;
        }
        
        const video = this.videoElement;
        if (video.readyState !== video.HAVE_ENOUGH_DATA) {
            return null;
        }
        
        return video;
    },

    /**
     * 捕获当前帧到Canvas
     * @param {HTMLCanvasElement} canvas - 目标Canvas
     */
    captureFrame(canvas) {
        if (!this.isRunning || !this.videoElement) {
            return false;
        }
        
        const video = this.videoElement;
        if (video.readyState !== video.HAVE_ENOUGH_DATA) {
            return false;
        }
        
        const ctx = canvas.getContext('2d');
        
        // 确保canvas尺寸与视频匹配
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // 更新FPS
        this.fpsCounter.tick();
        
        return true;
    },

    /**
     * 获取当前FPS
     */
    getFps() {
        return this.fpsCounter ? this.fpsCounter.getFps() : 0;
    },

    /**
     * 获取视频尺寸
     */
    getVideoSize() {
        if (!this.videoElement) {
            return { width: 0, height: 0 };
        }
        return {
            width: this.videoElement.videoWidth,
            height: this.videoElement.videoHeight
        };
    },

    /**
     * 检查摄像头是否可用
     */
    isAvailable() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    },

    /**
     * 获取支持的约束条件
     */
    async getSupportedConstraints() {
        if (!navigator.mediaDevices) {
            return null;
        }
        return navigator.mediaDevices.getSupportedConstraints();
    },

    /**
     * 添加设备变化监听
     * @param {Function} callback - 回调函数
     */
    onDeviceChange(callback) {
        navigator.mediaDevices.addEventListener('devicechange', async () => {
            await this.refreshDevices();
            callback(this.devices);
        });
    },

    /**
     * 截图
     * @returns {string|null} - DataURL
     */
    takeSnapshot() {
        if (!this.isRunning || !this.videoElement) {
            return null;
        }
        
        const video = this.videoElement;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        
        return canvas.toDataURL('image/jpeg', 0.9);
    }
};

// 导出到全局
window.CameraManager = CameraManager;
