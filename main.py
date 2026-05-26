"""
AI换脸应用 - 娱乐版
仅供娱乐用途
"""

import os
import sys
import threading
import time
import webbrowser
import platform
import subprocess
from queue import Queue, Empty
from functools import lru_cache
from collections import deque
import hashlib
import datetime

def check_and_install_dependencies():
    """检查并安装必要的依赖 - 自动GPU加速检测"""
    if getattr(sys, 'frozen', False):
        print("[依赖检查] 打包版本，跳过依赖安装")
        return
    
    required_deps = {
        'flask_compress': 'flask-compress',
        'cv2': 'opencv-python',
        'numpy': 'numpy',
        'onnxruntime': 'onnxruntime-directml',
        'insightface': 'insightface'
    }
    missing_deps = []
    
    for import_name, pip_name in required_deps.items():
        try:
            __import__(import_name)
            print(f"[依赖检查] {import_name} 已安装")
        except ImportError:
            missing_deps.append(pip_name)
    
    if missing_deps:
        print(f"[依赖检查] 缺少依赖: {', '.join(missing_deps)}")
        print(f"[依赖检查] 检测到Windows系统，优先使用DirectML GPU加速（兼容性最佳）")
        
        import subprocess
        install_cmd = [sys.executable, '-m', 'pip', 'install'] + missing_deps + ['flask', 'flask-cors', '--quiet']
        print(f"[依赖检查] 正在安装依赖...")
        try:
            result = subprocess.run(install_cmd, capture_output=True, text=True, timeout=300)
            if result.returncode == 0:
                print(f"[依赖检查] 依赖安装完成，使用 onnxruntime-directml (DirectML GPU加速)")
            else:
                print(f"[依赖检查] 安装失败: {result.stderr}")
        except Exception as e:
            print(f"[依赖检查] 自动安装失败: {e}")
            print("[依赖检查] 请手动安装: pip install onnxruntime-directml opencv-python insightface flask flask-cors flask-compress numpy")

# 启动时检查依赖（静默模式）
check_and_install_dependencies()

# 设置工作目录
if getattr(sys, 'frozen', False):
    # PyInstaller打包后
    BASE_DIR = os.path.dirname(sys.executable)
    # 尝试多个可能的模型路径
    possible_model_paths = [
        os.path.join(BASE_DIR, "models"),
        os.path.join(BASE_DIR, "_internal", "models"),
        os.path.join(os.path.dirname(BASE_DIR), "models"),
    ]
    MODEL_PATH = None
    for p in possible_model_paths:
        if os.path.exists(p) and os.path.isdir(p):
            MODEL_PATH = p
            break
    if MODEL_PATH is None:
        MODEL_PATH = possible_model_paths[0]  # 默认使用第一个路径
else:
    # 开发模式
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    MODEL_PATH = os.path.join(BASE_DIR, "models")

os.chdir(BASE_DIR)

# 模型加载状态追踪
model_load_errors = []

# ============== 智能性能调度与资源分配系统 ==============
import concurrent.futures
from concurrent.futures import ThreadPoolExecutor
import asyncio
import time
from collections import deque

class PerformanceScheduler:
    """智能性能调度器 - 参考Deep-Live-Cam架构"""
    
    def __init__(self, hardware_optimizer):
        self.hardware_optimizer = hardware_optimizer
        self.performance_level = hardware_optimizer.performance_level
        
        # 动态线程池配置
        self.max_workers = self._calculate_max_workers()
        self.executor = ThreadPoolExecutor(max_workers=self.max_workers)
        
        # 性能监控
        self.frame_times = deque(maxlen=60)  # 记录最近60帧的处理时间
        self.fps_target = self._calculate_fps_target()
        self.adaptive_quality = True
        
        # 资源管理
        self.memory_usage = 0
        self.gpu_utilization = 0
        self.last_gc_time = time.time()
        
        print(f"[性能调度] 初始化完成 - 工作线程: {self.max_workers}, 目标FPS: {self.fps_target}")
    
    def _calculate_max_workers(self):
        """根据性能等级计算最大工作线程数"""
        config = {
            'ultra': min(4, self.hardware_optimizer.cpu_cores),
            'high': min(2, self.hardware_optimizer.cpu_cores),
            'medium': 1,
            'low': 1
        }
        return config.get(self.performance_level, 1)
    
    def _calculate_fps_target(self):
        """根据性能等级计算目标FPS"""
        config = {
            'ultra': 30,
            'high': 25,
            'medium': 20,
            'low': 15
        }
        return config.get(self.performance_level, 15)
    
    def submit_task(self, func, *args, **kwargs):
        """提交任务到线程池，带智能调度"""
        # 检查系统负载
        if self._is_system_overloaded():
            # 系统过载时降低任务优先级或跳过
            if self.performance_level in ['low', 'medium']:
                # 低性能设备跳过任务以保持流畅性
                return None
        
        return self.executor.submit(func, *args, **kwargs)
    
    def _is_system_overloaded(self):
        """检查系统是否过载"""
        # 检查最近帧处理时间
        if len(self.frame_times) >= 10:
            avg_frame_time = sum(self.frame_times) / len(self.frame_times)
            target_frame_time = 1000.0 / self.fps_target
            
            # 如果平均帧时间超过目标的1.5倍，认为系统过载
            if avg_frame_time > target_frame_time * 1.5:
                return True
        
        # 检查内存使用（如果可用）
        try:
            import psutil
            memory_percent = psutil.virtual_memory().percent
            if memory_percent > 85:  # 内存使用超过85%
                return True
        except:
            pass
            
        return False
    
    def record_frame_time(self, frame_time):
        """记录帧处理时间"""
        self.frame_times.append(frame_time)
        
        # 动态调整性能
        self._adaptive_performance_adjustment()
    
    def _adaptive_performance_adjustment(self):
        """自适应性能调整"""
        if not self.adaptive_quality or len(self.frame_times) < 20:
            return
        
        avg_frame_time = sum(self.frame_times) / len(self.frame_times)
        target_frame_time = 1000.0 / self.fps_target
        
        # 如果性能不达标，动态调整质量设置
        if avg_frame_time > target_frame_time * 1.2:
            # 降低质量设置
            self._reduce_quality_settings()
        elif avg_frame_time < target_frame_time * 0.8:
            # 提高质量设置
            self._increase_quality_settings()
    
    def _reduce_quality_settings(self):
        """降低质量设置以提升性能"""
        global DETECT_SCALE, PROCESS_SCALE, DETECT_SKIP_FRAMES
        
        # 逐步降低质量
        if DETECT_SCALE > 0.2:
            DETECT_SCALE = max(0.2, DETECT_SCALE * 0.9)
        if PROCESS_SCALE > 0.3:
            PROCESS_SCALE = max(0.3, PROCESS_SCALE * 0.9)
        if DETECT_SKIP_FRAMES < 15:
            DETECT_SKIP_FRAMES = min(15, DETECT_SKIP_FRAMES + 1)
        
        print(f"[性能调度] 降低质量设置 - 检测缩放: {DETECT_SCALE:.2f}, 处理缩放: {PROCESS_SCALE:.2f}, 跳过帧: {DETECT_SKIP_FRAMES}")
    
    def _increase_quality_settings(self):
        """提高质量设置以利用空闲资源"""
        global DETECT_SCALE, PROCESS_SCALE, DETECT_SKIP_FRAMES
        
        # 逐步提高质量
        if DETECT_SCALE < 0.8:
            DETECT_SCALE = min(0.8, DETECT_SCALE * 1.1)
        if PROCESS_SCALE < 0.9:
            PROCESS_SCALE = min(0.9, PROCESS_SCALE * 1.1)
        if DETECT_SKIP_FRAMES > 2:
            DETECT_SKIP_FRAMES = max(2, DETECT_SKIP_FRAMES - 1)
        
        print(f"[性能调度] 提高质量设置 - 检测缩放: {DETECT_SCALE:.2f}, 处理缩放: {PROCESS_SCALE:.2f}, 跳过帧: {DETECT_SKIP_FRAMES}")
    
    def cleanup(self):
        """清理资源"""
        self.executor.shutdown(wait=True)
        print("[性能调度] 资源清理完成")

# 性能调度器实例（稍后初始化）
performance_scheduler = None
executor = None

# ============== 性能优化：内存复用 ==============
import gc

# 全局缓存对象，避免重复创建
global_temp_arrays = {}

# 固定尺寸列表 - 避免动态分配
_FIXED_SHAPES = [(128, 128), (256, 256), (320, 320), (128, 128, 3), (256, 256, 3), (320, 320, 3)]

def get_temp_array(shape, dtype):
    """获取临时数组，使用固定尺寸就近匹配"""
    # 尝试就近匹配固定尺寸
    target_shape = shape
    for fixed in _FIXED_SHAPES:
        if len(fixed) == len(shape):
            if all(fixed[i] >= shape[i] for i in range(len(shape))):
                target_shape = fixed
                break
    
    key = (target_shape, dtype)
    if key not in global_temp_arrays:
        global_temp_arrays[key] = np.empty(target_shape, dtype=dtype)
    return global_temp_arrays[key][:shape[0], :shape[1]] if len(shape) >= 2 else global_temp_arrays[key]

def clear_temp_arrays():
    """清理临时数组"""
    global global_temp_arrays
    global_temp_arrays.clear()
    gc.collect()

# ============== 智能硬件检测与自动优化系统 ==============
class HardwareOptimizer:
    """智能硬件检测与自动性能优化 - 参考Deep-Live-Cam架构"""
    
    def __init__(self):
        self.gpu_info = None
        self.gpu_type = None  # 'nvidia', 'amd', 'intel', 'apple', 'none'
        self.gpu_memory = 0  # MB
        self.cpu_cores = os.cpu_count() or 4
        self.system_memory = self._get_system_memory()
        self.optimal_provider = 'CPUExecutionProvider'
        self.performance_level = 'low'  # 'low', 'medium', 'high', 'ultra'
        self.available_providers = []
        
    def _get_system_memory(self):
        """获取系统内存大小"""
        try:
            if platform.system() == "Windows":
                import ctypes
                kernel32 = ctypes.windll.kernel32
                ctypes.windll.kernel32.GetPhysicallyInstalledSystemMemory.argtypes = [ctypes.POINTER(ctypes.c_ulonglong)]
                mem_kb = ctypes.c_ulonglong()
                if kernel32.GetPhysicallyInstalledSystemMemory(ctypes.byref(mem_kb)):
                    return mem_kb.value // (1024 * 1024)  # 转换为GB
            elif platform.system() == "Darwin":
                import subprocess
                result = subprocess.run(['sysctl', '-n', 'hw.memsize'], capture_output=True, text=True)
                return int(result.stdout.strip()) // (1024 * 1024 * 1024)  # 转换为GB
            else:
                with open('/proc/meminfo', 'r') as f:
                    for line in f:
                        if line.startswith('MemTotal:'):
                            return int(line.split()[1]) // (1024 * 1024)  # 转换为GB
        except:
            pass
        return 8  # 默认8GB
    
    def detect_hardware_comprehensive(self):
        """全面硬件检测 - 优化为快速检测避免卡顿"""
        print("[硬件检测] 开始快速硬件检测...")
        
        # 快速检测：先检测ONNX提供者，再根据结果选择GPU检测方式
        self._scan_onnx_providers()
        
        # 简化GPU检测：只检测基本类型，避免复杂命令
        self._detect_gpu_simple()
        
        # 快速CPU检测
        self._detect_cpu_features()
        
        # 确定最优设置
        self._determine_optimal_settings()
        
        print("[硬件检测] 快速硬件检测完成")
        
    def _detect_gpu_simple(self):
        """简化GPU检测 - 避免复杂命令调用导致卡顿"""
        try:
            # 检测平台
            system = platform.system()
            
            # 简化检测：基于ONNX提供者推断GPU类型
            if 'CUDAExecutionProvider' in self.available_providers:
                self.gpu_type = 'nvidia'
                self.gpu_info = 'NVIDIA GPU (CUDA可用)'
                self.gpu_memory = 4000  # 默认4GB，避免复杂检测
            elif 'DmlExecutionProvider' in self.available_providers:
                # DirectML通常表示Windows平台有GPU
                self.gpu_type = 'windows_gpu'
                self.gpu_info = 'Windows GPU (DirectML可用)'
                self.gpu_memory = 2000  # 默认2GB
            elif 'CoreMLExecutionProvider' in self.available_providers:
                self.gpu_type = 'apple'
                self.gpu_info = 'Apple Silicon GPU'
                self.gpu_memory = self.system_memory * 1024 // 2
            else:
                self.gpu_type = 'none'
                self.gpu_info = 'CPU模式'
                self.gpu_memory = 0
                
            print(f"[硬件检测] GPU: {self.gpu_info}, 显存: {self.gpu_memory}MB")
                
        except Exception as e:
            print(f"[硬件检测] 简化GPU检测失败: {e}")
            self.gpu_type = 'none'
            self.gpu_info = '检测失败，使用CPU模式'
    
    def detect_gpu(self):
        """GPU检测方法 - 兼容性包装器"""
        self._detect_gpu_simple()
    
    def _detect_windows_gpu(self):
        """Windows平台GPU检测"""
        try:
            # 使用wmic检测显卡
            result = subprocess.run(
                ['wmic', 'path', 'win32_VideoController', 'get', 'name,adapterram,driverversion'],
                capture_output=True, text=True, timeout=10
            )
            output = result.stdout.lower()
            
            # NVIDIA检测
            if any(keyword in output for keyword in ['nvidia', 'geforce', 'rtx', 'gtx', 'quadro']):
                self.gpu_type = 'nvidia'
                self.gpu_info = 'NVIDIA GPU'
                # 检测CUDA版本
                self._detect_cuda_version()
            # AMD检测
            elif any(keyword in output for keyword in ['amd', 'radeon', 'rx']):
                self.gpu_type = 'amd'
                self.gpu_info = 'AMD GPU'
            # Intel检测
            elif any(keyword in output for keyword in ['intel', 'iris', 'uhd', 'arc']):
                self.gpu_type = 'intel'
                self.gpu_info = 'Intel GPU'
            else:
                self.gpu_type = 'none'
                self.gpu_info = '集成显卡或未识别显卡'
                
            # 获取显存大小
            self._extract_gpu_memory(result.stdout)
            
            print(f"[硬件检测] GPU: {self.gpu_info}, 显存: {self.gpu_memory}MB")
            
        except Exception as e:
            print(f"[Windows GPU检测] 失败: {e}")
    
    def _detect_linux_gpu(self):
        """Linux平台GPU检测"""
        try:
            # 检测NVIDIA
            result = subprocess.run(['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader'], 
                                  capture_output=True, text=True, timeout=5)
            if result.returncode == 0:
                self.gpu_type = 'nvidia'
                lines = result.stdout.strip().split('\n')
                if lines:
                    self.gpu_info = lines[0].split(',')[0].strip()
                    # 提取显存
                    mem_str = lines[0].split(',')[1].strip().replace(' MiB', '')
                    self.gpu_memory = int(mem_str) if mem_str.isdigit() else 0
                return
                
            # 检测AMD
            result = subprocess.run(['rocminfo'], capture_output=True, text=True, timeout=5)
            if result.returncode == 0:
                self.gpu_type = 'amd'
                self.gpu_info = 'AMD ROCm GPU'
                return
                
            # Intel集成显卡
            self.gpu_type = 'intel'
            self.gpu_info = 'Intel集成显卡'
            
        except:
            self.gpu_type = 'none'
            self.gpu_info = 'Linux平台未检测到专用GPU'
    
    def _detect_cuda_version(self):
        """检测CUDA版本"""
        try:
            result = subprocess.run(['nvcc', '--version'], capture_output=True, text=True)
            if result.returncode == 0:
                for line in result.stdout.split('\n'):
                    if 'release' in line.lower():
                        version = line.split('release')[-1].strip().split(',')[0]
                        print(f"[硬件检测] CUDA版本: {version}")
                        break
        except:
            pass
    
    def _extract_gpu_memory(self, wmic_output):
        """从wmic输出提取显存信息"""
        try:
            for line in wmic_output.split('\n'):
                if line.strip() and not line.startswith('Name') and not line.startswith('AdapterRAM'):
                    parts = line.split()
                    for part in parts:
                        if part.isdigit() and int(part) > 100000000:  # 大于100MB
                            self.gpu_memory = int(part) // (1024 * 1024)  # 转换为MB
                            break
        except:
            pass
    
    def _detect_cpu_features(self):
        """检测CPU特性和性能 - 简化版本避免卡顿"""
        # 简化CPU检测，避免复杂库依赖
        try:
            import platform
            cpu_info = platform.processor()
            print(f"[硬件检测] CPU: {cpu_info}, 核心数: {self.cpu_cores}")
        except:
            print("[硬件检测] CPU基础信息检测完成")
    
    def _scan_onnx_providers(self):
        """扫描可用的ONNX执行提供者"""
        try:
            import onnxruntime as ort
            self.available_providers = ort.get_available_providers()
            print(f"[硬件检测] ONNX Runtime可用执行器: {self.available_providers}")
        except Exception as e:
            print(f"[硬件检测] ONNX Runtime扫描失败: {e}")
            self.available_providers = ['CPUExecutionProvider']
    
    def _determine_optimal_settings(self):
        """根据硬件配置确定最优设置 - 参考Deep-Live-Cam智能调度"""
        
        # Apple Silicon优化
        if self.gpu_type == 'apple' and 'CoreMLExecutionProvider' in self.available_providers:
            self.optimal_provider = 'CoreMLExecutionProvider'
            self.performance_level = 'ultra'
            print("[硬件检测] 选择CoreML GPU加速 (Apple Silicon Ultra性能)")
            return
            
        # NVIDIA CUDA优化
        if self.gpu_type == 'nvidia' and 'CUDAExecutionProvider' in self.available_providers:
            if self.gpu_memory >= 4000:  # 4GB以上显存
                self.optimal_provider = 'CUDAExecutionProvider'
                self.performance_level = 'ultra'
            else:
                self.optimal_provider = 'CUDAExecutionProvider'
                self.performance_level = 'high'
            print(f"[硬件检测] 选择CUDA GPU加速 (性能: {self.performance_level})")
            return
            
        # DirectML优化 (Windows通用GPU加速)
        if self.gpu_type in ['nvidia', 'amd', 'intel', 'windows_gpu'] and 'DmlExecutionProvider' in self.available_providers:
            self.optimal_provider = 'DmlExecutionProvider'
            if self.gpu_memory >= 2000:  # 2GB以上显存
                self.performance_level = 'high'
            else:
                self.performance_level = 'medium'
            print(f"[硬件检测] 选择DirectML GPU加速 (性能: {self.performance_level})")
            return
            
        # CPU优化
        self.optimal_provider = 'CPUExecutionProvider'
        if self.cpu_cores >= 12 and self.system_memory >= 16:
            self.performance_level = 'high'
        elif self.cpu_cores >= 8 and self.system_memory >= 8:
            self.performance_level = 'medium'
        else:
            self.performance_level = 'low'
        print(f"[硬件检测] 使用CPU运算 (性能: {self.performance_level})")
    
    def determine_optimal_settings(self):
        """确定最优设置方法 - 兼容性包装器"""
        self._determine_optimal_settings()
    
    def get_optimized_config(self):
        """获取动态优化的配置参数 - 基于性能等级智能调整"""
        
        # 性能等级对应的配置参数
        config_templates = {
            'ultra': {
                'detect_skip_frames': 2,
                'detect_scale': 0.8,
                'process_scale': 0.9,
                'jpeg_quality': 95,
                'max_batch_size': 4,
                'threads': min(16, self.cpu_cores)
            },
            'high': {
                'detect_skip_frames': 4,
                'detect_scale': 0.6,
                'process_scale': 0.8,
                'jpeg_quality': 90,
                'max_batch_size': 2,
                'threads': min(8, self.cpu_cores)
            },
            'medium': {
                'detect_skip_frames': 6,
                'detect_scale': 0.4,
                'process_scale': 0.6,
                'jpeg_quality': 85,
                'max_batch_size': 1,
                'threads': min(4, self.cpu_cores)
            },
            'low': {
                'detect_skip_frames': 8,
                'detect_scale': 0.3,
                'process_scale': 0.5,
                'jpeg_quality': 80,
                'max_batch_size': 1,
                'threads': 1
            }
        }
        
        config = config_templates.get(self.performance_level, config_templates['low'])
        config['provider'] = self.optimal_provider
        
        print(f"[性能配置] 等级: {self.performance_level}, 检测间隔: {config['detect_skip_frames']}帧, "
              f"分辨率缩放: {config['process_scale']}")
        
        return config

# 全局硬件优化器
hardware_optimizer = HardwareOptimizer()

# 启动时执行全面硬件检测
print("[系统初始化] 开始全面硬件检测...")
hardware_optimizer.detect_hardware_comprehensive()
print("[系统初始化] 硬件检测完成，最优配置已确定")

# 获取优化配置
optimized_config = hardware_optimizer.get_optimized_config()

# 初始化性能调度器
print("[系统初始化] 初始化性能调度器...")
performance_scheduler = PerformanceScheduler(hardware_optimizer)
executor = performance_scheduler.executor
print("[系统初始化] 性能调度器初始化完成")

# ============== 后端服务 ==============
import cv2
import numpy as np
import base64
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
try:
    from flask_compress import Compress
    compress_available = True
except ImportError:
    compress_available = False
    print("[警告] 未安装 flask-compress，将禁用压缩功能")

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# 配置Flask以减少延迟
app.config['JSONIFY_PRETTYPRINT_REGULAR'] = False
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
app.config['TEMPLATES_AUTO_RELOAD'] = True

# Flask压缩配置
if compress_available:
    Compress(app)

# ============== 性能优化：线程锁和信号量 ==============
INFERENCE_LOCK = threading.Lock()  # 推理锁，避免并发冲突
SESSION_SEMAPHORE = threading.Semaphore(1)  # 控制同时推理数量

# ============== 性能优化：帧率限制 ==============
MIN_FRAME_INTERVAL = 0.04  # 允许25FPS（足够流畅）
DETECT_SKIP_FRAMES = 8     # 检测间隔拉大，减少检测耗时
DETECT_SCALE = 0.2         # 检测分辨率（保持不变）
PROCESS_SCALE = 0.7        # 小幅提升，减少放大倍数
UPSCALE_BLUR_KERNEL = (3, 3)  # 轻量模糊消除像素块
UPSCALE_SCALE = 1.5        # 超分辨率放大倍数
OUTPUT_WIDTH = 1280        # 程序输出分辨率（720P）
OUTPUT_HEIGHT = 720
FPS_TARGET = 25            # 降低目标帧率
last_process_time = 0
frame_counter = 0
cached_faces_for_swap = None
cached_source_embedding = None

# ============== 激活状态缓存（启动时缓存，避免重复计算） ==============
_cached_machine_code = None
_cached_activation_status = None  # (activated, remaining_days)
_cached_trial_seconds = None
_activation_cache_time = 0
_ACTIVATION_CACHE_DURATION = 60  # 激活状态缓存60秒

# ============== GPU优化：异步流水线 ==============
from concurrent.futures import ThreadPoolExecutor
import queue

# 异步推理 - 单线程避免GPU资源竞争
gpu_executor = ThreadPoolExecutor(max_workers=1)

# 三阶段流水线队列
frame_queue = queue.Queue(maxsize=2)  # 帧输入队列，最多缓存2帧
detect_queue = queue.Queue(maxsize=2)  # 检测结果队列
infer_queue = queue.Queue(maxsize=2)  # 推理结果队列

# 流水线控制
pipeline_running = False
last_swap_result = None  # 最新换脸结果缓存

# GC控制 - 禁用自动GC，手动控制
gc.disable()
_gc_frame_counter = 0

# ============== 人脸缓存 - 参考 facefusion face_store.py ==============
import zlib

class FaceCache:
    """人脸检测缓存 - 相同图像不重复检测"""
    def __init__(self, max_size=100):
        self.cache = {}
        self.max_size = max_size
        
    def create_hash(self, frame_bytes):
        """CRC32 快速哈希"""
        return format(zlib.crc32(frame_bytes), '08x')
    
    def get(self, frame):
        """from cache"""
        frame_hash = self.create_hash(frame.tobytes()[:10000])  # 只用前10KB计算hash
        return self.cache.get(frame_hash)
    
    def set(self, frame, faces):
        """to cache"""
        if len(self.cache) >= self.max_size:
            # 清除最旧的一半
            keys = list(self.cache.keys())[:self.max_size // 2]
            for k in keys:
                del self.cache[k]
        
        frame_hash = self.create_hash(frame.tobytes()[:10000])
        self.cache[frame_hash] = faces

# 全局人脸缓存
face_cache = FaceCache()

# ============== 人脸跟踪缓存 ==============
class FaceTracker:
    """人脸跟踪器 - 缓存检测结果，避免掉帧露脸"""
    def __init__(self, max_miss=5):  # 减少到 5 帧容忍，提高响应速度
        self.last_faces = None
        self.last_result = None  # 上一次换脸结果
        self.miss_count = 0
        self.max_miss = max_miss  # 最大丢失帧数
        
    def update(self, faces):
        """更新跟踪状态"""
        if faces and len(faces) > 0:
            self.last_faces = faces
            self.miss_count = 0
            return faces
        else:
            # 人脸丢失，使用缓存
            self.miss_count += 1
            if self.miss_count <= self.max_miss and self.last_faces:
                return self.last_faces
            return None
    
    def save_result(self, result_img):
        """缓存换脸结果"""
        self.last_result = result_img.copy() if result_img is not None else None
        
    def get_cached_result(self):
        """获取缓存的结果"""
        return self.last_result
    
    def clear(self):
        self.last_faces = None
        self.last_result = None
        self.miss_count = 0

# 全局人脸跟踪器
face_tracker = FaceTracker()

# ============== 全局变量 ==============
face_app = None
swap_models = {}  # 多个换脸模型
face_parser_model = None  # 人脸分割模型
age_modifier_model = None  # 年龄变换模型
source_face = None
source_face_img = None  # 保存源人脸图片用于 hyperswap
models_loaded = False

# 当前使用的模型配置 - 锁定低开销配置
current_config = {
    'swap_model': 'inswapper',
    'use_face_parser': False,   # 关闭高耗时功能
    'age_modifier_direction': 0,
    'color_correction': True,   # 仅保留轻量色彩校正
    'blend_strength': 0.7,      # 融脸强度
}
# 禁止修改关键配置
_LOCKED_CONFIG_KEYS = {'use_face_parser', 'age_modifier_direction'}  # color_correction已解锁

# 激活状态 - 本地验证
activation_cache = {}

# 内部配置 - 盐值从环境变量或 .salt 文件读取，不写入代码
def _load_salts():
    """从环境变量或本地文件加载盐值，不在代码中硬编码"""
    import secrets as _secrets

    salt_file = os.path.join(BASE_DIR, '.salt')
    salts = {}

    for key in ['FACESWAP_MASTER_SALT', 'FACESWAP_TIME_SALT', 'FACESWAP_LEGACY_SALT']:
        val = os.environ.get(key, '')
        if len(val) >= 8:
            salts[key] = val

    if len(salts) < 3 and os.path.exists(salt_file):
        try:
            with open(salt_file, 'r') as f:
                for line in f:
                    line = line.strip()
                    if '=' in line:
                        k, v = line.split('=', 1)
                        if len(v) >= 8:
                            salts[k] = v
        except:
            pass

    if len(salts) >= 3:
        return (
            salts.get('FACESWAP_MASTER_SALT', ''),
            salts.get('FACESWAP_TIME_SALT', ''),
            salts.get('FACESWAP_LEGACY_SALT', '')
        )

    print("[安全] 未检测到盐值配置，使用临时随机值")
    print("[安全] 请通过环境变量或 .salt 文件设置：FACESWAP_MASTER_SALT / FACESWAP_TIME_SALT / FACESWAP_LEGACY_SALT")
    return (
        _secrets.token_hex(16),
        _secrets.token_hex(16),
        _secrets.token_hex(16)
    )

_MASTER_SALT, _TIME_SALT, _LEGACY_SALT = _load_salts()

# 激活码尝试限制 - 防止暴力破解
_ACTIVATION_MAX_ATTEMPTS = 10
_ACTIVATION_LOCKOUT_MINUTES = 30
_activation_attempts = {}

def _check_activation_rate_limit(client_id='default'):
    """检查激活码尝试频率限制"""
    now = datetime.datetime.now()
    if client_id in _activation_attempts:
        attempts, lock_until = _activation_attempts[client_id]
        if lock_until and now < lock_until:
            remaining = (lock_until - now).seconds // 60 + 1
            return False, f'尝试次数过多，请{remaining}分钟后再试'
        if lock_until and now >= lock_until:
            _activation_attempts[client_id] = (0, None)
    return True, None

def _record_activation_attempt(client_id='default', success=False):
    """记录激活尝试"""
    now = datetime.datetime.now()
    if success:
        if client_id in _activation_attempts:
            del _activation_attempts[client_id]
        return
    
    attempts, _ = _activation_attempts.get(client_id, (0, None))
    attempts += 1
    if attempts >= _ACTIVATION_MAX_ATTEMPTS:
        lock_until = now + datetime.timedelta(minutes=_ACTIVATION_LOCKOUT_MINUTES)
        _activation_attempts[client_id] = (attempts, lock_until)
    else:
        _activation_attempts[client_id] = (attempts, None)

def get_machine_code():
    """获取机器码 - 基于多维度硬件信息生成唯一标识"""
    import platform
    import uuid
    
    # 收集多维度硬件信息，增强唯一性
    info_parts = []
    
    # 1. 基础系统信息
    info_parts.append(platform.node())  # 计算机名
    info_parts.append(platform.machine())  # 处理器架构
    info_parts.append(str(uuid.getnode()))  # MAC地址
    
    # 2. CPU信息
    try:
        cpu_info = platform.processor()
        if cpu_info:
            info_parts.append(cpu_info[:30])
    except:
        pass
    
    # 3. 系统卷序列号（Windows）
    if sys.platform == 'win32':
        try:
            result = subprocess.run(
                ['wmic', 'os', 'get', 'serialnumber'],
                capture_output=True, text=True, timeout=3
            )
            serial = result.stdout.strip().split('\n')[-1].strip()
            if serial and serial != 'SerialNumber':
                info_parts.append(serial[:20])
        except:
            pass
        
        # 4. 主板序列号
        try:
            result = subprocess.run(
                ['wmic', 'baseboard', 'get', 'serialnumber'],
                capture_output=True, text=True, timeout=3
            )
            mb_serial = result.stdout.strip().split('\n')[-1].strip()
            if mb_serial and mb_serial != 'SerialNumber' and mb_serial != 'To be filled by O.E.M.':
                info_parts.append(mb_serial[:20])
        except:
            pass
    
    # 生成机器码（使用双重哈希增强安全性）
    raw = '|'.join(info_parts)
    first_hash = hashlib.md5(raw.encode()).hexdigest()
    # 加入盐值二次哈希，防止逆向
    code_hash = hashlib.sha256((first_hash + _MASTER_SALT + _TIME_SALT).encode()).hexdigest()[:16].upper()
    
    # 格式化为 4-4-4-4
    return f"{code_hash[:4]}-{code_hash[4:8]}-{code_hash[8:12]}-{code_hash[12:16]}"

def verify_activation_code_v2(machine_code, activation_code):
    """
    验证新版激活码（带时限）
    格式：CORE(12) + DURATION(1) + DAYS(4) + CHECK(2) = 19位
    DURATION: 1=1个月, 3=3个月, 9=永久
    返回: (是否有效, 剩余天数, 错误信息)
    """
    try:
        # 清理激活码
        clean_code = activation_code.upper().replace('-', '').replace(' ', '')
        if len(clean_code) < 19:
            return False, 0, '激活码格式错误'
        
        clean_machine = machine_code.replace('-', '').upper()
        
        # 解析激活码
        # 格式：CORE(12) + DURATION(1) + DAYS(4) + CHECK(2) = 19位
        core_hash = clean_code[:12]
        duration_code = clean_code[12]  # 1=1个月, 3=3个月, 9=永久
        days_hex = clean_code[13:17]  # 4位十六进制，表示到期日距离基准日的天数
        checksum = clean_code[17:19]
        
        # 基准日期：2024-01-01
        base_date = datetime.datetime(2024, 1, 1)
        
        # 解析到期天数
        try:
            expire_days = int(days_hex, 16)
            expire_date = base_date + datetime.timedelta(days=expire_days)
        except:
            return False, 0, '激活码格式错误'
        
        # 验证哈希 - 使用机器码+盐+到期日+时长码
        expected_core = hashlib.md5(
            (clean_machine + _MASTER_SALT + _TIME_SALT + days_hex + duration_code).encode()
        ).hexdigest()[:12].upper()
        
        expected_check = hashlib.md5(
            (expected_core + duration_code + days_hex + _MASTER_SALT).encode()
        ).hexdigest()[:2].upper()
        
        if core_hash != expected_core or checksum != expected_check:
            return False, 0, '激活码无效或机器码不匹配'
        
        # 永久激活码特殊处理
        if duration_code == '9':
            return True, 99999, None  # 永久激活
        
        # 检查是否过期
        now = datetime.datetime.now()
        if now > expire_date:
            days_expired = (now - expire_date).days
            return False, -days_expired, f'激活码已过期{days_expired}天'
        
        # 计算剩余天数
        remaining_days = (expire_date - now).days + 1
        return True, remaining_days, None
        
    except Exception as e:
        return False, 0, f'验证错误: {str(e)}'

def verify_activation_code_legacy(machine_code, activation_code):
    """验证旧版永久激活码（向后兼容）"""
    try:
        clean_machine = machine_code.replace('-', '').upper()
        clean_code = activation_code.upper().replace('-', '').replace(' ', '')
        
        expected = hashlib.md5((clean_machine + _LEGACY_SALT).encode()).hexdigest()[:16].upper()
        
        if clean_code == expected:
            return True, 9999, None  # 永久激活
        return False, 0, None
    except:
        return False, 0, None

def verify_activation_code(machine_code, activation_code):
    """
    验证激活码（支持新旧两种格式）
    返回: (是否有效, 剩余天数)
    """
    # 先尝试新版验证
    valid, days, error = verify_activation_code_v2(machine_code, activation_code)
    if valid:
        return True, days
    
    # 再尝试旧版验证（兼容）
    valid_legacy, days_legacy, _ = verify_activation_code_legacy(machine_code, activation_code)
    if valid_legacy:
        return True, days_legacy
    
    return False, 0

def get_trial_time_remaining():
    """获取试用剩余时间（秒）- 多重防篡改保护"""
    trial_file = os.path.join(BASE_DIR, '.trial')
    backup_file = os.path.join(BASE_DIR, '.sys_cache')
    registry_key = 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\SysCache'
    TRIAL_HOURS = 2
    TRIAL_SECONDS = TRIAL_HOURS * 60 * 60
    
    def get_hardware_id():
        """获取硬件唯一标识 - 多维度"""
        import platform
        import uuid
        parts = [
            platform.node(),
            str(uuid.getnode()),
            platform.processor()[:20] if platform.processor() else 'unknown'
        ]
        # 添加系统盘序列号
        if sys.platform == 'win32':
            try:
                result = subprocess.run(['wmic', 'diskdrive', 'get', 'serialnumber'], 
                                       capture_output=True, text=True, timeout=3)
                serial = result.stdout.strip().split('\n')[-1].strip()
                if serial and serial != 'SerialNumber':
                    parts.append(serial[:15])
            except:
                pass
        return hashlib.sha256('|'.join(parts).encode()).hexdigest()[:16]
    
    def encode_trial_data(first_run_time, hw_id):
        """编码试用数据 - 带多重校验"""
        timestamp = first_run_time.timestamp()
        data = f"{timestamp}|{hw_id}"
        # 三层加密校验
        check1 = hashlib.md5((data + _MASTER_SALT).encode()).hexdigest()[:8]
        check2 = hashlib.sha256((data + _TIME_SALT + check1).encode()).hexdigest()[:8]
        return f"{timestamp}|{hw_id}|{check1}|{check2}"
    
    def decode_trial_data(encoded, current_hw_id):
        """解码并验证试用数据"""
        try:
            parts = encoded.strip().split('|')
            if len(parts) != 4:
                return None
            timestamp_str, hw_id, check1, check2 = parts
            timestamp = float(timestamp_str)
            
            # 验证硬件ID
            if hw_id != current_hw_id:
                return None  # 硬件不匹配，可能被复制
            
            # 验证校验和
            data = f"{timestamp_str}|{hw_id}"
            expected_check1 = hashlib.md5((data + _MASTER_SALT).encode()).hexdigest()[:8]
            expected_check2 = hashlib.sha256((data + _TIME_SALT + check1).encode()).hexdigest()[:8]
            
            if check1 != expected_check1 or check2 != expected_check2:
                return None  # 数据被篡改
            
            return datetime.datetime.fromtimestamp(timestamp)
        except:
            return None
    
    def read_from_registry():
        """从注册表读取试用数据"""
        if sys.platform != 'win32':
            return None
        try:
            import winreg
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, registry_key, 0, winreg.KEY_READ)
            value, _ = winreg.QueryValueEx(key, 'Data')
            winreg.CloseKey(key)
            return value
        except:
            return None
    
    def write_to_registry(data):
        """写入注册表"""
        if sys.platform != 'win32':
            return
        try:
            import winreg
            key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, registry_key)
            winreg.SetValueEx(key, 'Data', 0, winreg.REG_SZ, data)
            winreg.CloseKey(key)
        except:
            pass
    
    # 获取当前硬件ID
    current_hw_id = get_hardware_id()
    first_run = None
    
    # 多源读取试用数据：文件 + 注册表
    sources = [backup_file, trial_file]
    
    for source in sources:
        if os.path.exists(source):
            try:
                with open(source, 'r') as f:
                    first_run = decode_trial_data(f.read(), current_hw_id)
                    if first_run:
                        break
            except:
                pass
    
    # 尝试从注册表读取
    if first_run is None:
        reg_data = read_from_registry()
        if reg_data:
            first_run = decode_trial_data(reg_data, current_hw_id)
    
    if first_run is None:
        # 首次启动
        first_run = datetime.datetime.now()
        encoded = encode_trial_data(first_run, current_hw_id)
        
        # 写入多个位置
        for filepath in [trial_file, backup_file]:
            try:
                with open(filepath, 'w') as f:
                    f.write(encoded)
            except:
                pass
        
        # 写入注册表
        write_to_registry(encoded)
        
        # 隐藏备份文件
        if sys.platform == 'win32':
            try:
                import ctypes
                ctypes.windll.kernel32.SetFileAttributesW(backup_file, 0x02)
            except:
                pass
        
        return TRIAL_SECONDS
    
    # 防止系统时间回调
    now = datetime.datetime.now()
    if now < first_run:
        # 系统时间被修改，试用立即到期
        return 0
    
    elapsed = (now - first_run).total_seconds()
    remaining = TRIAL_SECONDS - elapsed
    return max(0, int(remaining))

def is_activated():
    """
    检查是否已激活
    返回: (是否激活, 剩余天数)
    """
    activation_file = os.path.join(BASE_DIR, '.activated')
    
    if not os.path.exists(activation_file):
        return False, 0
    
    try:
        with open(activation_file, 'r') as f:
            saved_code = f.read().strip()
        
        machine_code = get_machine_code()
        valid, remaining_days = verify_activation_code(machine_code, saved_code)
        
        if valid and remaining_days > 0:
            return True, remaining_days
        else:
            # 激活码过期，删除文件
            if remaining_days <= 0:
                try:
                    os.remove(activation_file)
                except:
                    pass
            return False, 0
    except:
        return False, 0

def get_cached_activation_status():
    """获取缓存的激活状态，避免重复计算"""
    global _cached_activation_status, _cached_trial_seconds, _activation_cache_time
    
    now = time.time()
    # 缓存有效期内直接返回
    if _cached_activation_status is not None and (now - _activation_cache_time) < _ACTIVATION_CACHE_DURATION:
        return _cached_activation_status, _cached_trial_seconds
    
    # 缓存过期，重新计算
    _cached_activation_status = is_activated()
    _cached_trial_seconds = get_trial_time_remaining()
    _activation_cache_time = now
    
    return _cached_activation_status, _cached_trial_seconds

def save_activation(activation_code):
    """保存激活码"""
    activation_file = os.path.join(BASE_DIR, '.activated')
    with open(activation_file, 'w') as f:
        f.write(activation_code.upper().replace(' ', ''))


# ============== 模型配置 ==============
SWAP_MODEL_CONFIG = {
    'inswapper': {
        'path': 'inswapper_128.onnx',
        'size': (128, 128),
        'template': 'arcface_128',
        'mean': [0.0, 0.0, 0.0],
        'std': [1.0, 1.0, 1.0],
    },
    'inswapper_fp16': {
        'path': 'inswapper_128_fp16.onnx',
        'size': (128, 128),
        'template': 'arcface_128',
        'mean': [0.0, 0.0, 0.0],
        'std': [1.0, 1.0, 1.0],
        'fp16': True
    },
    # hyperswap 禁用
}

# GFPGAN 配置
GFPGAN_CONFIG = {
    'enabled': True,
    'model_path': 'GFPGANv1.4.pth',
    'upscale_factor': 2,
    'bg_upscale': False
}

# GFPGAN 模型实例
gfpgan_model = None

def load_gfpgan_model():
    """加载GFPGAN人脸修复模型"""
    global gfpgan_model
    
    if gfpgan_model is not None:
        return gfpgan_model
    
    try:
        # 检查模型文件是否存在
        gfpgan_path = os.path.join(MODEL_PATH, GFPGAN_CONFIG['model_path'])
        if not os.path.exists(gfpgan_path):
            print(f"GFPGAN模型文件不存在: {gfpgan_path}")
            return None
        
        # 动态导入GFPGAN相关库
        try:
            import torch
            from basicsr.archs.gfpganv1_arch import GFPGANv1
            from basicsr.utils import img2tensor, tensor2img
            from basicsr.data import create_single_img_dataloader
        except ImportError as e:
            print(f"GFPGAN依赖库未安装: {e}")
            return None
        
        # 加载模型
        print("正在加载GFPGAN模型...")
        
        # 创建模型实例
        gfpgan_model = GFPGANv1(
            out_size=512,
            num_style_feat=512,
            channel_multiplier=1,
            decoder_load_path=None,
            fix_decoder=False,
            num_mlp=8,
            input_is_latent=True,
            different_w=True,
            narrow=1,
            sft_half=True
        )
        
        # 加载预训练权重
        checkpoint = torch.load(gfpgan_path, map_location=torch.device('cpu'))
        if 'params_ema' in checkpoint:
            gfpgan_model.load_state_dict(checkpoint['params_ema'])
        elif 'params' in checkpoint:
            gfpgan_model.load_state_dict(checkpoint['params'])
        else:
            gfpgan_model.load_state_dict(checkpoint)
        
        gfpgan_model.eval()
        print("GFPGAN模型加载完成")
        
        return gfpgan_model
        
    except Exception as e:
        print(f"加载GFPGAN模型失败: {e}")
        gfpgan_model = None
        return None

def apply_gfpgan_enhancement(image):
    """应用GFPGAN人脸修复增强"""
    global gfpgan_model
    
    if not GFPGAN_CONFIG['enabled']:
        return image
    
    if gfpgan_model is None:
        gfpgan_model = load_gfpgan_model()
        if gfpgan_model is None:
            return image
    
    try:
        import torch
        import cv2
        from basicsr.utils import img2tensor, tensor2img
        
        # 转换图像格式
        if len(image.shape) == 3 and image.shape[2] == 3:
            img_rgb = image[:, :, ::-1]  # BGR to RGB
        else:
            img_rgb = image
        
        # 调整图像大小以适应模型
        original_size = img_rgb.shape[:2]
        target_size = (512, 512)
        
        if img_rgb.shape[:2] != target_size:
            img_resized = cv2.resize(img_rgb, target_size, interpolation=cv2.INTER_LANCZOS4)
        else:
            img_resized = img_rgb
        
        # 转换为tensor
        img_tensor = img2tensor(img_resized, bgr2rgb=False, float32=True)
        img_tensor = torch.unsqueeze(img_tensor, 0)
        
        # 应用GFPGAN增强
        with torch.no_grad():
            output = gfpgan_model(img_tensor, return_rgb=False, save_root=None)[0]
            enhanced_img = tensor2img(output, rgb2bgr=True, min_max=(-1, 1))
        
        # 恢复原始尺寸
        if enhanced_img.shape[:2] != original_size:
            enhanced_img = cv2.resize(enhanced_img, (original_size[1], original_size[0]), 
                                    interpolation=cv2.INTER_LANCZOS4)
        
        # 转换回BGR
        if len(enhanced_img.shape) == 3 and enhanced_img.shape[2] == 3:
            enhanced_img = enhanced_img[:, :, ::-1]  # RGB to BGR
        
        return enhanced_img
        
    except Exception as e:
        print(f"GFPGAN增强失败: {e}")
        return image

# ============== ONNX Runtime 会话 ==============
onnx_sessions = {}
_hardware_initialized = False

def get_onnx_session(model_path):
    """获取或创建 ONNX Runtime 会话 - 高性能优化版"""
    global _hardware_initialized
    
    if model_path not in onnx_sessions:
        import onnxruntime
        
        # 首次调用时进行硬件检测
        if not _hardware_initialized:
            hardware_optimizer.detect_gpu()
            hardware_optimizer.determine_optimal_settings()
            _hardware_initialized = True
        
        available = onnxruntime.get_available_providers()
        optimal_provider = hardware_optimizer.optimal_provider
        
        # 构建执行器列表 - 优先级：CUDA > DirectML > CPU
        providers = []
        
        if optimal_provider == 'CUDAExecutionProvider' and 'CUDAExecutionProvider' in available:
            providers.append(('CUDAExecutionProvider', {
                'device_id': 0,
                'arena_extend_strategy': 'kNextPowerOfTwo',
                'gpu_mem_limit': 4 * 1024 * 1024 * 1024,  # 4GB限制
                'cudnn_conv_algo_search': 'DEFAULT',  # 使用默认算法平衡速度和内存
                'do_copy_in_default_stream': True,
            }))
            print(f"[模型加载] 使用 CUDA GPU加速 (高性能)")
        elif optimal_provider == 'DmlExecutionProvider' and 'DmlExecutionProvider' in available:
            providers.append(('DmlExecutionProvider', {
                'device_id': 0,
                'enable_reduced_precision': True,  # 启用半精度以提升性能
            }))
            print(f"[模型加载] 使用 DirectML GPU加速 (高性能)")
        else:
            print(f"[模型加载] 使用 CPU 运算 (高性能线程优化)")
        
        # 始终添加CPU作为备用，但配置为高性能
        providers.append(('CPUExecutionProvider', {
            'intra_op_num_threads': min(hardware_optimizer.cpu_cores, 4),  # 限制CPU线程数避免竞争
        }))
        
        # 高性能的会话选项 - 低延迟优先
        sess_options = onnxruntime.SessionOptions()
        # 使用基础优化，避免复杂优化带来的延迟
        sess_options.graph_optimization_level = onnxruntime.GraphOptimizationLevel.ORT_ENABLE_BASIC
        sess_options.execution_mode = onnxruntime.ExecutionMode.ORT_SEQUENTIAL  # 串行执行减少调度开销
        
        # 内存优化
        sess_options.enable_mem_pattern = False
        sess_options.enable_mem_reuse = True
        sess_options.enable_profiling = False
        
        # GPU模式下使用最小线程数，避免线程调度开销
        if 'DmlExecutionProvider' in str(providers) or 'CUDAExecutionProvider' in str(providers):
            sess_options.intra_op_num_threads = 1
            sess_options.inter_op_num_threads = 1
        else:
            # CPU模式下使用少量线程
            sess_options.intra_op_num_threads = 2
            sess_options.inter_op_num_threads = 1
        
        try:
            onnx_sessions[model_path] = onnxruntime.InferenceSession(
                model_path, 
                providers=providers,
                sess_options=sess_options
            )
        except Exception as e:
            # 如果GPU失败，回退到CPU并使用优化设置
            print(f"[模型加载] GPU加载失败，回退到CPU: {e}")
            sess_options_fallback = onnxruntime.SessionOptions()
            sess_options_fallback.graph_optimization_level = onnxruntime.GraphOptimizationLevel.ORT_ENABLE_ALL
            sess_options_fallback.execution_mode = onnxruntime.ExecutionMode.ORT_SEQUENTIAL
            sess_options_fallback.intra_op_num_threads = min(hardware_optimizer.cpu_cores, 4)
            sess_options_fallback.inter_op_num_threads = min(hardware_optimizer.cpu_cores, 2)
            sess_options_fallback.enable_mem_pattern = False
            sess_options_fallback.enable_mem_reuse = True
            
            onnx_sessions[model_path] = onnxruntime.InferenceSession(
                model_path, 
                providers=['CPUExecutionProvider'],
                sess_options=sess_options_fallback
            )
        
    return onnx_sessions[model_path]

# ============== 人脸对齐工具 ==============
# 对齐模板（归一化坐标 0-1）
WARP_TEMPLATES = {
    'arcface_112_v2': np.array([
        [0.34191607, 0.46157411],
        [0.65653393, 0.45983393],
        [0.50022500, 0.64050536],
        [0.37097589, 0.82469196],
        [0.63151696, 0.82325089]
    ], dtype=np.float32),
    'arcface_128': np.array([
        [0.36167656, 0.40387734],
        [0.63696719, 0.40235469],
        [0.50019687, 0.56044219],
        [0.38710391, 0.72160547],
        [0.61507734, 0.72034453]
    ], dtype=np.float32),
}

def warp_face_by_kps(img, kps, template_name, crop_size):
    """通过5点关键点对齐人脸"""
    # 获取模板并缩放到目标尺寸
    template = WARP_TEMPLATES.get(template_name, WARP_TEMPLATES['arcface_128'])
    template_scaled = template * np.array([crop_size[0], crop_size[1]])
    
    # 计算仿射变换矩阵
    M = cv2.estimateAffinePartial2D(kps.astype(np.float32), template_scaled, method=cv2.RANSAC, ransacReprojThreshold=100)[0]
    if M is None:
        M = cv2.getAffineTransform(kps[:3].astype(np.float32), template_scaled[:3])
    
    # 应用变换 - 使用高质量插值
    aligned = cv2.warpAffine(img, M, crop_size, borderMode=cv2.BORDER_REPLICATE, flags=cv2.INTER_LANCZOS4)
    return aligned, M

def paste_back(temp_frame, crop_frame, crop_mask, affine_matrix):
    """将处理后的人脸贴回原图"""
    temp_height, temp_width = temp_frame.shape[:2]
    crop_height, crop_width = crop_frame.shape[:2]
    
    inverse_matrix = cv2.invertAffineTransform(affine_matrix)
    
    crop_points = np.array([[0, 0], [crop_width, 0], [crop_width, crop_height], [0, crop_height]], dtype=np.float32)
    paste_points = cv2.transform(crop_points.reshape(1, -1, 2), inverse_matrix).reshape(-1, 2)
    
    x1, y1 = np.floor(paste_points.min(axis=0)).astype(int)
    x2, y2 = np.ceil(paste_points.max(axis=0)).astype(int)
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(temp_width, x2), min(temp_height, y2)
    
    paste_width = x2 - x1
    paste_height = y2 - y1
    
    if paste_width <= 0 or paste_height <= 0:
        return temp_frame
    
    paste_matrix = inverse_matrix.copy()
    paste_matrix[0, 2] -= x1
    paste_matrix[1, 2] -= y1
    
    # 使用线性插值（平衡速度与质量）
    inverse_mask = cv2.warpAffine(crop_mask, paste_matrix, (paste_width, paste_height), 
                                   flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    inverse_mask = np.clip(inverse_mask, 0, 1)[:, :, np.newaxis]
    
    inverse_frame = cv2.warpAffine(crop_frame, paste_matrix, (paste_width, paste_height), 
                                    flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    
    # 融合
    result = temp_frame.copy()
    paste_region = result[y1:y2, x1:x2].astype(np.float32)
    inverse_frame_f = inverse_frame.astype(np.float32)
    
    blended = paste_region * (1 - inverse_mask) + inverse_frame_f * inverse_mask
    result[y1:y2, x1:x2] = blended.astype(np.uint8)
    
    return result


# ============== 人脸检测器类 (纯 ONNX Runtime 实现) ==============
class FaceObject:
    """人脸对象，存储人脸检测结果"""
    def __init__(self):
        self.bbox = None  # [x1, y1, x2, y2]
        self.kps = None   # 5点关键点 (5, 2)
        self.det_score = 0.0
        self.embedding = None  # 原始人脸嵌入（未归一化）
        self.normed_embedding = None  # 归一化人脸嵌入
        self.landmark_2d_106 = None  # 106点关键点（可选）

class FaceDetector:
    """人脸检测器 - 使用 ONNX Runtime"""
    def __init__(self, model_path):
        self.session = get_onnx_session(model_path)
        self.input_name = self.session.get_inputs()[0].name
        self.input_shape = self.session.get_inputs()[0].shape
        self.input_size = (640, 640)  # 使用 640 保证检测准确性
        
        # RetinaFace 参数
        self.fmc = 3
        self.feat_stride_fpn = [8, 16, 32]
        self.num_anchors = 2
        self.center_cache = {}
        
    def get(self, img, max_num=0):
        """获取人脸 - 兼容函数，返回列表格式"""
        faces = self.detect(img)
        if max_num > 0 and len(faces) > max_num:
            faces = faces[:max_num]
        return faces  # 返回FaceObject列表，与新架构兼容
    
    def get_old_format(self, img, thresh=0.3):
        """获取人脸 - 旧格式兼容 (bboxes, kpss)"""
        faces = self.detect(img, thresh)
        bboxes = []
        kpss = []
        for face in faces:
            bboxes.append(face.bbox)
            kpss.append(face.kps)
        return np.array(bboxes), np.array(kpss) if kpss else np.array([])
        
    def detect(self, img, thresh=0.3):
        """检测人脸 - 高性能优化版"""
        im_ratio = float(img.shape[0]) / img.shape[1]
        input_size = self.input_size
        
        # 使用更快的插值方法
        if im_ratio > 1:
            new_height = input_size[1]
            new_width = int(new_height / im_ratio)
        else:
            new_width = input_size[0]
            new_height = int(new_width * im_ratio)
        
        det_scale = float(new_height) / img.shape[0]
        # 使用最快插值方法
        resized_img = cv2.resize(img, (new_width, new_height), interpolation=cv2.INTER_NEAREST)
        
        # 填充到 input_size
        det_img = np.zeros((input_size[1], input_size[0], 3), dtype=np.uint8)
        det_img[:new_height, :new_width, :] = resized_img
        
        # 预处理 - 简化计算
        input_img = det_img.astype(np.float32)
        input_img = (input_img - 127.5) / 128.0  # 简化归一化
        input_img = input_img.transpose(2, 0, 1)  # HWC -> CHW
        input_img = np.expand_dims(input_img, axis=0)
        
        # 推理
        outputs = self.session.run(None, {self.input_name: input_img})
        
        # 解析输出
        bboxes, kpss = self._postprocess(outputs, det_scale, thresh)
        
        # 创建FaceObject列表（兼容新架构）
        faces = []
        for i in range(len(bboxes)):
            face_obj = FaceObject()
            face_obj.bbox = bboxes[i]
            face_obj.kps = kpss[i] if len(kpss) > i and kpss[i] is not None else None
            face_obj.det_score = 1.0  # 由于我们使用了阈值过滤，这里设为1.0
            faces.append(face_obj)
        
        return faces
    
    def _postprocess(self, outputs, det_scale, thresh):
        """后处理检测结果"""
        scores_list = []
        bboxes_list = []
        kpss_list = []
        
        fmc = self.fmc
        for idx, stride in enumerate(self.feat_stride_fpn):
            # 获取输出并处理维度
            scores = outputs[idx]
            bbox_preds = outputs[idx + fmc]
            kps_preds = outputs[idx + fmc * 2] if len(outputs) > fmc * 2 + idx else None
            
            # 处理不同的输出格式
            if len(scores.shape) == 4:  # (1, C, H, W)
                scores = scores.transpose(0, 2, 3, 1)  # -> (1, H, W, C)
            scores = scores.reshape(-1)  # flatten
            
            if len(bbox_preds.shape) == 4:
                bbox_preds = bbox_preds.transpose(0, 2, 3, 1)
            bbox_preds = bbox_preds.reshape(-1, 4)
            
            if kps_preds is not None:
                if len(kps_preds.shape) == 4:
                    kps_preds = kps_preds.transpose(0, 2, 3, 1)
                kps_preds = kps_preds.reshape(-1, 10)
            
            height = self.input_size[1] // stride
            width = self.input_size[0] // stride
            
            key = (height, width, stride)
            if key in self.center_cache:
                anchor_centers = self.center_cache[key]
            else:
                anchor_centers = np.stack(
                    np.mgrid[:height, :width][::-1], axis=-1
                ).astype(np.float32)
                anchor_centers = (anchor_centers * stride).reshape((-1, 2))
                if self.num_anchors > 1:
                    anchor_centers = np.stack([anchor_centers] * self.num_anchors, axis=1).reshape((-1, 2))
                self.center_cache[key] = anchor_centers
            
            # 确保 scores 和 anchor_centers 长度匹配
            min_len = min(len(scores), len(anchor_centers), len(bbox_preds))
            scores = scores[:min_len]
            anchor_centers_cur = anchor_centers[:min_len]
            bbox_preds = bbox_preds[:min_len]
            
            pos_inds = np.where(scores >= thresh)[0]
            
            if len(pos_inds) > 0:
                bboxes = self._distance2bbox(anchor_centers_cur, bbox_preds, stride)
                scores_list.append(scores[pos_inds])
                bboxes_list.append(bboxes[pos_inds])
                
                if kps_preds is not None:
                    kps_preds = kps_preds[:min_len]
                    kpss = self._distance2kps(anchor_centers_cur, kps_preds, stride)
                    kpss_list.append(kpss[pos_inds])
        
        if len(scores_list) == 0:
            return np.array([]), np.array([])
        
        scores = np.concatenate(scores_list, axis=0)
        bboxes = np.concatenate(bboxes_list, axis=0) / det_scale
        kpss = np.concatenate(kpss_list, axis=0) / det_scale if kpss_list else np.array([])
        
        # NMS
        pre_det = np.hstack((bboxes, scores[:, np.newaxis]))
        keep = self._nms(pre_det, thresh=0.4)
        
        return bboxes[keep], kpss[keep] if len(kpss) > 0 else np.array([])
    
    def _distance2bbox(self, points, distance, stride):
        distance = distance.reshape(-1, 4) * stride
        x1 = points[:, 0] - distance[:, 0]
        y1 = points[:, 1] - distance[:, 1]
        x2 = points[:, 0] + distance[:, 2]
        y2 = points[:, 1] + distance[:, 3]
        return np.stack([x1, y1, x2, y2], axis=-1)
    
    def _distance2kps(self, points, distance, stride):
        distance = distance.reshape(-1, 10) * stride
        kps = []
        for i in range(5):
            x = points[:, 0] + distance[:, i * 2]
            y = points[:, 1] + distance[:, i * 2 + 1]
            kps.append(np.stack([x, y], axis=-1))
        return np.stack(kps, axis=1)
    
    def _nms(self, dets, thresh):
        x1 = dets[:, 0]
        y1 = dets[:, 1]
        x2 = dets[:, 2]
        y2 = dets[:, 3]
        scores = dets[:, 4]
        
        areas = (x2 - x1) * (y2 - y1)
        order = scores.argsort()[::-1]
        
        keep = []
        while order.size > 0:
            i = order[0]
            keep.append(i)
            xx1 = np.maximum(x1[i], x1[order[1:]])
            yy1 = np.maximum(y1[i], y1[order[1:]])
            xx2 = np.minimum(x2[i], x2[order[1:]])
            yy2 = np.minimum(y2[i], y2[order[1:]])
            
            w = np.maximum(0.0, xx2 - xx1)
            h = np.maximum(0.0, yy2 - yy1)
            inter = w * h
            ovr = inter / (areas[i] + areas[order[1:]] - inter)
            
            inds = np.where(ovr <= thresh)[0]
            order = order[inds + 1]
        
        return keep

class FaceEmbedder:
    """人脸嵌入提取器 - 使用 ArcFace 模型"""
    def __init__(self, model_path):
        self.session = get_onnx_session(model_path)
        self.input_name = self.session.get_inputs()[0].name
        self.input_shape = self.session.get_inputs()[0].shape
        self.input_size = (112, 112)
        
    def get_embedding(self, img, kps):
        """获取人脸嵌入，返回 (原始 embedding, 归一化 embedding)"""
        # 对齐人脸
        aligned_face, _ = warp_face_by_kps(img, kps, 'arcface_112_v2', self.input_size)
        
        # 预处理
        input_blob = aligned_face.astype(np.float32)
        input_blob = (input_blob - 127.5) / 127.5
        input_blob = input_blob.transpose(2, 0, 1)
        input_blob = np.expand_dims(input_blob, axis=0)
        
        # 推理
        outputs = self.session.run(None, {self.input_name: input_blob})
        embedding = outputs[0].flatten()
        
        # 计算 norm 并归一化
        norm = np.linalg.norm(embedding)
        normed_embedding = embedding / norm if norm > 0 else embedding
        
        return embedding, normed_embedding  # 返回两个值

class SimpleFaceApp:
    """简化的人脸分析应用（纯 ONNX Runtime 实现）"""
    def __init__(self, det_model_path, rec_model_path=None):
        self.detector = FaceDetector(det_model_path)
        self.embedder = FaceEmbedder(rec_model_path) if rec_model_path else None
        
    def get(self, img, max_faces=10):
        """检测人脸并提取特征 - 适配新API"""
        faces = self.detector.get(img)  # 现在返回FaceObject列表
        
        # 限制人脸数量
        if max_faces > 0:
            faces = faces[:max_faces]
        
        # 如果embedder存在，补充embedding信息
        if self.embedder:
            for face in faces:
                if face.kps is not None:
                    try:
                        embedding, normed_embedding = self.embedder.get_embedding(img, face.kps)
                        face.embedding = embedding  # 原始 embedding
                        face.normed_embedding = normed_embedding  # 归一化 embedding
                    except:
                        # 如果embedding提取失败，继续使用现有信息
                        pass
        
        return faces


def init_models():
    """初始化模型"""
    global face_app, swap_models, face_parser_model, age_modifier_model, models_loaded, model_load_errors
    
    model_load_errors = []  # 清空错误列表
    print("=" * 50)
    print("开始初始化模型...")
    print(f"模型目录: {MODEL_PATH}")
    print(f"模型目录是否存在: {os.path.exists(MODEL_PATH)}")
    start_time = time.time()
    
    # 检查模型目录
    if not os.path.exists(MODEL_PATH):
        error_msg = f"模型目录不存在: {MODEL_PATH}"
        print(f"[错误] {error_msg}")
        model_load_errors.append(error_msg)
        print("请确保 models 文件夹与程序在同一目录下")
        return
    
    # 列出模型目录内容
    try:
        print(f"模型目录内容: {os.listdir(MODEL_PATH)}")
        buffalo_path = os.path.join(MODEL_PATH, "buffalo_l")
        if os.path.exists(buffalo_path):
            print(f"buffalo_l 目录内容: {os.listdir(buffalo_path)}")
    except Exception as e:
        print(f"列出目录失败: {e}")
    
    try:
        # 检测GPU
        import onnxruntime as ort
        available_providers = ort.get_available_providers()
        print(f"ONNX Runtime 可用提供程序: {available_providers}")
        
        # 1. 加载人脸检测和识别模型
        det_path = os.path.join(MODEL_PATH, "buffalo_l", "det_10g.onnx")
        rec_path = os.path.join(MODEL_PATH, "buffalo_l", "w600k_r50.onnx")
        
        print(f"人脸检测模型路径: {det_path}")
        print(f"人脸检测模型是否存在: {os.path.exists(det_path)}")
        
        load_start = time.time()
        if os.path.exists(det_path):
            try:
                face_app = SimpleFaceApp(det_path, rec_path if os.path.exists(rec_path) else None)
                print(f"[成功] 人脸检测模型加载耗时: {time.time() - load_start:.2f}秒")
            except Exception as e:
                error_msg = f"人脸检测模型加载失败: {str(e)}"
                print(f"[错误] {error_msg}")
                model_load_errors.append(error_msg)
                import traceback
                traceback.print_exc()
        else:
            error_msg = f"人脸检测模型文件不存在: {det_path}"
            print(f"[错误] {error_msg}")
            model_load_errors.append(error_msg)
        
        # 2. 加载换脸模型
        for model_name, config in SWAP_MODEL_CONFIG.items():
            model_path = os.path.join(MODEL_PATH, config['path'])
            print(f"换脸模型 {model_name} 路径: {model_path}")
            print(f"换脸模型 {model_name} 是否存在: {os.path.exists(model_path)}")
            
            if os.path.exists(model_path):
                try:
                    load_start = time.time()
                    swap_models[model_name] = get_onnx_session(model_path)
                    print(f"[成功] {model_name} 模型加载耗时: {time.time() - load_start:.2f}秒")
                except Exception as e:
                    error_msg = f"{model_name} 模型加载失败: {str(e)}"
                    print(f"[错误] {error_msg}")
                    model_load_errors.append(error_msg)
            else:
                error_msg = f"换脸模型文件不存在: {model_path}"
                print(f"[警告] {error_msg}")
                model_load_errors.append(error_msg)
        
        # 3. 加载人脸分割模型（可选）
        parser_path = os.path.join(MODEL_PATH, "face_parser", "bisenet_resnet_34.onnx")
        if os.path.exists(parser_path):
            try:
                load_start = time.time()
                face_parser_model = get_onnx_session(parser_path)
                print(f"[成功] 人脸分割模型加载耗时: {time.time() - load_start:.2f}秒")
            except Exception as e:
                print(f"[警告] 人脸分割模型加载失败（可选功能）: {e}")
        else:
            print(f"[提示] 人脸分割模型不存在（可选功能）: {parser_path}")
        
        # 4. 加载年龄变换模型（可选）
        age_path = os.path.join(MODEL_PATH, "age_modifier", "styleganex_age.onnx")
        if os.path.exists(age_path):
            try:
                load_start = time.time()
                age_modifier_model = get_onnx_session(age_path)
                print(f"[成功] 年龄变换模型加载耗时: {time.time() - load_start:.2f}秒")
            except Exception as e:
                print(f"[警告] 年龄变换模型加载失败（可选功能）: {e}")
        
        # 判断核心模型是否加载成功
        models_loaded = face_app is not None and len(swap_models) > 0
        total_time = time.time() - start_time
        
        print("=" * 50)
        if models_loaded:
            print(f"[成功] 模型初始化完成，总耗时: {total_time:.2f}秒")
            print(f"  - 人脸检测: {'已加载' if face_app else '未加载'}")
            print(f"  - 换脸模型: {list(swap_models.keys())}")
            print(f"  - 人脸分割: {'已加载' if face_parser_model else '未加载'}")
        else:
            print("[错误] 核心模型加载失败！")
            print("请检查以下问题：")
            print("  1. models 文件夹是否与程序在同一目录")
            print("  2. models/buffalo_l/det_10g.onnx 是否存在")
            print("  3. models/inswapper_128.onnx 是否存在")
            if model_load_errors:
                print("错误详情：")
                for err in model_load_errors:
                    print(f"  - {err}")
        print("=" * 50)
        
    except ImportError as e:
        error_msg = f"缺少依赖库: {str(e)}"
        print(f"[错误] {error_msg}")
        print("请运行: pip install onnxruntime onnx")
        model_load_errors.append(error_msg)
    except Exception as e:
        error_msg = f"模型初始化出错: {str(e)}"
        print(f"[错误] {error_msg}")
        model_load_errors.append(error_msg)
        import traceback
        traceback.print_exc()


def base64_to_cv2(base64_str):
    """Base64转OpenCV图像"""
    if ',' in base64_str:
        base64_str = base64_str.split(',')[1]
    img_data = base64.b64decode(base64_str)
    nparr = np.frombuffer(img_data, np.uint8)
    return cv2.imdecode(nparr, cv2.IMREAD_COLOR)

def cv2_to_base64(img):
    """OpenCV图像转Base64 - 极速优化"""
    # 使用更低的质量，更快的速度
    _, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 70, cv2.IMWRITE_JPEG_OPTIMIZE, 1])  # 降低质量提速
    return 'data:image/jpeg;base64,' + base64.b64encode(buffer).decode('utf-8')


# ============== 换脸核心函数 ==============
# 缓存 inswapper 的 model_initializer
inswapper_initializer = None

def get_inswapper_initializer():
    """获取 inswapper 模型的 initializer 矩阵"""
    global inswapper_initializer
    if inswapper_initializer is None:
        try:
            import onnx
            model_path = os.path.join(MODEL_PATH, 'inswapper_128.onnx')
            model = onnx.load(model_path)
            
            # 找到正确的 initializer (512, 512)
            for init in model.graph.initializer:
                arr = onnx.numpy_helper.to_array(init)
                if arr.shape == (512, 512):
                    inswapper_initializer = arr
                    break
            
            if inswapper_initializer is None:
                inswapper_initializer = onnx.numpy_helper.to_array(model.graph.initializer[-1])
                
        except Exception as e:
            inswapper_initializer = None
    return inswapper_initializer

def create_box_mask(crop_frame, blur_amount=0.5, padding=(0, 0, 0, 0)):
    """创建方形遮罩，带模糊边缘 - 增强融合版"""
    height, width = crop_frame.shape[:2]
    blur_size = int(min(height, width) * 0.5 * blur_amount)
    
    mask = np.ones((height, width), dtype=np.float32)
    
    # 增大边缘渐变区域（25%，而不是15%）
    edge = int(min(height, width) * 0.25)
    
    # 创建更平滑的边缘渐变 - 使用二次函数
    for i in range(edge):
        # 使用平滑的二次曲线而不是线性
        alpha = (i / edge) ** 1.5
        mask[i, :] = np.minimum(mask[i, :], alpha)  # 上
        mask[-(i+1), :] = np.minimum(mask[-(i+1), :], alpha)  # 下
        mask[:, i] = np.minimum(mask[:, i], alpha)  # 左
        mask[:, -(i+1)] = np.minimum(mask[:, -(i+1)], alpha)  # 右
    
    # 高斯模糊融合边缘
    if blur_size > 0:
        mask = cv2.GaussianBlur(mask, (0, 0), blur_size * 0.8)
    
    # 确保中心区域完全不透明
    mask = np.clip(mask, 0, 1)
    
    return mask


def create_forehead_safe_mask(crop_frame, top_fade_ratio=0.35):
    """
    创建对额头/发际线友好的遮罩
    特别处理顶部区域，避免黑框问题
    """
    height, width = crop_frame.shape[:2]
    mask = np.ones((height, width), dtype=np.float32)
    
    # 顶部渐变区域 - 更大的渐变范围
    top_fade_height = int(height * top_fade_ratio)
    for i in range(top_fade_height):
        # 使用平滑的三次函数渐变
        t = i / top_fade_height
        alpha = t * t * (3 - 2 * t)  # smoothstep
        mask[i, :] = alpha
    
    # 左右和底部使用较小的渐变
    side_fade = int(min(height, width) * 0.15)
    bottom_fade = int(height * 0.2)
    
    for i in range(side_fade):
        alpha = (i / side_fade) ** 1.2
        mask[:, i] = np.minimum(mask[:, i], alpha)
        mask[:, -(i+1)] = np.minimum(mask[:, -(i+1)], alpha)
    
    for i in range(bottom_fade):
        alpha = (i / bottom_fade) ** 1.2
        mask[-(i+1), :] = np.minimum(mask[-(i+1), :], alpha)
    
    # 应用高斯模糊平滑过渡
    blur_size = int(min(height, width) * 0.15)
    if blur_size > 0:
        blur_size = blur_size | 1  # 确保是奇数
        mask = cv2.GaussianBlur(mask, (blur_size, blur_size), 0)
    
    return np.clip(mask, 0, 1)


def create_ellipse_mask(height, width, center_offset_y=-0.05, scale_x=0.85, scale_y=0.95):
    """
    创建椭圆形遮罩 - 更符合人脸形状
    center_offset_y: 中心向下偏移比例（负值向下）
    """
    mask = np.zeros((height, width), dtype=np.float32)
    
    center_x = width // 2
    center_y = int(height * (0.5 + center_offset_y))
    
    # 椭圆轴长
    axis_x = int(width * scale_x / 2)
    axis_y = int(height * scale_y / 2)
    
    # 绘制实心椭圆
    cv2.ellipse(mask, (center_x, center_y), (axis_x, axis_y), 0, 0, 360, 1.0, -1)
    
    # 应用较大的高斯模糊创建柔和边缘
    blur_size = int(min(height, width) * 0.2)
    blur_size = blur_size | 1
    mask = cv2.GaussianBlur(mask, (blur_size, blur_size), 0)
    
    return mask


def color_transfer(source, target):
    """颜色转换 - 让换脸区域颜色与目标区域匹配"""
    # 转换到 LAB 颜色空间
    source_lab = cv2.cvtColor(source, cv2.COLOR_BGR2LAB).astype(np.float32)
    target_lab = cv2.cvtColor(target, cv2.COLOR_BGR2LAB).astype(np.float32)
    
    # 计算均值和标准差
    source_mean, source_std = source_lab.mean(axis=(0,1)), source_lab.std(axis=(0,1))
    target_mean, target_std = target_lab.mean(axis=(0,1)), target_lab.std(axis=(0,1))
    
    # 避免除零
    source_std = np.where(source_std == 0, 1, source_std)
    
    # 转换
    result_lab = (source_lab - source_mean) * (target_std / source_std) + target_mean
    result_lab = np.clip(result_lab, 0, 255).astype(np.uint8)
    
    return cv2.cvtColor(result_lab, cv2.COLOR_LAB2BGR)

def create_area_mask(crop_frame, face_kps):
    """创建基于关键点的区域遮罩"""
    height, width = crop_frame.shape[:2]
    mask = np.zeros((height, width), dtype=np.float32)
    
    if face_kps is not None and len(face_kps) >= 5:
        # 使用关键点创建凸包
        hull = cv2.convexHull(face_kps.astype(np.int32))
        cv2.fillConvexPoly(mask, hull, 1.0)
        # 扩展和模糊
        kernel = np.ones((5, 5), np.uint8)
        mask = cv2.dilate(mask, kernel, iterations=2)
        mask = cv2.GaussianBlur(mask, (0, 0), 5)
        mask = (mask.clip(0.5, 1) - 0.5) * 2
    else:
        mask = np.ones((height, width), dtype=np.float32)
    
    return mask

def balance_embedding(source_embedding, target_embedding, weight=0.5):
    """
    平衡源和目标的 embedding - 参考 facefusion
    weight: 0 = 完全使用源人脸, 1 = 完全使用目标人脸
    默认 0.5 让换脸效果更自然
    """
    # 将 weight 映射到合理范围
    weight = np.interp(weight, [0, 1], [0.35, -0.35]).astype(np.float32)
    
    # 归一化目标 embedding
    target_norm = target_embedding / (np.linalg.norm(target_embedding) + 1e-6)
    
    # 混合
    source_embedding = source_embedding.reshape(1, -1)
    target_norm = target_norm.reshape(1, -1)
    balanced = source_embedding * (1 - weight) + target_norm * weight
    
    return balanced.astype(np.float32)

def swap_face_inswapper(source_face, source_img, target_face, target_img, use_fp16=False):
    """使用 inswapper 模型换脸 - 极速优化版"""
    global cached_source_embedding
    
    # 优先使用FP16模型（如果可用且启用）
    model_key = 'inswapper_fp16' if use_fp16 and 'inswapper_fp16' in swap_models else 'inswapper'
    session = swap_models.get(model_key)
    if session is None:
        return target_img
    
    model_size = (128, 128)
    
    target_kps = target_face.kps
    if target_kps is None:
        return target_img
    
    # 对齐目标人脸 - 使用最快插值
    crop_frame, affine_matrix = warp_face_by_kps(target_img, target_kps, 'arcface_128', model_size)
    
    # 使用缓存的 embedding
    if cached_source_embedding is None:
        source_embedding = source_face.embedding
        if source_embedding is None:
            source_embedding = source_face.normed_embedding
        
        if source_embedding is None:
            return target_img
        
        original_norm = np.linalg.norm(source_embedding)
        
        initializer = get_inswapper_initializer()
        if initializer is not None:
            source_embedding = source_embedding.reshape((1, -1))
            source_embedding = np.dot(source_embedding, initializer) / original_norm
        else:
            source_embedding = source_embedding.reshape((1, -1))
        
        cached_source_embedding = source_embedding.astype(np.float32)
    
    # 预处理目标图像
    crop_input = crop_frame[:, :, ::-1].astype(np.float32) / 255.0
    crop_input = crop_input.transpose(2, 0, 1)
    crop_input = np.expand_dims(crop_input, axis=0).astype(np.float32)
    
    # 运行模型
    try:
        input_names = [inp.name for inp in session.get_inputs()]
        inputs = {
            input_names[0]: crop_input,
            input_names[1]: cached_source_embedding
        }
        output = session.run(None, inputs)[0][0]
    except Exception as e:
        return target_img
    
    # 后处理
    output = output.transpose(1, 2, 0)
    output = np.clip(output, 0, 1)
    swapped_face = (output[:, :, ::-1] * 255).astype(np.uint8)
    
    # 颜色校正 - 让肤色更自然
    swapped_face = match_color_simple(swapped_face, crop_frame)
    
    # 创建精确遮罩 - 覆盖更大范围
    h, w = swapped_face.shape[:2]
    crop_mask = create_precise_mask(h, w)
    
    # 贴回原图
    result = paste_back(target_img, swapped_face, crop_mask, affine_matrix)
    
    return result

# 预计算的遮罩缓存
_fast_mask_cache = {}

# 锐化核
_sharpen_kernel = np.array([[-0.3, -0.3, -0.3],
                            [-0.3,  3.4, -0.3],
                            [-0.3, -0.3, -0.3]], dtype=np.float32)

def sharpen_face(img):
    """轻微锐化人脸提高清晰度"""
    return cv2.filter2D(img, -1, _sharpen_kernel)

def create_fast_mask(h, w):
    """创建快速遮罩 - 使用缓存"""
    key = (h, w)
    if key not in _fast_mask_cache:
        # 创建椭圆遮罩 - 稍大一点提高清晰度
        mask = np.zeros((h, w), dtype=np.float32)
        center = (w // 2, h // 2 + int(h * 0.03))
        axes = (int(w * 0.42), int(h * 0.46))
        cv2.ellipse(mask, center, axes, 0, 0, 360, 1.0, -1)
        # 模糊边缘
        mask = cv2.GaussianBlur(mask, (21, 21), 0)
        mask = mask * 0.9
        _fast_mask_cache[key] = mask
    return _fast_mask_cache[key]

# 精确遮罩缓存
_precise_mask_cache = {}

def create_precise_mask(h, w):
    """创建精确遮罩 - 轻量边缘优化"""
    key = (h, w)
    if key not in _precise_mask_cache:
        mask = np.zeros((h, w), dtype=np.float32)
        
        # 脸部主体椭圆
        center = (w // 2, h // 2)
        axes = (int(w * 0.46), int(h * 0.50))
        cv2.ellipse(mask, center, axes, 0, 0, 360, 1.0, -1)
        
        # 轻量优化：3×3形态学膨胀 + 5×5高斯模糊
        kernel_3x3 = np.ones((3, 3), np.uint8)
        mask = cv2.dilate(mask, kernel_3x3, iterations=1)
        mask = cv2.GaussianBlur(mask, (5, 5), 0)
        
        _precise_mask_cache[key] = mask
    return _precise_mask_cache[key]


def match_color_simple(src, dst):
    """颜色匹配 - 轻微调整，保留源脸特征"""
    try:
        src_lab = cv2.cvtColor(src, cv2.COLOR_BGR2LAB).astype(np.float32)
        dst_lab = cv2.cvtColor(dst, cv2.COLOR_BGR2LAB).astype(np.float32)
        
        # 只调整亮度通道，保留源脸肤色
        src_mean = src_lab[:, :, 0].mean()
        dst_mean = dst_lab[:, :, 0].mean()
        
        # 轻微亮度调整(30%)
        adjustment = (dst_mean - src_mean) * 0.3
        src_lab[:, :, 0] = np.clip(src_lab[:, :, 0] + adjustment, 0, 255)
        
        return cv2.cvtColor(src_lab.astype(np.uint8), cv2.COLOR_LAB2BGR)
    except:
        return src

def swap_face_hyperswap(source_face, source_img, target_face, target_img):
    """使用 hyperswap 模型换脸 - 修复版"""
    session = swap_models.get('hyperswap')
    if session is None:
        return target_img
    
    config = SWAP_MODEL_CONFIG['hyperswap']
    model_size = config['size']
    model_mean = np.array(config['mean']).reshape(1, 1, 3)
    model_std = np.array(config['std']).reshape(1, 1, 3)
    
    target_kps = target_face.kps
    if target_kps is None:
        return target_img
    
    try:
        # 对齐目标人脸
        crop_frame, affine_matrix = warp_face_by_kps(target_img, target_kps, 'arcface_128', model_size)
        
        # 准备目标图像输入
        crop_input = crop_frame[:, :, ::-1].astype(np.float32) / 255.0
        crop_input = (crop_input - model_mean) / model_std
        crop_input = crop_input.transpose(2, 0, 1)
        crop_input = np.expand_dims(crop_input, axis=0).astype(np.float32)
        
        # 准备源人脸 embedding
        source_embedding = source_face.normed_embedding
        if source_embedding is None:
            return target_img
        source_embedding = source_embedding.reshape((1, -1)).astype(np.float32)
        
        # 获取模型输入名
        input_names = [inp.name for inp in session.get_inputs()]
        
        # 运行模型
        with SESSION_SEMAPHORE:
            inputs = {}
            for name in input_names:
                if 'source' in name.lower() or 'embed' in name.lower():
                    inputs[name] = source_embedding
                else:
                    inputs[name] = crop_input
            
            outputs = session.run(None, inputs)
            output_frame = outputs[0][0]
        
        # 后处理图像
        output_frame = output_frame.transpose(1, 2, 0)
        output_frame = output_frame * model_std + model_mean
        output_frame = np.clip(output_frame, 0, 1)
        swapped_face = (output_frame[:, :, ::-1] * 255).astype(np.uint8)
        
        # 轻微颜色校正
        swapped_face = match_color_simple(swapped_face, crop_frame)
        
        # 使用简单遮罩
        h, w = swapped_face.shape[:2]
        crop_mask = create_precise_mask(h, w)
        
        # 贴回原图
        result = paste_back(target_img, swapped_face, crop_mask, affine_matrix)
        
        return result
        
    except Exception as e:
        print(f"[hyperswap错误] {e}")
        return target_img


def parse_face(img, face):
    """使用人脸分割模型创建更精确的遮罩"""
    if face_parser_model is None:
        return create_simple_mask(img, face)
    
    try:
        kps = face.kps
        aligned, M = warp_face_by_kps(img, kps, 'arcface_112_v2', (512, 512))
        
        # 准备输入
        input_img = aligned[:, :, ::-1].astype(np.float32) / 255.0
        input_img = input_img.transpose(2, 0, 1)
        input_img = np.expand_dims(input_img, axis=0).astype(np.float32)
        
        # 运行模型
        inputs = {face_parser_model.get_inputs()[0].name: input_img}
        output = face_parser_model.run(None, inputs)[0]
        
        # 处理输出
        mask = output.squeeze()
        if len(mask.shape) == 3:
            # 多类别分割，合并人脸相关类别
            face_classes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]  # 人脸区域类别
            mask = np.isin(np.argmax(mask, axis=0), face_classes).astype(np.float32)
        
        mask = cv2.resize(mask, (512, 512))
        mask = cv2.GaussianBlur(mask, (15, 15), 0)
        
        # 变换回原图
        inverse_M = cv2.invertAffineTransform(M)
        mask_full = cv2.warpAffine(mask, inverse_M, (img.shape[1], img.shape[0]))
        
        return mask_full
        
    except Exception:
        return create_simple_mask(img, face)


def create_simple_mask(img, face):
    """创建简单的人脸遮罩"""
    mask = np.zeros(img.shape[:2], dtype=np.float32)
    
    if hasattr(face, 'landmark_2d_106') and face.landmark_2d_106 is not None:
        kps = face.landmark_2d_106.astype(np.int32)
    elif hasattr(face, 'kps') and face.kps is not None:
        kps = face.kps.astype(np.int32)
    else:
        bbox = face.bbox.astype(np.int32)
        cv2.rectangle(mask, (bbox[0], bbox[1]), (bbox[2], bbox[3]), 1.0, -1)
        return cv2.GaussianBlur(mask, (31, 31), 0)
    
    hull = cv2.convexHull(kps)
    cv2.fillConvexPoly(mask, hull, 1.0)
    kernel = np.ones((10, 10), np.uint8)
    mask = cv2.dilate(mask, kernel, iterations=2)
    mask = cv2.GaussianBlur(mask, (31, 31), 0)
    
    return mask


def fast_enhance_128model(face_img):
    """纯OpenCV实现，128模型专属：去噪+轻度锐化，耗时<3ms"""
    try:
        # 1. 快速去噪
        denoised = cv2.medianBlur(face_img, 3)
        # 2. 轻度锐化
        kernel = np.array([[0, -0.5, 0], [-0.5, 3, -0.5], [0, -0.5, 0]])
        sharpened = cv2.filter2D(denoised, -1, kernel)
        # 3. 强度融合
        return cv2.addWeighted(denoised, 0.8, sharpened, 0.2, 0)
    except:
        return face_img


def remove_pixelation(face_img):
    """消除128模型放大后的像素块和颗粒感"""
    try:
        # 1. 轻量高斯模糊，打散像素块
        blurred = cv2.GaussianBlur(face_img, UPSCALE_BLUR_KERNEL, 0)
        # 2. 自适应锐化，保留细节
        kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
        sharpened = cv2.filter2D(blurred, -1, kernel)
        # 3. 融合原始图，避免过度锐化
        return cv2.addWeighted(blurred, 0.9, sharpened, 0.1, 0)
    except:
        return face_img


def lightweight_upscale(face_img):
    """轻量超分 - 针对128模型输出，提升细节"""
    try:
        h, w = face_img.shape[:2]
        # 1.5倍超分后再缩回目标尺寸（保留细节）
        upscaled = cv2.resize(face_img, (int(w * 1.5), int(h * 1.5)), interpolation=cv2.INTER_CUBIC)
        # 缩放到目标超分尺寸
        target_w = int(w * UPSCALE_SCALE)
        target_h = int(h * UPSCALE_SCALE)
        return cv2.resize(upscaled, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)
    except:
        return face_img


def sharpen_for_128model(face_img):
    """128模型专属锐化 - 不放大噪点"""
    try:
        # 第一步：去噪（解决128模型噪点问题）
        denoised = cv2.fastNlMeansDenoisingColored(face_img, None, 5, 5, 7, 21)
        # 第二步：定向锐化（仅增强五官细节）
        kernel = np.array([[-1,-1,-1], [-1,9,-1], [-1,-1,-1]])
        sharpened = cv2.filter2D(denoised, -1, kernel)
        # 第三步：强度控制（避免过度锐化）
        return cv2.addWeighted(face_img, 0.7, sharpened, 0.3, 0)
    except:
        return face_img


def lightweight_face_sharpen(face_img):
    """轻量人脸锐化 - 双边滤波+拉普拉斯增强"""
    try:
        # 双边滤波（锐化同时保边缘，不放大噪点）
        sharpened = cv2.bilateralFilter(face_img, 3, 75, 75)
        # 轻度拉普拉斯增强细节
        laplacian = cv2.Laplacian(sharpened, cv2.CV_64F)
        result = cv2.convertScaleAbs(sharpened - 0.3 * laplacian)
        return result
    except:
        return face_img


def fix_skin_tone(face_img):
    """肤色校正 - 解决偏红"""
    try:
        b, g, r = cv2.split(face_img)
        r = np.clip(r.astype(np.float32) * 0.9, 0, 255).astype(np.uint8)   # 压暗红色通道
        g = np.clip(g.astype(np.float32) * 1.05, 0, 255).astype(np.uint8)  # 提亮绿色通道
        return cv2.merge((b, g, r))
    except:
        return face_img


def balance_local_brightness(face_img):
    """局部亮度平衡 - 解决光照不均"""
    try:
        gray = cv2.cvtColor(face_img, cv2.COLOR_BGR2GRAY)
        bright_mask = (gray > 200).astype(np.uint8) * 255
        # 降低过亮区域亮度
        bright_area = cv2.bitwise_and(face_img, face_img, mask=bright_mask)
        dark_bright = cv2.convertScaleAbs(bright_area, alpha=0.8, beta=0)
        # 合并回原图
        inv_mask = cv2.bitwise_not(bright_mask)
        base = cv2.bitwise_and(face_img, face_img, mask=inv_mask)
        return cv2.add(base, dark_bright)
    except:
        return face_img


def high_quality_resize(img, target_w, target_h):
    """高质量缩放 - 替换所有cv2.resize调用"""
    return cv2.resize(img, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)


def color_transfer_light(source, target):
    """轻量色彩匹配 - 仅匹配亮度和饱和度，耗时<5ms"""
    try:
        source_hsv = cv2.cvtColor(source, cv2.COLOR_BGR2HSV).astype(np.float32)
        target_hsv = cv2.cvtColor(target, cv2.COLOR_BGR2HSV).astype(np.float32)
        
        # 匹配亮度通道（核心提升自然度）
        src_v_mean = source_hsv[..., 2].mean() + 1e-6
        dst_v_mean = target_hsv[..., 2].mean() + 1e-6
        source_hsv[..., 2] = np.clip(source_hsv[..., 2] * (dst_v_mean / src_v_mean), 0, 255)
        
        # 匹配饱和度（小幅调整，避免过艳）
        src_s_mean = source_hsv[..., 1].mean() + 1e-6
        dst_s_mean = target_hsv[..., 1].mean() + 1e-6
        ratio = min(max(dst_s_mean / src_s_mean, 0.8), 1.2)  # 限制调整幅度
        source_hsv[..., 1] = np.clip(source_hsv[..., 1] * ratio, 0, 255)
        
        return cv2.cvtColor(source_hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    except:
        return source


def color_correction(src_img, dst_img, mask):
    """色彩校正 - 使用轻量版"""
    return color_transfer_light(src_img, dst_img)


def add_watermark(img, text="AI生成内容 - 仅供娱乐"):
    """添加整屏水印"""
    from PIL import Image, ImageDraw, ImageFont
    import math
    
    img_pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    w, h = img_pil.size
    
    watermark = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(watermark)
    
    font_size = max(20, min(w, h) // 15)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", font_size)
    except:
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/simhei.ttf", font_size)
        except:
            font = ImageFont.load_default()
    
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    
    spacing_x = text_w + 80
    spacing_y = text_h + 80
    
    angle = -30
    rad = math.radians(angle)
    
    for yi in range(-2, (h // spacing_y) + 3):
        for xi in range(-2, (w // spacing_x) + 3):
            x = xi * spacing_x
            y = yi * spacing_y
            rx = int(x * math.cos(rad) - y * math.sin(rad))
            ry = int(x * math.sin(rad) + y * math.cos(rad))
            draw.text((rx, ry), text, font=font, fill=(255, 255, 255, 80))
    
    img_pil = img_pil.convert('RGBA')
    result = Image.alpha_composite(img_pil, watermark)
    result = result.convert('RGB')
    
    return cv2.cvtColor(np.array(result), cv2.COLOR_RGB2BGR)


# ============== API 路由 ==============
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory('js', filename)

@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory('css', filename)

@app.route('/health', methods=['GET'])
def health():
    """健康检查 - 返回详细的模型加载状态"""
    return jsonify({
        'status': 'ok' if models_loaded else 'error',
        'face_app': face_app is not None,
        'swap_models': list(swap_models.keys()),
        'face_parser': face_parser_model is not None,
        'age_modifier': age_modifier_model is not None,
        'models_loaded': models_loaded,
        'current_swap_model': current_config['swap_model'],
        'model_path': MODEL_PATH,
        'model_path_exists': os.path.exists(MODEL_PATH),
        'errors': model_load_errors if model_load_errors else []
    })


@app.route('/get_config', methods=['GET'])
def get_config():
    """获取当前配置"""
    return jsonify({
        'success': True,
        'config': current_config,
        'available_models': list(swap_models.keys())
    })

@app.route('/set_config', methods=['POST'])
def set_config():
    """设置配置"""
    global current_config
    try:
        data = request.json
        if 'swap_model' in data and data['swap_model'] in swap_models:
            current_config['swap_model'] = data['swap_model']
        if 'use_face_parser' in data:
            current_config['use_face_parser'] = bool(data['use_face_parser'])
        if 'age_modifier_direction' in data:
            current_config['age_modifier_direction'] = int(data['age_modifier_direction'])
        if 'color_correction' in data:
            current_config['color_correction'] = bool(data['color_correction'])
        if 'blend_strength' in data:
            current_config['blend_strength'] = float(data['blend_strength'])
        
        return jsonify({'success': True, 'config': current_config})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/verify_activation', methods=['POST'])
def verify_activation():
    """\u672c\u5730\u79bb\u7ebf\u9a8c\u8bc1\u6fc0\u6d3b\u7801 - \u65e0\u670d\u52a1\u5668\u4f9d\u8d56"""
    import secrets
    try:
        data = request.json
        code = data.get('code', '').upper().strip()
        
        if not code:
            return jsonify({'success': False, 'error': '\u7f3a\u5c11\u6fc0\u6d3b\u7801'})
        
        # \u4f7f\u7528\u672c\u5730\u9a8c\u8bc1
        result = local_verify_activation(code)
        
        if result['valid']:
            # \u751f\u6210\u672c\u5730token\uff0c\u4ec5\u7528\u4e8e\u4f1a\u8bdd\u5185\u6807\u8bc6
            token = secrets.token_hex(16)
            activation_cache[token] = result['type']
            return jsonify({
                'success': True,
                'token': token,
                'type': result['type']
            })
        else:
            return jsonify({'success': False, 'error': '\u6fc0\u6d3b\u7801\u65e0\u6548'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/set_source', methods=['POST'])
def set_source():
    """设置源人脸"""
    global source_face, source_face_img
    
    if face_app is None:
        # 返回详细的错误信息
        error_details = {
            'model_path': MODEL_PATH,
            'model_path_exists': os.path.exists(MODEL_PATH),
            'det_model_exists': os.path.exists(os.path.join(MODEL_PATH, "buffalo_l", "det_10g.onnx")),
            'errors': model_load_errors if model_load_errors else ['模型未加载，原因未知']
        }
        return jsonify({
            'success': False, 
            'error': '人脸检测模型未加载，请检查 models 文件夹是否完整',
            'details': error_details,
            'suggestion': '请确保 models/buffalo_l/det_10g.onnx 文件存在，并重启程序'
        })
    
    try:
        data = request.json
        if not data or 'image' not in data:
            return jsonify({'success': False, 'error': '缺少图片数据'})
        
        img = base64_to_cv2(data['image'])
        if img is None:
            return jsonify({'success': False, 'error': '图片解码失败'})
        
        # 添加诊断日志
        print(f"[set_source] 图片尺寸: {img.shape}, dtype: {img.dtype}")
        
        # 如果图片太小，进行放大
        h, w = img.shape[:2]
        min_size = 256
        if h < min_size or w < min_size:
            scale = max(min_size / h, min_size / w)
            new_w, new_h = int(w * scale), int(h * scale)
            img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
            print(f"[set_source] 图片太小，已放大至: {img.shape}")
        
        faces = face_app.get(img)
        print(f"[set_source] 检测到 {len(faces)} 张人脸")
        
        if len(faces) == 0:
            # 尝试不同的预处理方法
            # 1. 增加亮度对比度
            img_enhanced = cv2.convertScaleAbs(img, alpha=1.2, beta=20)
            faces = face_app.get(img_enhanced)
            print(f"[set_source] 增强后检测到 {len(faces)} 张人脸")
            
            if len(faces) == 0:
                # 2. 放大图片尝试
                scale = 1.5
                img_scaled = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_LINEAR)
                faces = face_app.get(img_scaled)
                print(f"[set_source] 放大1.5倍后检测到 {len(faces)} 张人脸")
                
                if len(faces) > 0:
                    # 调整坐标回原图
                    for face in faces:
                        face.bbox = face.bbox / scale
                        if face.kps is not None:
                            face.kps = face.kps / scale
        
        if len(faces) == 0:
            return jsonify({'success': False, 'error': '未检测到人脸，请上传清晰的正脸照片'})
        
        source_face = faces[0]
        source_face_img = img.copy()
        
        # 清除缓存的 embedding，强制重新计算
        global cached_source_embedding
        cached_source_embedding = None
        
        print(f"[set_source] 源人脸设置成功, bbox: {source_face.bbox}")
        return jsonify({'success': True, 'message': '源人脸设置成功'})
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'设置源人脸失败: {str(e)}'})


@app.route('/swap', methods=['POST'])
def swap():
    """执行换脸 - 极速优化版"""
    global source_face, source_face_img, frame_counter, cached_faces_for_swap
    global last_swap_result, _gc_frame_counter
    
    if face_app is None:
        return jsonify({'success': False, 'error': '人脸检测模型未加载'})

    if source_face is None:
        return jsonify({'success': False, 'error': '请先设置源人脸'})

    model_name = current_config['swap_model']
    if model_name not in swap_models:
        return jsonify({'success': False, 'error': f'换脸模型 [{model_name}] 未加载'})

    try:
        start_time = time.time()

        # 检查系统负载
        if performance_scheduler._is_system_overloaded():
            return jsonify({
                'success': False, 
                'error': '系统负载过高，请稍后重试',
                'overloaded': True
            })

        data = request.json
        if not data or 'image' not in data:
            return jsonify({'success': False, 'error': '缺少图片数据'})

        # 使用缓存的激活状态，避免重复计算
        (activated, remaining_days), trial_seconds = get_cached_activation_status()

        # 试用期已结束且未激活
        if not activated and trial_seconds <= 0:
            return jsonify({
                'success': False,
                'error': '试用期已结束，请输入激活码',
                'need_activation': True
            })

        # 高效解码图像
        img_data = data['image']
        if ',' in img_data:
            img_data = img_data.split(',', 1)[1]
        img_bytes = base64.b64decode(img_data)
        dst_img = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)

        if dst_img is None:
            return jsonify({'success': False, 'error': '图片解码失败'})

        orig_h, orig_w = dst_img.shape[:2]

        # 缩小处理分辨率 - 使用最快插值
        if PROCESS_SCALE < 1.0 and min(orig_h, orig_w) > 300:
            dst_img = cv2.resize(dst_img, None, fx=PROCESS_SCALE, fy=PROCESS_SCALE, interpolation=cv2.INTER_LANCZOS4)

        frame_counter += 1
        _gc_frame_counter += 1

        # 每10帧手动GC一次
        if _gc_frame_counter >= 10:
            _gc_frame_counter = 0
            clear_temp_arrays()

        # 性能优化：跳帧检测
        need_detect = (frame_counter % DETECT_SKIP_FRAMES == 1) or cached_faces_for_swap is None

        if need_detect:
            h, w = dst_img.shape[:2]
            if DETECT_SCALE < 1.0 and min(h, w) > 200:
                small_img = cv2.resize(dst_img, None, fx=DETECT_SCALE, fy=DETECT_SCALE, interpolation=cv2.INTER_NEAREST)
                dst_faces = face_app.get(small_img)
                scale_factor = 1.0 / DETECT_SCALE
                for face in dst_faces:
                    face.bbox = face.bbox * scale_factor
                    if face.kps is not None:
                        face.kps = face.kps * scale_factor
            else:
                dst_faces = face_app.get(dst_img)

            if dst_faces and len(dst_faces) > 0:
                cached_faces_for_swap = dst_faces
        else:
            dst_faces = cached_faces_for_swap

        tracked_faces = face_tracker.update(dst_faces)

        if tracked_faces is None or len(tracked_faces) == 0:
            # 返回缓存结果
            if last_swap_result is not None:
                result_base64 = cv2_to_base64(last_swap_result)
                return jsonify({
                    'success': True,
                    'image': result_base64,
                    'processTime': 0,
                    'model': model_name,
                    'cached': True
                })
            return jsonify({
                'success': True,
                'image': data['image'],
                'processTime': 0,
                'model': model_name,
                'noFace': True
            })

        # 换脸处理 - 根据选择的模型调用
        target_face = tracked_faces[0]
        if model_name == 'hyperswap':
            result_img = swap_face_hyperswap(source_face, source_face_img, target_face, dst_img)
        else:
            result_img = swap_face_inswapper(source_face, source_face_img, target_face, dst_img)
        
        # 轻量增强 + 消除像素感
        result_img = fast_enhance_128model(result_img)
        result_img = remove_pixelation(result_img)
        result_img = fix_skin_tone(result_img)

        # 缓存结果
        last_swap_result = result_img
        face_tracker.save_result(result_img)

        # 添加水印
        if not activated:
            result_img = add_watermark(result_img, "AI生成内容")

        result_base64 = cv2_to_base64(result_img)
        process_time = int((time.time() - start_time) * 1000)
        
        # 记录帧处理时间到性能调度器
        performance_scheduler.record_frame_time(process_time)

        return jsonify({
            'success': True,
            'image': result_base64,
            'processTime': process_time,
            'model': model_name
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# 异步处理版本（用于更高性能）
async def async_swap_process(source_face, source_face_img, model_name, dst_img, activated):
    """异步换脸处理"""
    result_img = dst_img.copy()
    dst_faces = face_app.get(dst_img)
    
    if not dst_faces or len(dst_faces) == 0:
        return dst_img, False
        
    target_face = dst_faces[0]
    
    if model_name == 'hyperswap':
        result_img = swap_face_hyperswap(source_face, source_face_img, target_face, result_img)
    else:
        result_img = swap_face_inswapper(source_face, source_face_img, target_face, result_img)
    
    # 轻量增强 + 消除像素感
    result_img = fast_enhance_128model(result_img)
    result_img = remove_pixelation(result_img)
    result_img = fix_skin_tone(result_img)

    if not activated:
        result_img = add_watermark(result_img, "AI生成内容 - 仅供娱乐")
        
    return result_img, True

@app.route('/clear', methods=['POST'])
def clear():
    global source_face, source_face_img
    source_face = None
    source_face_img = None
    return jsonify({'success': True})

@app.route('/set_model', methods=['POST'])
def set_model():
    """\u5207\u6362\u6362\u8138\u6a21\u578b"""
    global current_config
    data = request.json
    model_name = data.get('model', 'inswapper')
    
    if model_name in swap_models:
        current_config['swap_model'] = model_name
        return jsonify({'success': True, 'model': model_name})
    else:
        return jsonify({'success': False, 'error': f'\u6a21\u578b {model_name} \u672a\u52a0\u8f7d', 'available': list(swap_models.keys())})

@app.route('/get_models', methods=['GET'])
def get_models():
    """获取可用模型列表"""
    return jsonify({
        'success': True,
        'models': list(swap_models.keys()),
        'current': current_config['swap_model']
    })

# ============== 激活码 API ==============
@app.route('/get_machine_code', methods=['GET'])
def api_get_machine_code():
    """获取机器码"""
    return jsonify({
        'success': True,
        'machine_code': get_machine_code()
    })

@app.route('/get_status', methods=['GET'])
def api_get_status():
    """获取激活状态"""
    activated, remaining_days = is_activated()
    trial_seconds = get_trial_time_remaining()
    
    return jsonify({
        'success': True,
        'activated': activated,
        'remaining_days': remaining_days,  # 剩余天数
        'trial_seconds': trial_seconds,  # 试用剩余秒数
        'machine_code': get_machine_code()
    })

@app.route('/activate', methods=['POST'])
def api_activate():
    """验证并保存激活码 - 带频率限制"""
    # 获取客户端标识
    client_id = request.remote_addr or 'default'
    
    # 检查频率限制
    allowed, error_msg = _check_activation_rate_limit(client_id)
    if not allowed:
        return jsonify({'success': False, 'error': error_msg})
    
    data = request.json
    activation_code = data.get('code', '')
    
    if not activation_code:
        return jsonify({'success': False, 'error': '请输入激活码'})
    
    machine_code = get_machine_code()
    valid, remaining_days = verify_activation_code(machine_code, activation_code)
    
    if valid and remaining_days > 0:
        # 激活成功，清除尝试记录
        _record_activation_attempt(client_id, success=True)
        save_activation(activation_code)
        
        # 永久激活特殊显示
        if remaining_days >= 99999:
            msg = '激活成功，永久有效'
        else:
            msg = f'激活成功，有效期{remaining_days}天'
        
        return jsonify({
            'success': True,
            'message': msg,
            'activated': True,
            'remaining_days': remaining_days
        })
    elif remaining_days <= 0:
        # 记录失败尝试
        _record_activation_attempt(client_id, success=False)
        return jsonify({
            'success': False,
            'error': '激活码已过期，请获取新激活码'
        })
    else:
        # 记录失败尝试
        _record_activation_attempt(client_id, success=False)
        return jsonify({
            'success': False,
            'error': '激活码无效或机器码不匹配'
        })

def run_server():
    app.run(host='127.0.0.1', port=5000, debug=False, threaded=True, use_reloader=False)

def auto_optimize_hardware():
    """自动检测硬件并优化配置，确保客户端零配置运行"""
    global PROCESS_SCALE, DETECT_SKIP_FRAMES, MIN_FRAME_INTERVAL, FPS_TARGET
    
    print("="*50)
    print("自动硬件检测与优化...")
    
    # 检测GPU信息 - 使用更可靠的方法
    gpu_name = "未知"
    vram_mb = 4096  # 默认偐4GB
    try:
        import subprocess
        # 使用/format:csv获取更可靠的输出
        result = subprocess.run(
            ['wmic', 'path', 'win32_videocontroller', 'get', 'name,adapterram', '/format:csv'],
            capture_output=True, text=True, timeout=5
        )
        lines = [l.strip() for l in result.stdout.strip().split('\n') if l.strip() and 'Name' not in l and 'Node' not in l]
        for line in lines:
            parts = line.split(',')
            if len(parts) >= 3:
                try:
                    vram = int(parts[1]) if parts[1].isdigit() else 0
                    vram_mb = vram // (1024*1024) if vram > 0 else 4096
                    gpu_name = parts[2] if len(parts) > 2 else "未知"
                except:
                    pass
        print(f"  GPU: {gpu_name}")
        print(f"  显存: {vram_mb}MB")
    except Exception as e:
        print(f"  GPU检测失败: {e}，使用默认配置")
        vram_mb = 4096  # 假定4GB
    
    # 检测DirectML可用性
    directml_ok = False
    try:
        import onnxruntime
        eps = onnxruntime.get_available_providers()
        if 'DmlExecutionProvider' in eps:
            directml_ok = True
            print("  DirectML: 可用 (GPU加速)")
        else:
            print("  DirectML: 不可用 (CPU模式)")
    except:
        print("  DirectML检测失败")
    
    # 根据硬件自动调整参数
    if vram_mb >= 8000:  # 8GB+显存
        PROCESS_SCALE = 0.8
        DETECT_SKIP_FRAMES = 6
        MIN_FRAME_INTERVAL = 0.033  # 30FPS
        FPS_TARGET = 30
        print("  性能模式: 高端 (8GB+显存)")
    elif vram_mb >= 3800:  # 4-8GB显存 (容许4095MB=4GB)
        PROCESS_SCALE = 0.7
        DETECT_SKIP_FRAMES = 8
        MIN_FRAME_INTERVAL = 0.04  # 25FPS
        FPS_TARGET = 25
        print("  性能模式: 标准 (4-8GB显存)")
    elif vram_mb >= 1800:  # 2-4GB显存
        PROCESS_SCALE = 0.6
        DETECT_SKIP_FRAMES = 10
        MIN_FRAME_INTERVAL = 0.05  # 20FPS
        FPS_TARGET = 20
        print("  性能模式: 节能 (2-4GB显存)")
    else:  # 低VRAM或集显
        PROCESS_SCALE = 0.5
        DETECT_SKIP_FRAMES = 12
        MIN_FRAME_INTERVAL = 0.067  # 15FPS
        FPS_TARGET = 15
        print("  性能模式: 经济 (集成显卡/低端)")
    
    print(f"  PROCESS_SCALE: {PROCESS_SCALE}")
    print(f"  DETECT_SKIP: {DETECT_SKIP_FRAMES}")
    print(f"  FPS_TARGET: {FPS_TARGET}")
    print("="*50)

def main():
    os.makedirs(MODEL_PATH, exist_ok=True)
    
    print("AI换脸应用启动中...")
    
    # 自动检测硬件并优化配置
    auto_optimize_hardware()
    
    init_models()
    
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    
    time.sleep(2)
    
    print("\u670d\u52a1\u5df2\u542f\u52a8! \u6b63\u5728\u6253\u5f00\u6d4f\u89c8\u5668...")
    
    webbrowser.open('http://localhost:5000')
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass

if __name__ == '__main__':
    main()
