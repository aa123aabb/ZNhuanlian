/**
 * UI控制器模块
 * 处理界面交互和事件绑定
 */

const UI = {
    // DOM元素引用
    elements: {},
    
    // 状态
    state: {
        isSwapping: false,
        isPipMode: false,
        theme: 'dark',
        sidebarOpen: false
    },

    /**
     * 初始化UI
     */
    init() {
        this.cacheElements();
        this.bindEvents();
        this.loadTheme();
        this.updatePresetList();
        
    },

    /**
     * 缓存DOM元素
     */
    cacheElements() {
        this.elements = {
            // 导航
            navTutorial: document.getElementById('navTutorial'),
            navAbout: document.getElementById('navAbout'),
            themeToggle: document.getElementById('themeToggle'),
            mobileMenuBtn: document.getElementById('mobileMenuBtn'),
            
            // 侧边栏
            sidebar: document.getElementById('sidebar'),
            sidebarOverlay: document.getElementById('sidebarOverlay'),
            
            // 人脸素材
            faceGrid: document.getElementById('faceGrid'),
            faceCount: document.getElementById('faceCount'),
            uploadZone: document.getElementById('uploadZone'),
            fileInput: document.getElementById('fileInput'),
            
            // 效果调节
            similaritySlider: document.getElementById('similaritySlider'),
            similarityValue: document.getElementById('similarityValue'),
            repairSlider: document.getElementById('repairSlider'),
            repairValue: document.getElementById('repairValue'),
            resolutionBtns: document.querySelectorAll('.resolution-btn'),
            aspectBtns: document.querySelectorAll('.aspect-btn'),
            cameraSelect: document.getElementById('cameraSelect'),
            powerSaveToggle: document.getElementById('powerSaveToggle'),
            
            // 换脸模型选择
            swapModelBtns: document.querySelectorAll('.swap-model-btn'),
            modelDescription: document.getElementById('modelDescription'),
            faceParserToggle: document.getElementById('faceParserToggle'),
            colorCorrectionToggle: document.getElementById('colorCorrectionToggle'),
            
            // 控制按钮
            startBtn: document.getElementById('startBtn'),
            stopBtn: document.getElementById('stopBtn'),
            pipBtn: document.getElementById('pipBtn'),
            savePresetBtn: document.getElementById('savePresetBtn'),
            presetSelect: document.getElementById('presetSelect'),
            
            // 预览区域
            originalVideo: document.getElementById('originalVideo'),
            originalCanvas: document.getElementById('originalCanvas'),
            swappedCanvas: document.getElementById('swappedCanvas'),
            swappedContainer: document.getElementById('swappedContainer'),
            
            // 状态显示
            originalFps: document.getElementById('originalFps'),
            swappedFps: document.getElementById('swappedFps'),
            latency: document.getElementById('latency'),
            faceIndicator: document.getElementById('faceIndicator'),
            faceStatusText: document.getElementById('faceStatusText'),
            swapStatus: document.getElementById('swapStatus'),
            performanceIndicator: document.getElementById('performanceIndicator'),
            performanceMode: document.getElementById('performanceMode'),
            cameraStatus: document.getElementById('cameraStatus'),
            gpuStatus: document.getElementById('gpuStatus'),
            
            // 底部
            tutorialBtn: document.getElementById('tutorialBtn'),
            
            // API配置
            apiUrlInput: document.getElementById('apiUrlInput'),
            apiConnectBtn: document.getElementById('apiConnectBtn'),
            apiIndicator: document.getElementById('apiIndicator'),
            apiStatusText: document.getElementById('apiStatusText'),
            
            // 弹窗
            modalContainer: document.getElementById('modalContainer'),
            modalContent: document.getElementById('modalContent')
        };
    },

    /**
     * 绑定事件
     */
    bindEvents() {
        // 导航事件
        this.elements.navTutorial?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showTutorial();
        });
        
        this.elements.navAbout?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showAbout();
        });
        
        this.elements.tutorialBtn?.addEventListener('click', () => {
            this.showTutorial();
        });
        
        // 主题切换
        this.elements.themeToggle?.addEventListener('click', () => {
            this.toggleTheme();
        });
        
        // 移动端菜单
        this.elements.mobileMenuBtn?.addEventListener('click', () => {
            this.toggleSidebar();
        });
        
        this.elements.sidebarOverlay?.addEventListener('click', () => {
            this.closeSidebar();
        });
        
        // 文件上传
        this.elements.uploadZone?.addEventListener('click', () => {
            this.elements.fileInput?.click();
        });
        
        this.elements.fileInput?.addEventListener('change', (e) => {
            this.handleFileSelect(e.target.files);
        });
        
        // 拖拽上传
        this.elements.uploadZone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.elements.uploadZone.classList.add('dragover');
        });
        
        this.elements.uploadZone?.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.elements.uploadZone.classList.remove('dragover');
        });
        
        this.elements.uploadZone?.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.elements.uploadZone.classList.remove('dragover');
            this.handleFileSelect(e.dataTransfer.files);
        });
        
        // 滑块事件
        this.elements.similaritySlider?.addEventListener('input', (e) => {
            const value = e.target.value;
            this.elements.similarityValue.textContent = `${value}%`;
            this.onSettingsChange({ similarity: parseInt(value) });
        });
        
        this.elements.repairSlider?.addEventListener('input', (e) => {
            const value = e.target.value;
            this.elements.repairValue.textContent = `${value}%`;
            this.onSettingsChange({ repairStrength: parseInt(value) });
        });
        
        // 分辨率按钮 - 已禁用此功能
        // this.elements.resolutionBtns?.forEach(btn => {
        //     btn.addEventListener('click', () => {
        //         this.elements.resolutionBtns.forEach(b => b.classList.remove('active'));
        //         btn.classList.add('active');
        //         const resolution = parseInt(btn.dataset.resolution);
        //         this.onResolutionChange(resolution);
        //     });
        // });
        
        // 比例按钮
        this.elements.aspectBtns?.forEach(btn => {
            btn.addEventListener('click', () => {
                this.elements.aspectBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const aspect = btn.dataset.aspect;
                this.onAspectChange(aspect);
            });
        });
        
        // 摄像头选择
        this.elements.cameraSelect?.addEventListener('change', (e) => {
            this.onCameraChange(e.target.value);
        });
        
        // 节能模式
        this.elements.powerSaveToggle?.addEventListener('change', (e) => {
            this.onPowerSaveChange(e.target.checked);
        });
        
        // 换脸模型选择
        this.elements.swapModelBtns?.forEach(btn => {
            btn.addEventListener('click', () => {
                this.onSwapModelChange(btn.dataset.model);
            });
        });
        
        // 人脸分割开关
        this.elements.faceParserToggle?.addEventListener('change', (e) => {
            this.onFaceParserChange(e.target.checked);
        });
        
        // 色彩校正开关
        this.elements.colorCorrectionToggle?.addEventListener('change', (e) => {
            this.onColorCorrectionChange(e.target.checked);
        });
        
        // API服务器配置
        this.elements.apiConnectBtn?.addEventListener('click', () => {
            this.onApiConnect();
        });
        
        this.elements.apiUrlInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.onApiConnect();
            }
        });
        
        // 控制按钮
        this.elements.startBtn?.addEventListener('click', () => {
            this.onStartSwap();
        });
        
        this.elements.stopBtn?.addEventListener('click', () => {
            this.onStopSwap();
        });
        
        this.elements.pipBtn?.addEventListener('click', () => {
            this.togglePipMode();
        });
        
        // OBS全屏按钮
        this.elements.obsFullscreenBtn?.addEventListener('click', () => {
            this.toggleObsFullscreen();
        });
        
        // 预设管理
        this.elements.savePresetBtn?.addEventListener('click', () => {
            this.showSavePresetModal();
        });
        
        this.elements.presetSelect?.addEventListener('change', (e) => {
            if (e.target.value) {
                this.onPresetSelect(e.target.value);
            }
        });
        
        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            this.handleKeyboard(e);
        });
    },

    // ==================== 人脸素材管理 ====================

    /**
     * 处理文件选择
     */
    async handleFileSelect(files) {
        if (!files || files.length === 0) return;
        
        for (const file of files) {
            if (!file.type.match(/image\/(jpeg|png)/)) {
                Utils.showToast('只支持JPG/PNG格式的图片', 'error');
                continue;
            }
            
            try {
                await this.processUploadedImage(file);
            } catch (error) {
                console.error('Error processing image:', error);
                Utils.showToast(error.message || '图片处理失败', 'error');
            }
        }
        
        // 清空文件输入
        if (this.elements.fileInput) {
            this.elements.fileInput.value = '';
        }
    },

    /**
     * 处理上传的图片
     */
    async processUploadedImage(file) {
        Utils.showLoading('正在处理图片...');
        
        try {
            // 读取图片
            const dataURL = await Utils.blobToDataURL(file);
            const img = await Utils.loadImage(dataURL);
            
            let validation = { valid: true, landmarks: null };
            let useBackendValidation = false;
            
            // 尝试初始化前端检测器（可选，失败不阻塞）
            if (!FaceDetector.initialized) {
                try {
                    document.getElementById('loadingText').textContent = '正在加载检测模型...';
                    await FaceDetector.init();
                } catch (e) {
                    console.warn('前端检测器初始化失败，将使用后端验证');
                }
            }
            
            // 如果前端检测器可用，使用前端验证
            if (FaceDetector.initialized) {
                document.getElementById('loadingText').textContent = '正在检测人脸...';
                try {
                    validation = await FaceDetector.validateFace(img);
                    if (!validation.valid) {
                        Utils.hideLoading();
                        Utils.showToast(validation.reason, 'error');
                        return;
                    }
                } catch (e) {
                    console.warn('前端检测失败，将使用后端验证');
                    useBackendValidation = true;
                }
            } else {
                useBackendValidation = true;
            }
            
            // 缩放图片到256x256
            const resizedCanvas = Utils.resizeImage(img, 256, 256);
            const resizedDataURL = resizedCanvas.toDataURL('image/jpeg', 0.9);
            
            // 如果需要后端验证，调用API检测人脸
            if (useBackendValidation) {
                document.getElementById('loadingText').textContent = '正在验证人脸...';
                const result = await ApiClient.setSourceFace(resizedDataURL);
                if (!result.success) {
                    Utils.hideLoading();
                    Utils.showToast(result.error || '未检测到人脸', 'error');
                    return;
                }
            }
            
            // 生成缩略图
            const thumbnailCanvas = Utils.resizeImage(img, 64, 64);
            const thumbnailDataURL = thumbnailCanvas.toDataURL('image/jpeg', 0.8);
            
            Utils.hideLoading();
            
            // 显示命名弹窗
            this.showNameModal(async (name) => {
                try {
                    // 保存到存储
                    const faceData = await StorageManager.saveFace({
                        name: name || file.name.replace(/\.[^/.]+$/, ''),
                        imageData: resizedDataURL,
                        thumbnail: thumbnailDataURL,
                        landmarks: validation.landmarks
                    });
                    
                    // 刷新显示
                    await this.refreshFaceGrid();
                    
                    // 如果是第一个素材，自动选中
                    const count = await StorageManager.getFaceCount();
                    if (count === 1) {
                        this.selectFace(faceData.id);
                    }
                    
                    Utils.showToast('素材添加成功', 'success');
                } catch (error) {
                    Utils.showToast(error.message, 'error');
                }
            });
        } catch (error) {
            Utils.hideLoading();
            throw error;
        }
    },

    /**
     * 刷新素材网格
     */
    async refreshFaceGrid() {
        const faces = await StorageManager.getAllFaces();
        const selectedId = StorageManager.getSelectedFaceId();
        const count = faces.length;
        
        // 更新计数
        this.elements.faceCount.textContent = `${count}/${StorageManager.MAX_FACES}`;
        
        // 清空网格
        this.elements.faceGrid.innerHTML = '';
        
        // 渲染素材
        faces.forEach(face => {
            const item = document.createElement('div');
            item.className = `face-thumbnail ${face.id === selectedId ? 'selected' : ''}`;
            item.dataset.id = face.id;
            
            item.innerHTML = `
                <img src="${face.thumbnail}" alt="${face.name}">
                <div class="face-overlay">
                    <button class="edit-btn" title="重命名">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                        </svg>
                    </button>
                    <button class="delete-btn" title="删除">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </div>
                <div class="face-name">${face.name}</div>
            `;
            
            // 点击选择
            item.addEventListener('click', (e) => {
                if (e.target.closest('.edit-btn') || e.target.closest('.delete-btn')) {
                    return;
                }
                this.selectFace(face.id);
            });
            
            // 编辑按钮
            item.querySelector('.edit-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.editFaceName(face.id, face.name);
            });
            
            // 删除按钮
            item.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteFace(face.id, face.name);
            });
            
            this.elements.faceGrid.appendChild(item);
        });
    },

    /**
     * 选择素材
     */
    async selectFace(id) {
        // 更新选中状态
        StorageManager.setSelectedFaceId(id);
        
        // 更新UI
        document.querySelectorAll('.face-thumbnail').forEach(item => {
            item.classList.toggle('selected', item.dataset.id === id);
        });
        
        // 通知App更新目标人脸
        if (window.App && typeof window.App.onFaceSelected === 'function') {
            const face = await StorageManager.getFace(id);
            window.App.onFaceSelected(face);
        }
    },

    /**
     * 编辑素材名称
     */
    editFaceName(id, currentName) {
        this.showNameModal(async (name) => {
            if (name && name !== currentName) {
                await StorageManager.updateFace(id, { name });
                await this.refreshFaceGrid();
                Utils.showToast('名称已更新', 'success');
            }
        }, currentName);
    },

    /**
     * 删除素材
     */
    deleteFace(id, name) {
        if (confirm(`确定要删除素材"${name}"吗？`)) {
            StorageManager.deleteFace(id).then(() => {
                this.refreshFaceGrid();
                Utils.showToast('素材已删除', 'success');
                
                // 通知App
                if (window.App && typeof window.App.onFaceDeleted === 'function') {
                    window.App.onFaceDeleted(id);
                }
            });
        }
    },

    // ==================== 弹窗管理 ====================

    /**
     * 显示命名弹窗
     */
    showNameModal(callback, defaultName = '') {
        Utils.showModal('nameModal', (content) => {
            const input = content.querySelector('#faceName');
            const confirmBtn = content.querySelector('#confirmName');
            
            input.value = defaultName;
            input.focus();
            
            const submit = () => {
                callback(input.value.trim());
                Utils.hideModal();
            };
            
            confirmBtn.addEventListener('click', submit);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') submit();
            });
        });
    },

    /**
     * 显示保存预设弹窗
     */
    showSavePresetModal() {
        Utils.showModal('presetModal', (content) => {
            const input = content.querySelector('#presetName');
            const confirmBtn = content.querySelector('#confirmPreset');
            
            input.focus();
            
            const submit = () => {
                const name = input.value.trim();
                if (!name) {
                    Utils.showToast('请输入预设名称', 'error');
                    return;
                }
                
                // 获取当前设置
                const settings = StorageManager.getSettings();
                StorageManager.savePreset({ name, settings });
                
                this.updatePresetList();
                Utils.hideModal();
                Utils.showToast('预设已保存', 'success');
            };
            
            confirmBtn.addEventListener('click', submit);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') submit();
            });
        });
    },

    /**
     * 显示教程弹窗
     */
    showTutorial() {
        Utils.showModal('tutorialModal');
    },

    /**
     * 显示关于弹窗
     */
    showAbout() {
        Utils.showModal('aboutModal');
    },

    // ==================== 预设管理 ====================

    /**
     * 更新预设列表
     */
    updatePresetList() {
        const presets = StorageManager.getAllPresets();
        const select = this.elements.presetSelect;
        
        // 清空选项（保留第一个）
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        // 添加预设选项
        presets.forEach(preset => {
            const option = document.createElement('option');
            option.value = preset.id;
            option.textContent = preset.name;
            select.appendChild(option);
        });
    },

    /**
     * 选择预设
     */
    onPresetSelect(presetId) {
        const preset = StorageManager.getPreset(presetId);
        if (!preset) return;
        
        // 应用设置
        const settings = preset.settings;
        
        if (settings.similarity !== undefined) {
            this.elements.similaritySlider.value = settings.similarity;
            this.elements.similarityValue.textContent = `${settings.similarity}%`;
        }
        
        if (settings.repairStrength !== undefined) {
            this.elements.repairSlider.value = settings.repairStrength;
            this.elements.repairValue.textContent = `${settings.repairStrength}%`;
        }
        
        // 分辨率设置 - 已禁用此功能
        // if (settings.resolution !== undefined) {
        //     this.elements.resolutionBtns.forEach(btn => {
        //         btn.classList.toggle('active', parseInt(btn.dataset.resolution) === settings.resolution);
        //     });
        // }
        
        if (settings.powerSaveMode !== undefined) {
            this.elements.powerSaveToggle.checked = settings.powerSaveMode;
        }
        
        // 保存设置
        StorageManager.saveSettings(settings);
        
        // 通知App
        if (window.App && typeof window.App.onSettingsChange === 'function') {
            window.App.onSettingsChange(settings);
        }
        
        // 重置选择框
        this.elements.presetSelect.value = '';
        
        Utils.showToast('预设已应用', 'success');
    },

    // ==================== 状态更新 ====================

    /**
     * 更新摄像头列表
     */
    updateCameraList(devices) {
        const select = this.elements.cameraSelect;
        select.innerHTML = '';
        
        if (devices.length === 0) {
            select.innerHTML = '<option value="">未检测到摄像头</option>';
            return;
        }
        
        devices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `摄像头 ${index + 1}`;
            select.appendChild(option);
        });
    },

    /**
     * 更新FPS显示
     */
    updateFps(originalFps, swappedFps) {
        this.elements.originalFps.textContent = originalFps;
        this.elements.swappedFps.textContent = swappedFps;
    },

    /**
     * 更新延迟显示
     */
    updateLatency(latency) {
        this.elements.latency.textContent = Math.round(latency);
    },

    /**
     * 更新人脸检测状态
     */
    updateFaceStatus(detected) {
        const indicator = this.elements.faceIndicator;
        const text = this.elements.faceStatusText;
        
        if (detected) {
            indicator.className = 'w-2 h-2 rounded-full detected';
            text.textContent = '人脸已检测';
        } else {
            indicator.className = 'w-2 h-2 rounded-full lost';
            text.textContent = '未检测到人脸';
        }
    },

    /**
     * 更新换脸状态
     */
    updateSwapStatus(status) {
        this.elements.swapStatus.textContent = status;
    },

    /**
     * 更新摄像头状态
     */
    updateCameraStatus(connected) {
        this.elements.cameraStatus.textContent = connected ? '摄像头已连接' : '摄像头未连接';
    },

    /**
     * 更新GPU状态
     */
    updateGpuStatus(supported, info = '') {
        this.elements.gpuStatus.textContent = supported ? `GPU加速: 已启用` : 'GPU加速: 未支持';
    },

    /**
     * 更新API服务状态
     */
    updateApiStatus(status, text) {
        const indicator = this.elements.apiIndicator;
        const statusText = this.elements.apiStatusText;
        
        if (!indicator || !statusText) return;
        
        switch (status) {
            case 'connected':
                indicator.className = 'w-2 h-2 rounded-full bg-green-500';
                statusText.textContent = text || '已连接';
                statusText.className = 'text-xs text-green-500';
                break;
            case 'disconnected':
                indicator.className = 'w-2 h-2 rounded-full bg-red-500';
                statusText.textContent = text || '未连接';
                statusText.className = 'text-xs text-red-500';
                break;
            case 'checking':
                indicator.className = 'w-2 h-2 rounded-full bg-yellow-500 animate-pulse';
                statusText.textContent = text || '连接中...';
                statusText.className = 'text-xs text-yellow-500';
                break;
            default:
                indicator.className = 'w-2 h-2 rounded-full bg-gray-500';
                statusText.textContent = text || '未知';
                statusText.className = 'text-xs text-gray-500';
        }
    },

    /**
     * 更新性能模式显示
     */
    updatePerformanceMode(level) {
        const indicator = this.elements.performanceIndicator;
        const text = this.elements.performanceMode;
        
        switch (level) {
            case 'high':
                indicator.className = 'w-2 h-2 rounded-full good';
                text.textContent = '高性能模式';
                break;
            case 'medium':
                indicator.className = 'w-2 h-2 rounded-full medium';
                text.textContent = '标准模式';
                break;
            case 'low':
                indicator.className = 'w-2 h-2 rounded-full poor';
                text.textContent = '节能模式';
                break;
        }
    },

    /**
     * 设置换脸按钮状态
     */
    setSwapButtonState(isSwapping) {
        this.state.isSwapping = isSwapping;
        
        if (isSwapping) {
            this.elements.startBtn.classList.add('hidden');
            this.elements.stopBtn.classList.remove('hidden');
        } else {
            this.elements.startBtn.classList.remove('hidden');
            this.elements.stopBtn.classList.add('hidden');
        }
    },

    // ==================== 主题和布局 ====================

    /**
     * 加载主题
     */
    loadTheme() {
        const settings = StorageManager.getSettings();
        this.state.theme = settings.theme || 'dark';
        this.applyTheme();
    },

    /**
     * 切换主题
     */
    toggleTheme() {
        this.state.theme = this.state.theme === 'dark' ? 'light' : 'dark';
        this.applyTheme();
        StorageManager.saveSettings({ theme: this.state.theme });
    },

    /**
     * 应用主题
     */
    applyTheme() {
        const isDark = this.state.theme === 'dark';
        document.body.classList.toggle('dark', isDark);
        
        // 切换图标
        const sunIcon = document.querySelector('.sun-icon');
        const moonIcon = document.querySelector('.moon-icon');
        
        if (sunIcon && moonIcon) {
            sunIcon.classList.toggle('hidden', !isDark);
            moonIcon.classList.toggle('hidden', isDark);
        }
    },

    /**
     * 切换侧边栏
     */
    toggleSidebar() {
        this.state.sidebarOpen = !this.state.sidebarOpen;
        this.elements.sidebar.classList.toggle('open', this.state.sidebarOpen);
        this.elements.sidebarOverlay.classList.toggle('hidden', !this.state.sidebarOpen);
    },

    /**
     * 关闭侧边栏
     */
    closeSidebar() {
        this.state.sidebarOpen = false;
        this.elements.sidebar.classList.remove('open');
        this.elements.sidebarOverlay.classList.add('hidden');
    },

    /**
     * 切换画中画模式
     */
    togglePipMode() {
        this.state.isPipMode = !this.state.isPipMode;
        this.elements.swappedContainer.classList.toggle('pip-mode', this.state.isPipMode);
        
        if (this.state.isPipMode) {
            Utils.showToast('画中画模式已开启，可拖动窗口', 'info');
            this.makeDraggable(this.elements.swappedContainer);
        }
    },

    /**
     * 使元素可拖动
     */
    makeDraggable(element) {
        let isDragging = false;
        let startX, startY, initialX, initialY;
        
        element.style.cursor = 'move';
        
        element.onmousedown = (e) => {
            if (e.target.tagName === 'CANVAS') {
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                initialX = element.offsetLeft;
                initialY = element.offsetTop;
            }
        };
        
        document.onmousemove = (e) => {
            if (isDragging) {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                element.style.left = `${initialX + dx}px`;
                element.style.top = `${initialY + dy}px`;
                element.style.right = 'auto';
            }
        };
        
        document.onmouseup = () => {
            isDragging = false;
        };
    },

    // ==================== 回调函数（由App设置） ====================

    onSettingsChange(settings) {
        StorageManager.saveSettings(settings);
        if (window.App && typeof window.App.onSettingsChange === 'function') {
            window.App.onSettingsChange(settings);
        }
    },

    onResolutionChange(resolution) {
        StorageManager.saveSettings({ resolution });
        if (window.App && typeof window.App.onResolutionChange === 'function') {
            window.App.onResolutionChange(resolution);
        }
    },

    onAspectChange(aspect) {
        StorageManager.saveSettings({ aspectRatio: aspect });
        if (window.App && typeof window.App.onAspectChange === 'function') {
            window.App.onAspectChange(aspect);
        }
    },

    onCameraChange(deviceId) {
        StorageManager.saveSettings({ cameraId: deviceId });
        if (window.App && typeof window.App.onCameraChange === 'function') {
            window.App.onCameraChange(deviceId);
        }
    },

    onPowerSaveChange(enabled) {
        StorageManager.saveSettings({ powerSaveMode: enabled });
        if (window.App && typeof window.App.onPowerSaveChange === 'function') {
            window.App.onPowerSaveChange(enabled);
        }
    },

    /**
     * 换脸模型变更回调
     */
    async onSwapModelChange(modelName) {
        if (!modelName) return;
        
        // 更新按钮UI
        this.elements.swapModelBtns?.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.model === modelName);
        });
        
        // 更新描述
        const descriptions = {
            'inswapper': 'InSwapper: 速度快，效果稳定',
            'hyperswap': 'HyperSwap: 高质量，更精细'
        };
        if (this.elements.modelDescription) {
            this.elements.modelDescription.textContent = descriptions[modelName] || '';
        }
        
        // 调用API切换模型
        if (window.ApiClient) {
            Utils.showToast('正在切换模型...', 'info');
            const result = await ApiClient.switchSwapModel(modelName);
            if (result.success) {
                Utils.showToast(`已切换到 ${modelName === 'hyperswap' ? 'HyperSwap 高质量' : 'InSwapper 稳定版'} 模型`, 'success');
            } else {
                Utils.showToast(`切换失败: ${result.error}`, 'error');
            }
        }
    },
    
    /**
     * 人脸分割开关变更回调
     */
    async onFaceParserChange(enabled) {
        if (window.ApiClient) {
            await ApiClient.setServerConfig({ use_face_parser: enabled });
            Utils.showToast(enabled ? '人脸分割增强已开启' : '人脸分割增强已关闭', 'info');
        }
    },
    
    /**
     * 色彩校正开关变更回调
     */
    async onColorCorrectionChange(enabled) {
        if (window.ApiClient) {
            await ApiClient.setServerConfig({ color_correction: enabled });
            Utils.showToast(enabled ? '色彩校正已开启' : '色彩校正已关闭', 'info');
        }
    },
    
    /**
     * 更新换脸模型按钮UI
     */
    updateSwapModelUI(modelName, availableModels = []) {
        this.elements.swapModelBtns?.forEach(btn => {
            const model = btn.dataset.model;
            btn.classList.toggle('active', model === modelName);
            // 如果模型不可用，禁用按钮
            if (availableModels.length > 0 && !availableModels.includes(model)) {
                btn.classList.add('disabled');
                btn.disabled = true;
            } else {
                btn.classList.remove('disabled');
                btn.disabled = false;
            }
        });
    },

    onApiConnect() {
        const url = this.elements.apiUrlInput?.value?.trim();
        if (!url) {
            Utils.showToast('请输入API服务器地址', 'error');
            return;
        }
        
        // 验证URL格式
        try {
            new URL(url);
        } catch (e) {
            Utils.showToast('API地址格式不正确', 'error');
            return;
        }
        
        if (window.App && typeof window.App.onApiUrlChange === 'function') {
            window.App.onApiUrlChange(url);
        }
    },

    onStartSwap() {
        if (window.App && typeof window.App.startSwap === 'function') {
            window.App.startSwap();
        }
    },

    onStopSwap() {
        if (window.App && typeof window.App.stopSwap === 'function') {
            window.App.stopSwap();
        }
    },

    // ==================== 键盘快捷键 ====================

    handleKeyboard(e) {
        // Escape 关闭弹窗
        if (e.key === 'Escape') {
            Utils.hideModal();
            this.closeSidebar();
            
            if (this.state.isPipMode) {
                this.togglePipMode();
            }
        }
        
        // Space 开始/停止换脸
        if (e.key === ' ' && e.target.tagName !== 'INPUT') {
            e.preventDefault();
            if (this.state.isSwapping) {
                this.onStopSwap();
            } else {
                this.onStartSwap();
            }
        }
    },

    /**
     * 加载设置到UI
     */
    loadSettings() {
        const settings = StorageManager.getSettings();
        
        // 相似度
        this.elements.similaritySlider.value = settings.similarity;
        this.elements.similarityValue.textContent = `${settings.similarity}%`;
        
        // 修复强度
        this.elements.repairSlider.value = settings.repairStrength;
        this.elements.repairValue.textContent = `${settings.repairStrength}%`;
        
        // 分辨率
        this.elements.resolutionBtns.forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.resolution) === settings.resolution);
        });
        
        // 节能模式
        this.elements.powerSaveToggle.checked = settings.powerSaveMode;
        
        // 摄像头
        if (settings.cameraId) {
            this.elements.cameraSelect.value = settings.cameraId;
        }
        
        // API地址
        if (settings.apiUrl && this.elements.apiUrlInput) {
            this.elements.apiUrlInput.value = settings.apiUrl;
        }
    },
    
    /**
     * 切换OBS全屏模式
     */
    toggleObsFullscreen() {
        if (window.App && typeof window.App.toggleObsFullscreen === 'function') {
            window.App.toggleObsFullscreen();
        }
    },
        
    /**
     * 隐藏激活层
     */
    hideActivationLayer() {
        const activationOverlay = document.getElementById('activationOverlay');
        if (activationOverlay) {
            activationOverlay.style.display = 'none';
        }
    },
        
    /**
     * 显示激活层
     */
    showActivationLayer() {
        const activationOverlay = document.getElementById('activationOverlay');
        if (activationOverlay) {
            activationOverlay.style.display = 'flex';
        }
    },
};

// 导出到全局
window.UI = UI;
