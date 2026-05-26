# -*- coding: utf-8 -*-
"""
AI换脸应用启动器 - 自动环境检测与依赖安装
用户只需双击运行，自动处理所有配置
"""

import os
import sys
import subprocess
import ctypes
import threading
import time

def is_admin():
    """检查是否有管理员权限"""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

def get_directx_version():
    """检测DirectX版本"""
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\DirectX")
        version, _ = winreg.QueryValueEx(key, "Version")
        winreg.CloseKey(key)
        return version
    except:
        return None

def check_gpu():
    """检测GPU信息"""
    gpu_info = {"name": "Unknown", "memory": 0, "directml_supported": False}
    try:
        # 尝试使用WMI获取GPU信息
        import subprocess
        result = subprocess.run(
            ['wmic', 'path', 'win32_VideoController', 'get', 'name,AdapterRAM'],
            capture_output=True, text=True, timeout=10
        )
        lines = result.stdout.strip().split('\n')
        for line in lines[1:]:
            if line.strip():
                parts = line.strip().split()
                if len(parts) >= 2:
                    try:
                        ram = int(parts[0])
                        gpu_info["memory"] = ram // (1024 * 1024)  # MB
                        gpu_info["name"] = ' '.join(parts[1:])
                    except:
                        gpu_info["name"] = line.strip()
                        
        # 检查是否支持DirectML（DX12兼容GPU）
        if "NVIDIA" in gpu_info["name"].upper() or "AMD" in gpu_info["name"].upper() or "INTEL" in gpu_info["name"].upper():
            gpu_info["directml_supported"] = True
    except Exception as e:
        print(f"[警告] GPU检测失败: {e}")
    
    return gpu_info

def install_vc_runtime():
    """安装Visual C++ Runtime（如果需要）"""
    vc_dlls = ['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll']
    system32 = os.path.join(os.environ.get('SystemRoot', 'C:\\Windows'), 'System32')
    
    missing = []
    for dll in vc_dlls:
        if not os.path.exists(os.path.join(system32, dll)):
            missing.append(dll)
    
    if missing:
        print(f"[环境] 缺少VC++运行时: {missing}")
        print("[环境] 请安装 Visual C++ Redistributable 2015-2022")
        print("下载地址: https://aka.ms/vs/17/release/vc_redist.x64.exe")
        return False
    return True

def check_directml():
    """检查DirectML是否可用"""
    try:
        import onnxruntime as ort
        providers = ort.get_available_providers()
        if 'DmlExecutionProvider' in providers:
            print("[环境] DirectML GPU加速: 可用")
            return True
        else:
            print("[环境] DirectML GPU加速: 不可用，将使用CPU")
            return False
    except Exception as e:
        print(f"[环境] ONNX Runtime检测失败: {e}")
        return False

def optimize_for_hardware(gpu_info):
    """根据硬件配置优化参数"""
    # 根据显存大小调整参数
    vram = gpu_info.get("memory", 0)
    
    if vram >= 8000:
        # 8GB以上显存 - 高质量配置
        return {
            "PROCESS_SCALE": 0.8,
            "DETECT_SCALE": 0.25,
            "DETECT_SKIP_FRAMES": 4,
            "MIN_FRAME_INTERVAL": 0.02,
        }
    elif vram >= 4000:
        # 4-8GB显存 - 平衡配置
        return {
            "PROCESS_SCALE": 0.65,
            "DETECT_SCALE": 0.2,
            "DETECT_SKIP_FRAMES": 6,
            "MIN_FRAME_INTERVAL": 0.033,
        }
    else:
        # 4GB以下或CPU - 流畅优先配置
        return {
            "PROCESS_SCALE": 0.5,
            "DETECT_SCALE": 0.15,
            "DETECT_SKIP_FRAMES": 8,
            "MIN_FRAME_INTERVAL": 0.05,
        }

def write_hardware_config(config):
    """写入硬件优化配置"""
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.hardware_config')
    try:
        with open(config_path, 'w') as f:
            for key, value in config.items():
                f.write(f"{key}={value}\n")
        print(f"[配置] 硬件优化配置已保存")
    except:
        pass

def show_splash():
    """显示启动画面"""
    print("=" * 50)
    print("       AI换脸应用 - 启动中...")
    print("=" * 50)
    print()

def run_main():
    """运行主程序"""
    try:
        # 获取当前目录
        base_dir = os.path.dirname(os.path.abspath(__file__))
        main_path = os.path.join(base_dir, 'main.py')
        
        if os.path.exists(main_path):
            # 开发模式 - 直接运行main.py
            os.chdir(base_dir)
            exec(open(main_path, encoding='utf-8').read())
        else:
            # 打包模式 - 导入main模块
            import main
            main.main()
    except Exception as e:
        print(f"[错误] 启动失败: {e}")
        import traceback
        traceback.print_exc()
        input("按回车键退出...")

def main():
    """主入口"""
    show_splash()
    
    # 1. 环境检测
    print("[1/4] 检测系统环境...")
    
    # 检测GPU
    gpu_info = check_gpu()
    print(f"[环境] GPU: {gpu_info['name']}")
    if gpu_info['memory'] > 0:
        print(f"[环境] 显存: {gpu_info['memory']}MB")
    
    # 检测DirectX
    dx_version = get_directx_version()
    if dx_version:
        print(f"[环境] DirectX: {dx_version}")
    
    # 2. 依赖检查
    print()
    print("[2/4] 检查运行依赖...")
    
    # 检查VC++ Runtime
    vc_ok = install_vc_runtime()
    if not vc_ok:
        print("[警告] VC++运行时缺失，某些功能可能受限")
    
    # 检查DirectML
    directml_ok = check_directml()
    
    # 3. 硬件优化配置
    print()
    print("[3/4] 应用硬件优化配置...")
    
    config = optimize_for_hardware(gpu_info)
    write_hardware_config(config)
    
    print(f"[配置] 处理分辨率: {config['PROCESS_SCALE']}")
    print(f"[配置] 检测间隔: {config['DETECT_SKIP_FRAMES']}帧")
    print(f"[配置] 帧间隔: {config['MIN_FRAME_INTERVAL']*1000:.0f}ms")
    
    # 4. 启动主程序
    print()
    print("[4/4] 启动主程序...")
    print("=" * 50)
    print()
    
    # 设置环境变量
    os.environ['ORT_TENSORRT_ENGINE_CACHE_ENABLE'] = '1'
    os.environ['ORT_TENSORRT_FP16_ENABLE'] = '1'
    
    # 启动
    run_main()

if __name__ == '__main__':
    main()
