@echo off
chcp 65001 >nul
title 安装AI换脸应用依赖
echo.
echo ========================================
echo         安装必要依赖包
echo ========================================
echo.

:: 检查Python
echo [1/4] 检查Python环境...
python --version
if %errorlevel% neq 0 (
    echo ❌ Python未安装或未添加到PATH
    echo 请先安装Python并重启命令行
    pause
    exit /b 1
)

echo ✓ Python环境正常

:: 升级pip
echo.
echo [2/4] 升级pip...
python -m pip install --upgrade pip
if %errorlevel% neq 0 (
    echo ❌ pip升级失败
    pause
    exit /b 1
)

echo ✓ pip升级完成

:: 安装核心依赖
echo.
echo [3/4] 安装核心依赖包...
echo 这可能需要几分钟，请耐心等待...
echo.

pip install flask==2.3.3 flask-cors==4.0.0 flask-compress==1.14
pip install opencv-python==4.8.1.78 numpy==1.24.3
pip install onnxruntime==1.16.0 pillow==10.0.0 pyinstaller==5.13.0

if %errorlevel% neq 0 (
    echo ❌ 依赖安装失败
    pause
    exit /b 1
)

echo ✓ 核心依赖安装完成

:: 安装GPU支持（可选）
echo.
echo [4/4] 安装GPU加速支持（可选）...
echo 根据您的显卡选择安装：
echo.

set /p "gpu_type=请输入显卡类型 (1-NVIDIA, 2-AMD/Intel, 3-跳过): "

if "%gpu_type%"=="1" (
    echo 安装NVIDIA CUDA支持...
    pip install onnxruntime-gpu
    echo ✓ NVIDIA CUDA支持安装完成
) else if "%gpu_type%"=="2" (
    echo 安装AMD/Intel DirectML支持...
    pip install onnxruntime-directml
    echo ✓ DirectML支持安装完成
) else (
    echo ⚠️ 跳过GPU加速安装，使用CPU模式
)

echo.
echo ========================================
echo           安装完成！
echo ========================================
echo.
echo ✅ 所有依赖安装完成
echo.
echo [下一步操作]
echo 1. 运行 check_environment.py 验证环境
echo 2. 运行 build_release.bat 打包应用
echo 3. 测试打包后的可执行文件
echo.
echo 按任意键退出...
pause >nul