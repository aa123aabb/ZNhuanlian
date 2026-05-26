# AI换脸应用 (AI Face Swap)

基于深度学习技术的实时人脸交换工具，支持视频通话、直播(OBS)、娱乐等场景。所有AI推理在本地完成，保障隐私安全。

## 核心功能

- **实时换脸**: 基于 inswapper_128 模型的高质量人脸交换
- **多模型支持**: inswapper_128、inswapper FP16、HyperSwap 256
- **人脸检测**: RetinaFace / SCRFD ONNX 人脸检测，5点关键点识别
- **人脸修复**: GFPGAN v1.4 人脸增强与超分辨率
- **OBS集成**: 无缝对接OBS虚拟摄像头，支持9:16竖屏和16:9横屏
- **本地处理**: 所有运算在本地完成，不上传任何数据
- **硬件加速**: 自动检测并启用 DirectML / CUDA GPU加速

## 技术栈

- **后端**: Python 3.11 + Flask + ONNX Runtime + OpenCV
- **前端**: 原生 JavaScript + Tailwind CSS
- **模型**: InsightFace (ArcFace), inswapper_128, GFPGAN, SCRFD

## 快速开始

### 环境要求

- Windows 10+ / Linux / macOS
- Python 3.11+
- 推荐: 支持DirectML的GPU (NVIDIA/AMD/Intel) 或 Apple Silicon

### 安装与运行

```bash
# 1. 安装依赖
pip install flask flask-cors flask-compress opencv-python onnxruntime-directml insightface numpy

# 2. 确保 models/ 目录包含所需模型文件
#    - models/buffalo_l/det_10g.onnx (人脸检测)
#    - models/inswapper_128.onnx (换脸模型)

# 3. 启动应用
python main.py

# 或使用启动器
python launcher.py
```

启动后访问 `http://localhost:5000`

## 项目结构

```
faceswap/
├── main.py              # 后端服务 (Flask + ONNX Runtime)
├── launcher.py          # 启动器
├── index.html           # 前端页面
├── js/                  # 前端JS模块 (11个)
├── css/                 # 样式文件
├── models/              # AI模型文件 (~1.5GB)
├── libs/                # 离线Python依赖
└── venv/                # Python虚拟环境
```

## 许可证

本项目采用 [MIT License](LICENSE)。

> 注意: `libs/` 和 `venv/` 目录中的第三方库各有其独立的开源许可证。

## 免责声明

本工具仅供娱乐用途，严禁用于非法活动。使用者需遵守当地法律法规。
