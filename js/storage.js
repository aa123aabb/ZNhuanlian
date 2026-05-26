/**
 * 存储管理模块 - IndexedDB + LocalStorage
 */

const StorageManager = {
    // IndexedDB数据库名
    DB_NAME: 'FaceSwapDB',
    DB_VERSION: 1,
    // 存储表名
    STORE_FACES: 'faces',
    // LocalStorage键名
    LS_PRESETS: 'faceswap_presets',
    LS_SETTINGS: 'faceswap_settings',
    LS_SELECTED_FACE: 'faceswap_selected_face',
    // 最大素材数量
    MAX_FACES: 8,
    // 数据库实例
    db: null,

    /**
     * 初始化存储
     */
    async init() {
        try {
            this.db = await this.openDatabase();
            return true;
        } catch (error) {
            console.error('Error initializing StorageManager:', error);
            return false;
        }
    },

    /**
     * 打开IndexedDB数据库
     */
    openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            
            request.onerror = () => {
                reject(request.error);
            };
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // 创建人脸素材存储表
                if (!db.objectStoreNames.contains(this.STORE_FACES)) {
                    const store = db.createObjectStore(this.STORE_FACES, { keyPath: 'id' });
                    store.createIndex('name', 'name', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
            };
        });
    },

    // ==================== 人脸素材管理 ====================

    /**
     * 保存人脸素材
     * @param {object} face - 人脸数据
     * @param {string} face.id - 唯一ID
     * @param {string} face.name - 素材名称
     * @param {string} face.imageData - 图片Base64数据
     * @param {string} face.thumbnail - 缩略图Base64数据
     * @param {Array} face.landmarks - 特征点数据
     */
    async saveFace(face) {
        // 检查数量限制
        const count = await this.getFaceCount();
        if (count >= this.MAX_FACES) {
            throw new Error(`素材数量已达上限（${this.MAX_FACES}个）`);
        }
        
        const faceData = {
            id: face.id || Utils.generateId(),
            name: face.name || `素材${count + 1}`,
            imageData: face.imageData,
            thumbnail: face.thumbnail,
            landmarks: face.landmarks,
            createdAt: Date.now()
        };
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_FACES], 'readwrite');
            const store = transaction.objectStore(this.STORE_FACES);
            const request = store.put(faceData);
            
            request.onsuccess = () => resolve(faceData);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * 获取所有人脸素材
     */
    async getAllFaces() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_FACES], 'readonly');
            const store = transaction.objectStore(this.STORE_FACES);
            const request = store.getAll();
            
            request.onsuccess = () => {
                // 按创建时间排序
                const faces = request.result.sort((a, b) => a.createdAt - b.createdAt);
                resolve(faces);
            };
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * 获取单个人脸素材
     * @param {string} id - 素材ID
     */
    async getFace(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_FACES], 'readonly');
            const store = transaction.objectStore(this.STORE_FACES);
            const request = store.get(id);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * 更新人脸素材
     * @param {string} id - 素材ID
     * @param {object} updates - 更新内容
     */
    async updateFace(id, updates) {
        const face = await this.getFace(id);
        if (!face) {
            throw new Error('素材不存在');
        }
        
        const updatedFace = { ...face, ...updates };
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_FACES], 'readwrite');
            const store = transaction.objectStore(this.STORE_FACES);
            const request = store.put(updatedFace);
            
            request.onsuccess = () => resolve(updatedFace);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * 删除人脸素材
     * @param {string} id - 素材ID
     */
    async deleteFace(id) {
        // 如果删除的是当前选中的素材，清除选中状态
        const selectedId = this.getSelectedFaceId();
        if (selectedId === id) {
            this.setSelectedFaceId(null);
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_FACES], 'readwrite');
            const store = transaction.objectStore(this.STORE_FACES);
            const request = store.delete(id);
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * 获取素材数量
     */
    async getFaceCount() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_FACES], 'readonly');
            const store = transaction.objectStore(this.STORE_FACES);
            const request = store.count();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * 清空所有人脸素材
     */
    async clearAllFaces() {
        this.setSelectedFaceId(null);
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_FACES], 'readwrite');
            const store = transaction.objectStore(this.STORE_FACES);
            const request = store.clear();
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    },

    // ==================== 选中素材管理 ====================

    /**
     * 设置选中的素材ID
     * @param {string|null} id - 素材ID
     */
    setSelectedFaceId(id) {
        if (id) {
            localStorage.setItem(this.LS_SELECTED_FACE, id);
        } else {
            localStorage.removeItem(this.LS_SELECTED_FACE);
        }
    },

    /**
     * 获取选中的素材ID
     */
    getSelectedFaceId() {
        return localStorage.getItem(this.LS_SELECTED_FACE);
    },

    /**
     * 获取选中的素材数据
     */
    async getSelectedFace() {
        const id = this.getSelectedFaceId();
        if (!id) return null;
        return await this.getFace(id);
    },

    // ==================== 预设管理 ====================

    /**
     * 保存预设
     * @param {object} preset - 预设数据
     * @param {string} preset.name - 预设名称
     * @param {object} preset.settings - 设置内容
     */
    savePreset(preset) {
        const presets = this.getAllPresets();
        const presetData = {
            id: Utils.generateId(),
            name: preset.name,
            settings: preset.settings,
            createdAt: Date.now()
        };
        
        presets.push(presetData);
        localStorage.setItem(this.LS_PRESETS, JSON.stringify(presets));
        
        return presetData;
    },

    /**
     * 获取所有预设
     */
    getAllPresets() {
        try {
            const data = localStorage.getItem(this.LS_PRESETS);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    },

    /**
     * 获取单个预设
     * @param {string} id - 预设ID
     */
    getPreset(id) {
        const presets = this.getAllPresets();
        return presets.find(p => p.id === id);
    },

    /**
     * 删除预设
     * @param {string} id - 预设ID
     */
    deletePreset(id) {
        const presets = this.getAllPresets();
        const filtered = presets.filter(p => p.id !== id);
        localStorage.setItem(this.LS_PRESETS, JSON.stringify(filtered));
    },

    /**
     * 更新预设
     * @param {string} id - 预设ID
     * @param {object} updates - 更新内容
     */
    updatePreset(id, updates) {
        const presets = this.getAllPresets();
        const index = presets.findIndex(p => p.id === id);
        if (index === -1) return null;
        
        presets[index] = { ...presets[index], ...updates };
        localStorage.setItem(this.LS_PRESETS, JSON.stringify(presets));
        
        return presets[index];
    },

    // ==================== 设置管理 ====================

    /**
     * 保存设置
     * @param {object} settings - 设置对象
     */
    saveSettings(settings) {
        const currentSettings = this.getSettings();
        const newSettings = { ...currentSettings, ...settings };
        localStorage.setItem(this.LS_SETTINGS, JSON.stringify(newSettings));
        return newSettings;
    },

    /**
     * 获取设置
     */
    getSettings() {
        try {
            const data = localStorage.getItem(this.LS_SETTINGS);
            return data ? JSON.parse(data) : this.getDefaultSettings();
        } catch (e) {
            return this.getDefaultSettings();
        }
    },

    /**
     * 获取默认设置
     */
    getDefaultSettings() {
        return {
            similarity: 60,         // 相似度 0-100
            repairStrength: 50,     // 修复强度 0-80
            resolution: 720,        // 分辨率 480/720 - 现在默认使用720p
            aspectRatio: '9:16',    // 比例 16:9/9:16，默认竖屏
            powerSaveMode: false,   // 节能模式
            theme: 'dark',          // 主题 dark/light
            cameraId: null,         // 摄像头设备ID
            firstVisit: true,       // 首次访问
            apiUrl: 'http://localhost:5000'  // API服务器地址，本地exe默认localhost
        };
    },

    /**
     * 重置设置
     */
    resetSettings() {
        const defaultSettings = this.getDefaultSettings();
        localStorage.setItem(this.LS_SETTINGS, JSON.stringify(defaultSettings));
        return defaultSettings;
    },

    // ==================== 数据导出导入 ====================

    /**
     * 导出所有数据
     */
    async exportData() {
        const faces = await this.getAllFaces();
        const presets = this.getAllPresets();
        const settings = this.getSettings();
        const selectedFaceId = this.getSelectedFaceId();
        
        return {
            version: 1,
            exportedAt: Date.now(),
            faces,
            presets,
            settings,
            selectedFaceId
        };
    },

    /**
     * 导入数据
     * @param {object} data - 导入的数据
     */
    async importData(data) {
        if (!data || data.version !== 1) {
            throw new Error('无效的数据格式');
        }
        
        // 清空现有数据
        await this.clearAllFaces();
        
        // 导入人脸素材
        if (data.faces && Array.isArray(data.faces)) {
            for (const face of data.faces) {
                await this.saveFace(face);
            }
        }
        
        // 导入预设
        if (data.presets && Array.isArray(data.presets)) {
            localStorage.setItem(this.LS_PRESETS, JSON.stringify(data.presets));
        }
        
        // 导入设置
        if (data.settings) {
            localStorage.setItem(this.LS_SETTINGS, JSON.stringify(data.settings));
        }
        
        // 导入选中的素材
        if (data.selectedFaceId) {
            this.setSelectedFaceId(data.selectedFaceId);
        }
        
        return true;
    },

    /**
     * 清除所有数据
     */
    async clearAllData() {
        await this.clearAllFaces();
        localStorage.removeItem(this.LS_PRESETS);
        localStorage.removeItem(this.LS_SETTINGS);
        localStorage.removeItem(this.LS_SELECTED_FACE);
    },

    /**
     * 获取存储使用情况
     */
    async getStorageUsage() {
        let indexedDBSize = 0;
        let localStorageSize = 0;
        
        // 计算IndexedDB大小（估算）
        const faces = await this.getAllFaces();
        faces.forEach(face => {
            indexedDBSize += face.imageData?.length || 0;
            indexedDBSize += face.thumbnail?.length || 0;
            indexedDBSize += JSON.stringify(face.landmarks || []).length;
        });
        
        // 计算LocalStorage大小
        for (const key in localStorage) {
            if (key.startsWith('faceswap_')) {
                localStorageSize += localStorage.getItem(key).length;
            }
        }
        
        return {
            indexedDB: indexedDBSize,
            localStorage: localStorageSize,
            total: indexedDBSize + localStorageSize,
            formatted: {
                indexedDB: Utils.formatFileSize(indexedDBSize),
                localStorage: Utils.formatFileSize(localStorageSize),
                total: Utils.formatFileSize(indexedDBSize + localStorageSize)
            }
        };
    }
};

// 导出到全局
window.StorageManager = StorageManager;
