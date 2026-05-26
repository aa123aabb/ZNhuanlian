// OBS兼容性自动优化模块
class OBSCompatibility {
    constructor() {
        this.isOBSEnvironment = false;
        this.init();
    }
    
    init() {
        // 检测OBS环境
        this.detectOBSEnvironment();
        
        // 如果检测到OBS环境，应用优化
        if (this.isOBSEnvironment) {
            this.applyOBSOptimizations();
        }
    }
    
    detectOBSEnvironment() {
        // 多种方式检测OBS环境
        const detectionMethods = [
            // 用户代理检测
            () => navigator.userAgent.includes('OBS') || navigator.userAgent.includes('obs'),
            // URL参数检测
            () => window.location.search.includes('obs') || window.location.hash.includes('obs'),
            // Referrer检测
            () => document.referrer.includes('obs'),
            // 性能特征检测（OBS浏览器源有特定特征）
            () => !window.chrome && window.performance && window.performance.memory,
            // 屏幕捕获API检测
            () => navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia,
            // 自定义属性检测
            () => window.obsstudio || window.OBSStudio
        ];
        
        // 如果有任一检测方法返回true，则认为是OBS环境
        this.isOBSEnvironment = detectionMethods.some(method => {
            try {
                return method();
            } catch (e) {
                return false;
            }
        });
        
    }
    
    applyOBSOptimizations() {
        
        // 1. 禁用硬件加速CSS
        this.disableHardwareAcceleration();
        
        // 2. 优化Canvas渲染
        this.optimizeCanvasRendering();
        
        // 3. 优化视频捕获
        this.optimizeVideoCapture();
        
        // 4. 优化内存使用
        this.optimizeMemoryUsage();
        
        // 5. 添加OBS专用样式
        this.addOBSStyles();
    }
    
    disableHardwareAcceleration() {
        // 禁用所有硬件加速效果
        const style = document.createElement('style');
        style.textContent = `
            /* OBS兼容性样式 */
            body.obs-mode {
                transform: none !important;
                filter: none !important;
                will-change: auto !important;
                backface-visibility: visible !important;
                perspective: none !important;
            }
            
            body.obs-mode * {
                transform: none !important;
                filter: none !important;
                will-change: auto !important;
            }
            
            body.obs-mode canvas {
                image-rendering: crisp-edges !important;
                image-rendering: pixelated !important;
                transform: none !important;
            }
            
            /* 优化OBS捕获区域 */
            body.obs-mode #app {
                margin: 0 !important;
                padding: 0 !important;
                background: #1a202c !important;
            }
            
            /* 隐藏滚动条 */
            body.obs-mode {
                overflow: hidden !important;
            }
        `;
        document.head.appendChild(style);
        document.body.classList.add('obs-mode');
    }
    
    optimizeCanvasRendering() {
        // 重写getContext方法，强制使用2D渲染
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, attributes) {
            if (type === 'webgl' || type === 'webgl2') {
                return originalGetContext.call(this, '2d', attributes);
            }
            return originalGetContext.call(this, type, attributes);
        };
        
        // 优化现有Canvas
        setTimeout(() => {
            const canvases = document.querySelectorAll('canvas');
            canvases.forEach(canvas => {
                canvas.style.imageRendering = 'crisp-edges';
                canvas.style.transform = 'none';
            });
        }, 100);
    }
    
    optimizeVideoCapture() {
        // 优化视频流捕获设置
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
            navigator.mediaDevices.getUserMedia = function(constraints) {
                // 降低视频分辨率以优化性能
                if (constraints.video) {
                    if (typeof constraints.video === 'object') {
                        constraints.video.width = { ideal: 640 };
                        constraints.video.height = { ideal: 480 };
                        constraints.video.frameRate = { ideal: 30 };
                    }
                }
                return originalGetUserMedia.call(this, constraints);
            };
        }
    }
    
    optimizeMemoryUsage() {
        // 优化内存使用，避免OBS卡顿
        setInterval(() => {
            if (window.gc) {
                window.gc(); // 如果可用，强制垃圾回收
            }
        }, 30000); // 每30秒清理一次
        
        // 监听页面可见性变化，优化后台性能
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // 页面不可见时降低性能消耗
            }
        });
    }
    
    addOBSStyles() {
        // 添加OBS专用样式类 - 增强版本
        const style = document.createElement('style');
        style.textContent = `
            .obs-optimized {
                /* OBS优化样式 */
                animation: none !important;
                transition: none !important;
                box-shadow: none !important;
                /* 确保OBS能够正确捕获 */
                background: #1a202c !important;
                opacity: 1 !important;
                visibility: visible !important;
            }
            
            /* 确保视频元素可被OBS正确捕获 */
            video.obs-optimized {
                object-fit: cover !important;
                transform: none !important;
                background: #000000 !important;
                display: block !important;
            }
            
            /* 优化Canvas渲染，确保OBS能够捕获 */
            canvas.obs-optimized {
                image-rendering: crisp-edges !important;
                image-rendering: pixelated !important;
                background: #000000 !important;
                display: block !important;
                position: relative !important;
                z-index: 1 !important;
            }
            
            /* 优化文本渲染 */
            .obs-optimized {
                text-rendering: optimizeSpeed !important;
                font-smooth: never !important;
                -webkit-font-smoothing: none !important;
            }
            
            /* 确保整个应用区域可被OBS捕获 */
            body.obs-mode {
                background: #1a202c !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
                width: 100vw !important;
                height: 100vh !important;
            }
            
            /* 隐藏可能干扰OBS捕获的元素 */
            .obs-mode .hidden-in-obs {
                display: none !important;
            }
            
            /* 优化输出Canvas，确保换脸结果可被OBS捕获 */
            #outputCanvas.obs-optimized {
                background: #000000 !important;
                border: 2px solid #4a5568 !important;
                display: block !important;
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                z-index: 10 !important;
            }
        `;
        document.head.appendChild(style);
        
        // 为关键元素添加优化类
        setTimeout(() => {
            const elements = document.querySelectorAll('#app, video, canvas, .video-container, #outputCanvas, #previewCanvas');
            elements.forEach(el => {
                el.classList.add('obs-optimized');
                // 确保元素可见且可被捕获
                el.style.opacity = '1';
                el.style.visibility = 'visible';
                el.style.display = 'block';
            });
            
            // 隐藏可能干扰OBS捕获的UI元素
            const uiElements = document.querySelectorAll('.controls, .settings, .toolbar');
            uiElements.forEach(el => el.classList.add('hidden-in-obs'));
        }, 200);
    }
}

// 自动初始化OBS兼容性
window.OBSCompatibility = new OBSCompatibility();

// OBS捕获优化功能
class OBSCaptureOptimizer {
    constructor() {
        this.isActive = false;
        this.optimizationInterval = null;
    }
    
    // 启动OBS捕获优化
    startOptimization() {
        if (this.isActive) return;
        
        this.isActive = true;
        
        // 1. 强制设置背景色，解决黑屏问题
        this.forceBackgroundColor();
        
        // 2. 确保关键元素可见
        this.ensureElementVisibility();
        
        // 3. 优化Canvas渲染
        this.optimizeCanvasForOBS();
        
        // 4. 强制重绘所有Canvas
        this.forceCanvasRedraw();
        
        // 5. 定期检查并优化
        this.optimizationInterval = setInterval(() => {
            this.continuousOptimization();
        }, 5000); // 每5秒检查一次
        
        // 6. 监听窗口变化
        this.setupWindowListeners();
    }
    
    // 确保关键元素可见
    ensureElementVisibility() {
        const criticalElements = [
            '#outputCanvas',
            '#previewCanvas', 
            '.video-container',
            '#app'
        ];
        
        criticalElements.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                el.style.opacity = '1';
                el.style.visibility = 'visible';
                el.style.display = 'block';
                el.style.zIndex = '10';
                
                // 确保元素有明确的背景色
                if (el.tagName === 'CANVAS') {
                    el.style.background = '#000000';
                }
            });
        });
    }
    
    // 优化Canvas渲染
    optimizeCanvasForOBS() {
        const canvases = document.querySelectorAll('canvas');
        canvases.forEach(canvas => {
            // 强制重绘Canvas
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // 添加一个微小的绘制操作确保Canvas被激活
                ctx.fillStyle = 'rgba(0,0,0,0.001)';
                ctx.fillRect(0, 0, 1, 1);
            }
            
            // 设置Canvas属性
            canvas.style.imageRendering = 'crisp-edges';
            canvas.style.willChange = 'auto';
            canvas.style.transform = 'none';
        });
    }
    
    // 持续优化
    continuousOptimization() {
        // 检查关键元素状态
        this.checkElementStates();
        
        // 优化性能
        this.optimizePerformance();
        
        // 确保OBS能够捕获
        this.ensureOBSCapture();
    }
    
    // 检查元素状态
    checkElementStates() {
        const outputCanvas = document.getElementById('outputCanvas');
        if (outputCanvas) {
            const isVisible = outputCanvas.offsetWidth > 0 && outputCanvas.offsetHeight > 0;
            if (!isVisible) {
                console.warn('输出Canvas不可见，重新调整...');
                this.forceElementVisible(outputCanvas);
            }
        }
    }
    
    // 强制元素可见
    forceElementVisible(element) {
        element.style.display = 'block';
        element.style.visibility = 'visible';
        element.style.opacity = '1';
        element.style.position = 'absolute';
        element.style.top = '0';
        element.style.left = '0';
        element.style.zIndex = '9999';
    }
    
    // 优化性能
    optimizePerformance() {
        // 降低动画频率
        const animations = document.querySelectorAll('*[style*="animation"], *[style*="transition"]');
        animations.forEach(el => {
            el.style.animationPlayState = 'paused';
            el.style.transition = 'none';
        });
    }
    
    // 确保OBS捕获
    ensureOBSCapture() {
        // 添加一个微小的视觉变化确保OBS能够捕获
        const body = document.body;
        if (body) {
            // 轻微的颜色变化（人眼不可见，但OBS可以检测到）
            const currentBg = window.getComputedStyle(body).backgroundColor;
            if (currentBg === 'rgba(0, 0, 0, 0)' || currentBg === 'transparent') {
                body.style.background = '#1a202c';
            }
        }
    }
    
    // 强制设置背景色，解决黑屏问题
    forceBackgroundColor() {
        // 强制设置body背景色
        document.body.style.background = '#1a202c';
        document.body.style.backgroundColor = '#1a202c';
        
        // 强制设置html背景色
        document.documentElement.style.background = '#1a202c';
        document.documentElement.style.backgroundColor = '#1a202c';
        
        // 强制设置所有Canvas背景色
        const canvases = document.querySelectorAll('canvas');
        canvases.forEach(canvas => {
            canvas.style.background = '#000000';
            canvas.style.backgroundColor = '#000000';
            
            // 强制Canvas重绘
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        });
        
    },
    
    // 强制重绘所有Canvas
    forceCanvasRedraw() {
        const canvases = document.querySelectorAll('canvas');
        canvases.forEach(canvas => {
            // 强制Canvas重绘
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // 保存当前内容
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                
                // 清除并重绘
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.putImageData(imageData, 0, 0);
                
                // 强制触发重绘事件
                canvas.dispatchEvent(new Event('redraw'));
            }
        });
        
    },
    
    // 设置窗口监听器
    setupWindowListeners() {
        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            this.optimizeCanvasForOBS();
            this.forceCanvasRedraw(); // 窗口大小变化时强制重绘
        });
        
        // 监听页面可见性变化
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // 页面重新可见时重新优化
                this.optimizeCanvasForOBS();
                this.forceCanvasRedraw();
            }
        });
        
        // 监听Canvas内容变化
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    this.forceCanvasRedraw();
                }
            });
        });
        
        // 观察所有Canvas
        const canvases = document.querySelectorAll('canvas');
        canvases.forEach(canvas => {
            observer.observe(canvas, { attributes: true });
        });
    }
    
    // 停止优化
    stopOptimization() {
        if (this.optimizationInterval) {
            clearInterval(this.optimizationInterval);
            this.optimizationInterval = null;
        }
        this.isActive = false;
    }
}

// 创建全局OBS捕获优化器
window.OBSCaptureOptimizer = new OBSCaptureOptimizer();

// 自动检测并启动OBS优化
setTimeout(() => {
    if (window.OBSCompatibility.isOBSEnvironment) {
        window.OBSCaptureOptimizer.startOptimization();
    }
}, 1000);

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OBSCompatibility, OBSCaptureOptimizer };
}