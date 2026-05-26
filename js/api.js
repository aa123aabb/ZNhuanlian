/**
 * API客户端模块
 * 处理与后端InsightFace服务的通信
 * 支持多种换脸模型和高级功能
 */

const ApiClient = {
    // 默认API地址（本地exe使用localhost:5000）
    baseUrl: 'http://localhost:5000',
    
    // 状态
    state: {
        connected: false,
        sourceFaceSet: false,
        checking: false,
        lastError: null,
        availableModels: [],
        currentModel: 'inswapper'
    },
    
    // 服务器配置
    serverConfig: {
        swap_model: 'inswapper',
        use_face_parser: true,
        color_correction: true,
        blend_strength: 0.9
    },
    
    // 配置
    config: {
        timeout: 10000,      // 请求超时时间（毫秒）
        retryCount: 2,       // 重试次数
        retryDelay: 1000     // 重试延迟（毫秒）
    },
    
    /**
     * 设置API地址
     * @param {string} url - API基础地址
     */
    setBaseUrl(url) {
        // 移除末尾斜杠
        this.baseUrl = url.replace(/\/+$/, '');
        // 重置状态
        this.state.connected = false;
        this.state.sourceFaceSet = false;
        this.state.lastError = null;
    },
    
    /**
     * 获取当前API地址
     */
    getBaseUrl() {
        return this.baseUrl;
    },
    
    /**
     * 带超时的fetch请求
     */
    async fetchWithTimeout(url, options = {}, timeout = this.config.timeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('请求超时');
            }
            throw error;
        }
    },
    
    /**
     * 健康检查
     */
    async healthCheck() {
        if (this.state.checking) {
            return { status: 'checking', message: '正在检查中...' };
        }
        
        this.state.checking = true;
        
        try {
            const response = await this.fetchWithTimeout(
                `${this.baseUrl}/health`,
                { method: 'GET' },
                5000  // 健康检查用较短超时
            );
            
            if (response.ok) {
                const data = await response.json();
                this.state.connected = data.status === 'ok';
                this.state.lastError = null;
                this.state.availableModels = data.swap_models || [];
                this.state.currentModel = data.current_swap_model || 'inswapper';
                return data;
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('API健康检查失败:', error);
            this.state.connected = false;
            this.state.lastError = error.message;
            return { 
                status: 'error', 
                error: error.message,
                suggestion: this.getErrorSuggestion(error)
            };
        } finally {
            this.state.checking = false;
        }
    },
    
    /**
     * 获取错误建议
     */
    getErrorSuggestion(error) {
        const msg = error.message || '';
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
            return '无法连接到服务器，请检查：1.服务器是否启动 2.防火墙是否开放端口 3.API地址是否正确';
        }
        if (msg.includes('超时')) {
            return '连接超时，服务器可能未响应或网络较慢';
        }
        if (msg.includes('CORS')) {
            return '跨域错误，请确保服务器已启用CORS';
        }
        return '请检查服务器状态和网络连接';
    },
    
    /**
     * 设置源人脸（要换成的目标脸）
     * @param {string} imageData - Base64编码的图片数据
     */
    async setSourceFace(imageData) {
        if (!this.state.connected) {
            // 先尝试连接
            const health = await this.healthCheck();
            if (!this.state.connected) {
                return { success: false, error: '服务器未连接', suggestion: health.suggestion };
            }
        }
        
        try {
            const response = await this.fetchWithTimeout(`${this.baseUrl}/set_source`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageData })
            });
            
            const data = await response.json();
            this.state.sourceFaceSet = data.success;
            
            if (data.success) {
            } else {
                console.warn('源人脸设置失败:', data.error);
            }
            
            return data;
        } catch (error) {
            console.error('设置源人脸失败:', error);
            this.state.sourceFaceSet = false;
            return { success: false, error: error.message };
        }
    },
    
    /**
     * 获取激活 token
     */
    getActivationToken() {
        return sessionStorage.getItem('activation_token') || '';
    },
    
    /**
     * 执行换脸
     * @param {string} imageData - Base64编码的视频帧图片
     * @returns {Promise<{success: boolean, image?: string, processTime?: number, error?: string}>}
     */
    async swapFace(imageData) {
        if (!this.state.connected) {
            console.warn('[API] swapFace: 服务器未连接');
            return { success: false, error: '服务器未连接' };
        }
        
        if (!this.state.sourceFaceSet) {
            console.warn('[API] swapFace: 源人脸未设置');
            return { success: false, error: '请先设置源人脸' };
        }
        
        try {
            const token = this.getActivationToken();
            const response = await this.fetchWithTimeout(`${this.baseUrl}/swap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageData, activation_token: token })
            });
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('[API] 换脸请求失败:', error);
            return { success: false, error: error.message };
        }
    },
    
    /**
     * 清除源人脸
     */
    async clearSourceFace() {
        try {
            const response = await this.fetchWithTimeout(`${this.baseUrl}/clear`, {
                method: 'POST'
            });
            
            const data = await response.json();
            if (data.success) {
                this.state.sourceFaceSet = false;
            }
            return data;
        } catch (error) {
            console.error('清除源人脸失败:', error);
            // 即使请求失败，也重置本地状态
            this.state.sourceFaceSet = false;
            return { success: false, error: error.message };
        }
    },
    
    /**
     * 检查是否连接到后端
     */
    isConnected() {
        return this.state.connected;
    },
    
    /**
     * 检查源人脸是否已设置
     */
    isSourceFaceSet() {
        return this.state.sourceFaceSet;
    },
    
    /**
     * 获取最后的错误信息
     */
    getLastError() {
        return this.state.lastError;
    },
    
    /**
     * 获取状态摘要
     */
    getStatus() {
        return {
            url: this.baseUrl,
            connected: this.state.connected,
            sourceFaceSet: this.state.sourceFaceSet,
            lastError: this.state.lastError,
            availableModels: this.state.availableModels,
            currentModel: this.state.currentModel
        };
    },
    
    /**
     * 获取服务器配置
     */
    async getServerConfig() {
        try {
            const response = await this.fetchWithTimeout(`${this.baseUrl}/get_config`, {
                method: 'GET'
            });
            const data = await response.json();
            if (data.success) {
                this.serverConfig = data.config;
                this.state.availableModels = data.available_models || [];
            }
            return data;
        } catch (error) {
            console.error('获取配置失败:', error);
            return { success: false, error: error.message };
        }
    },
    
    /**
     * 设置服务器配置
     */
    async setServerConfig(config) {
        try {
            const response = await this.fetchWithTimeout(`${this.baseUrl}/set_config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            const data = await response.json();
            if (data.success) {
                this.serverConfig = data.config;
                this.state.currentModel = data.config.swap_model;
            }
            return data;
        } catch (error) {
            console.error('设置配置失败:', error);
            return { success: false, error: error.message };
        }
    },
    
    /**
     * 切换换脸模型
     */
    async switchSwapModel(modelName) {
        return await this.setServerConfig({ swap_model: modelName });
    },
    
    /**
     * 获取可用的换脸模型列表
     */
    getAvailableModels() {
        return this.state.availableModels;
    },
    
    /**
     * 获取当前换脸模型
     */
    getCurrentModel() {
        return this.state.currentModel;
    }
};

// 导出到全局
window.ApiClient = ApiClient;