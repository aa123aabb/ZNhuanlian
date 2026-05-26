/**
 * 工具函数模块
 */

const Utils = {
    /**
     * 显示Toast提示
     * @param {string} message - 提示消息
     * @param {string} type - 类型: success, error, info
     * @param {number} duration - 显示时长(ms)
     */
    showToast(message, type = 'info', duration = 3000) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = 'fixed top-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg border text-sm transition-opacity z-50';
        
        // 根据类型设置颜色
        switch (type) {
            case 'success':
                toast.classList.add('bg-green-800', 'border-green-700', 'text-green-200');
                break;
            case 'error':
                toast.classList.add('bg-red-800', 'border-red-700', 'text-red-200');
                break;
            default:
                toast.classList.add('bg-gray-800', 'border-gray-700', 'text-gray-200');
        }
        
        toast.style.opacity = '1';
        toast.style.pointerEvents = 'auto';
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.pointerEvents = 'none';
        }, duration);
    },

    /**
     * 显示加载遮罩
     * @param {string} text - 加载文字
     */
    showLoading(text = '加载中...') {
        const overlay = document.getElementById('loadingOverlay');
        const loadingText = document.getElementById('loadingText');
        loadingText.textContent = text;
        overlay.classList.remove('hidden');
    },

    /**
     * 隐藏加载遮罩
     */
    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        overlay.classList.add('hidden');
    },

    /**
     * 显示弹窗
     * @param {string} templateId - 模板ID
     * @param {Function} callback - 弹窗内容渲染后的回调
     */
    showModal(templateId, callback) {
        const container = document.getElementById('modalContainer');
        const content = document.getElementById('modalContent');
        const template = document.getElementById(templateId);
        
        if (!template) {
            console.error('Modal template not found:', templateId);
            return;
        }
        
        content.innerHTML = template.innerHTML;
        container.classList.remove('hidden');
        
        // 绑定关闭按钮
        const closeButtons = content.querySelectorAll('.modal-close');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', () => this.hideModal());
        });
        
        // 点击背景关闭
        document.getElementById('modalBackdrop').onclick = () => this.hideModal();
        
        if (callback) {
            callback(content);
        }
    },

    /**
     * 隐藏弹窗
     */
    hideModal() {
        const container = document.getElementById('modalContainer');
        container.classList.add('hidden');
    },

    /**
     * 防抖函数
     * @param {Function} func - 要执行的函数
     * @param {number} wait - 等待时间(ms)
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * 节流函数
     * @param {Function} func - 要执行的函数
     * @param {number} limit - 限制时间(ms)
     */
    throttle(func, limit) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * 生成唯一ID
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    /**
     * 格式化文件大小
     * @param {number} bytes - 字节数
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * 检查浏览器兼容性
     */
    checkBrowserCompatibility() {
        const features = {
            getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            webGL: (() => {
                try {
                    const canvas = document.createElement('canvas');
                    return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
                } catch (e) {
                    return false;
                }
            })(),
            indexedDB: !!window.indexedDB,
            localStorage: !!window.localStorage,
            webRTC: !!window.RTCPeerConnection
        };
        
        const unsupported = Object.entries(features)
            .filter(([_, supported]) => !supported)
            .map(([name]) => name);
        
        return {
            compatible: unsupported.length === 0,
            unsupported,
            features
        };
    },

    /**
     * 检测设备性能
     */
    async detectPerformance() {
        const startTime = performance.now();
        
        // 简单的性能测试
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        // 进行一些计算密集型操作
        for (let i = 0; i < 100; i++) {
            ctx.fillStyle = `rgb(${i}, ${i}, ${i})`;
            ctx.fillRect(0, 0, 512, 512);
            ctx.getImageData(0, 0, 512, 512);
        }
        
        const duration = performance.now() - startTime;
        
        // 检测GPU
        let gpuInfo = 'Unknown';
        try {
            const gl = canvas.getContext('webgl');
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    gpuInfo = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                }
            }
        } catch (e) {
        }
        
        // 根据测试时间判断性能级别
        let level = 'high';
        if (duration > 500) level = 'low';
        else if (duration > 200) level = 'medium';
        
        return {
            level,
            testDuration: duration,
            gpuInfo,
            hardwareConcurrency: navigator.hardwareConcurrency || 4,
            deviceMemory: navigator.deviceMemory || 4
        };
    },

    /**
     * 将图片缩放到指定尺寸
     * @param {HTMLImageElement|HTMLCanvasElement} source - 源图片
     * @param {number} width - 目标宽度
     * @param {number} height - 目标高度
     * @returns {HTMLCanvasElement}
     */
    resizeImage(source, width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(source, 0, 0, width, height);
        return canvas;
    },

    /**
     * 将Canvas转换为Blob
     * @param {HTMLCanvasElement} canvas 
     * @param {string} type 
     * @param {number} quality 
     */
    canvasToBlob(canvas, type = 'image/jpeg', quality = 0.8) {
        return new Promise(resolve => {
            canvas.toBlob(resolve, type, quality);
        });
    },

    /**
     * 从Blob读取为DataURL
     * @param {Blob} blob 
     */
    blobToDataURL(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    },

    /**
     * 从DataURL创建图片
     * @param {string} dataURL 
     */
    dataURLToImage(dataURL) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = dataURL;
        });
    },

    /**
     * 加载图片
     * @param {string} src - 图片URL
     */
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    },

    /**
     * 计算两点之间的距离
     */
    distance(p1, p2) {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    },

    /**
     * 线性插值
     */
    lerp(a, b, t) {
        return a + (b - a) * t;
    },

    /**
     * 限制数值范围
     */
    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    },

    /**
     * 角度转弧度
     */
    degToRad(deg) {
        return deg * Math.PI / 180;
    },

    /**
     * 弧度转角度
     */
    radToDeg(rad) {
        return rad * 180 / Math.PI;
    },

    /**
     * 检测是否为移动设备
     */
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },

    /**
     * 获取当前时间戳字符串
     */
    getTimestamp() {
        const now = new Date();
        return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    },

    /**
     * FPS计算器
     */
    createFpsCounter() {
        let frameCount = 0;
        let lastTime = performance.now();
        let fps = 0;
        
        return {
            tick() {
                frameCount++;
                const currentTime = performance.now();
                const elapsed = currentTime - lastTime;
                
                if (elapsed >= 1000) {
                    fps = Math.round(frameCount * 1000 / elapsed);
                    frameCount = 0;
                    lastTime = currentTime;
                }
                
                return fps;
            },
            getFps() {
                return fps;
            }
        };
    },

    /**
     * 延迟计算器
     */
    createLatencyTracker() {
        const samples = [];
        const maxSamples = 30;
        
        return {
            record(latency) {
                samples.push(latency);
                if (samples.length > maxSamples) {
                    samples.shift();
                }
            },
            getAverage() {
                if (samples.length === 0) return 0;
                return Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
            }
        };
    }
};

// 导出到全局
window.Utils = Utils;
