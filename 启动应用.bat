@echo off
chcp 65001 >nul
title AI换脸应用 - 优化版

echo ========================================
echo            AI换脸应用启动器
echo ========================================
echo.

echo [信息] 应用版本: 优化加速版
echo [信息] 启动时间: %date% %time%
echo.

if exist "dist\AI_FaceSwap.exe" (
    echo ✓ 找到可执行文件
    echo ✓ 开始启动应用...
    echo.
    echo [提示] 应用启动后将自动打开浏览器
    echo [提示] 访问地址: http://localhost:5000
    echo.
    
    timeout /t 3 /nobreak >nul
    
    start "AI换脸应用" "dist\AI_FaceSwap.exe"
    
    echo ✅ 应用启动成功！
    echo.
    echo [操作指南]
    echo 1. 等待浏览器自动打开
    echo 2. 上传人脸图片
    echo 3. 开始换脸体验
    echo.
    echo 按任意键退出本窗口...
    pause >nul
) else (
    echo ❌ 错误: 未找到可执行文件
    echo.
    echo [解决方案]
    echo 1. 确保 dist/AI_FaceSwap.exe 文件存在
    echo 2. 或重新打包应用
    echo.
    pause
)