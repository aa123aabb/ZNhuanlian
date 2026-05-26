/**
 * 激活码验证模块
 * 机器码绑定 + 本地离线验证 - 2小时试用 + 倒计时
 * 支持时限激活码（1个月/3个月/永久）
 */

const Activation = {
    // 状态
    machineCode: '',
    activated: false,
    trialSeconds: 0,
    remainingDays: 0,
    countdownTimer: null,
    statusCheckTimer: null,
    
    // 从后端获取激活状态
    async getStatus() {
        try {
            const response = await fetch('/get_status');
            const data = await response.json();
            if (data.success) {
                this.machineCode = data.machine_code;
                this.activated = data.activated;
                this.trialSeconds = data.trial_seconds;
                this.remainingDays = data.remaining_days || 0;
            }
            return data;
        } catch (e) {
            return { success: false, error: e.message };
        }
    },
    
    // 验证激活码
    async activate(code) {
        try {
            const response = await fetch('/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code })
            });
            const data = await response.json();
            if (data.success) {
                this.activated = true;
                this.remainingDays = data.remaining_days || 0;
            }
            return data;
        } catch (e) {
            return { success: false, error: e.message };
        }
    },
    
    // 格式化试用倒计时
    formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h}小时${m.toString().padStart(2, '0')}分${s.toString().padStart(2, '0')}秒`;
    },
    
    // 格式化剩余天数
    formatDays(days) {
        if (days >= 99999) return '永久';
        if (days >= 365) return `${Math.floor(days/365)}年${days%365}天`;
        return `${days}天`;
    },
    
    // 显示已激活状态栏
    showActivatedStatus() {
        // 更新导航栏徽章
        const badge = document.getElementById('activationStatusBadge');
        if (badge) {
            badge.classList.remove('hidden');
            if (this.remainingDays >= 99999) {
                badge.innerHTML = '✓ 永久激活';
                badge.style.cssText = 'background:#065f46;color:#6ee7b7;';
            } else if (this.remainingDays > 30) {
                badge.innerHTML = `✓ 剩余 ${this.formatDays(this.remainingDays)}`;
                badge.style.cssText = 'background:#065f46;color:#6ee7b7;';
            } else if (this.remainingDays > 7) {
                badge.innerHTML = `✓ 剩余 ${this.remainingDays}天`;
                badge.style.cssText = 'background:#065f46;color:#6ee7b7;';
            } else if (this.remainingDays > 0) {
                badge.innerHTML = `⚠️ 剩余 ${this.remainingDays}天`;
                badge.style.cssText = 'background:#78350f;color:#fbbf24;';
            } else {
                badge.innerHTML = '❌ 已过期';
                badge.style.cssText = 'background:#7f1d1d;color:#fca5a5;';
            }
        }
        
        // 创建浮动状态栏（短暂显示）
        let statusBar = document.getElementById('activationStatusBar');
        if (!statusBar) {
            statusBar = document.createElement('div');
            statusBar.id = 'activationStatusBar';
            statusBar.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: rgba(16, 185, 129, 0.95);
                color: white;
                padding: 10px 18px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 500;
                z-index: 9000;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                gap: 8px;
            `;
            document.body.appendChild(statusBar);
        }
        
        if (this.remainingDays >= 99999) {
            statusBar.innerHTML = '✓ 永久激活';
            statusBar.style.background = 'rgba(16, 185, 129, 0.95)';
        } else if (this.remainingDays > 30) {
            statusBar.innerHTML = `✓ 已激活 | 剩余 ${this.formatDays(this.remainingDays)}`;
            statusBar.style.background = 'rgba(16, 185, 129, 0.95)';
        } else if (this.remainingDays > 7) {
            statusBar.innerHTML = `✓ 已激活 | 剩余 ${this.remainingDays}天`;
            statusBar.style.background = 'rgba(16, 185, 129, 0.95)';
        } else if (this.remainingDays > 0) {
            statusBar.innerHTML = `⚠️ 即将到期 | 剩余 ${this.remainingDays}天`;
            statusBar.style.background = 'rgba(245, 158, 11, 0.95)';
        } else {
            statusBar.innerHTML = '❌ 已过期，请续期';
            statusBar.style.background = 'rgba(239, 68, 68, 0.95)';
        }
        
        // 永久激活或剩余时间充足时，5秒后淡出浮动栏
        if (this.remainingDays >= 30) {
            setTimeout(() => {
                statusBar.style.opacity = '0';
                statusBar.style.transition = 'opacity 0.5s';
                setTimeout(() => statusBar.remove(), 500);
            }, 5000);
        }
    },
    
    // 启动试用倒计时
    startCountdown() {
        const trialInfo = document.getElementById('trialInfo');
        if (!trialInfo) return;
        
        const updateDisplay = () => {
            if (this.trialSeconds > 0) {
                trialInfo.innerHTML = `<span style="color:#f59e0b;font-size:15px;">⏱️ 试用剩余: ${this.formatTime(this.trialSeconds)}</span>`;
                this.trialSeconds--;
            } else {
                trialInfo.innerHTML = `<span style="color:#f87171;font-size:15px;">❌ 试用期已结束，请输入激活码</span>`;
                if (this.countdownTimer) {
                    clearInterval(this.countdownTimer);
                }
                // 禁用继续试用按钮
                const skipBtn = document.getElementById('skipBtn');
                if (skipBtn) {
                    skipBtn.disabled = true;
                    skipBtn.style.opacity = '0.5';
                    skipBtn.style.cursor = 'not-allowed';
                    skipBtn.textContent = '试用已结束';
                }
            }
        };
        
        updateDisplay();
        this.countdownTimer = setInterval(updateDisplay, 1000);
    },
    
    // 定期检查激活状态（防止用户修改系统时间）
    startStatusCheck() {
        this.statusCheckTimer = setInterval(async () => {
            await this.getStatus();
            if (!this.activated && this.trialSeconds <= 0) {
                // 试用已过期，强制显示激活层
                const overlay = document.getElementById('activationOverlay');
                if (overlay) {
                    overlay.style.display = 'flex';
                    overlay.style.visibility = 'visible';
                    overlay.style.opacity = '1';
                }
            }
        }, 30000); // 每30秒检查一次
    },
    
    // 初始化激活界面
    async init() {
        const overlay = document.getElementById('activationOverlay');
        if (!overlay) return;
        
        // 获取激活状态
        await this.getStatus();
        
        const machineCodeDisplay = document.getElementById('machineCodeDisplay');
        const trialInfo = document.getElementById('trialInfo');
        const codeInput = document.getElementById('activationCode');
        const activateBtn = document.getElementById('activateBtn');
        const errorText = document.getElementById('activationError');
        const getMachineCodeBtn = document.getElementById('getMachineCodeBtn');
        
        // 显示机器码
        if (machineCodeDisplay) {
            machineCodeDisplay.textContent = this.machineCode;
        }
        
        // 已激活且未过期
        if (this.activated && this.remainingDays > 0) {
            overlay.style.display = 'none';
            overlay.style.visibility = 'hidden';
            this.showActivatedStatus();
            this.startStatusCheck();
            return;
        }
        
        // 未激活或已过期
        overlay.style.display = 'flex';
        overlay.style.visibility = 'visible';
        
        // 显示试用状态并启动倒计时
        if (trialInfo) {
            trialInfo.style.display = 'block';
            this.startCountdown();
        }
        
        // 启动定期状态检查
        this.startStatusCheck();
        
        // 如果在试用期内，添加“继续试用”按钮
        if (this.trialSeconds > 0) {
            const btnContainer = activateBtn.parentElement;
            if (btnContainer && !document.getElementById('skipBtn')) {
                const skipBtn = document.createElement('button');
                skipBtn.id = 'skipBtn';
                skipBtn.textContent = '继续试用（带水印）';
                skipBtn.style.cssText = 'margin-left:10px;padding:10px 16px;background:#4b5563;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;';
                skipBtn.onclick = () => {
                    overlay.style.opacity = '0';
                    overlay.style.transition = 'opacity 0.3s';
                    setTimeout(() => {
                        overlay.style.display = 'none';
                    }, 300);
                };
                btnContainer.appendChild(skipBtn);
            }
        }
        
        // 复制机器码按钮
        if (getMachineCodeBtn) {
            getMachineCodeBtn.onclick = () => {
                navigator.clipboard.writeText(this.machineCode).then(() => {
                    getMachineCodeBtn.textContent = '已复制!';
                    getMachineCodeBtn.style.background = '#10b981';
                    setTimeout(() => {
                        getMachineCodeBtn.textContent = '复制机器码';
                        getMachineCodeBtn.style.background = '#6366f1';
                    }, 2000);
                }).catch(() => {
                    const textarea = document.createElement('textarea');
                    textarea.value = this.machineCode;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    getMachineCodeBtn.textContent = '已复制!';
                    getMachineCodeBtn.style.background = '#10b981';
                    setTimeout(() => {
                        getMachineCodeBtn.textContent = '复制机器码';
                        getMachineCodeBtn.style.background = '#6366f1';
                    }, 2000);
                });
            };
        }
        
        // 激活按钮点击事件
        if (activateBtn) {
            activateBtn.onclick = async () => {
                const code = codeInput.value.trim();
                if (!code) {
                    errorText.style.color = '#f87171';
                    errorText.style.display = 'block';
                    errorText.textContent = '请输入激活码';
                    return;
                }
                
                activateBtn.disabled = true;
                activateBtn.textContent = '验证中...';
                
                const result = await this.activate(code);
                
                if (result.success) {
                    if (this.countdownTimer) {
                        clearInterval(this.countdownTimer);
                    }
                    
                    errorText.style.color = '#10b981';
                    errorText.style.display = 'block';
                    const daysInfo = this.remainingDays >= 99999 ? '永久激活' : `有效期 ${this.formatDays(this.remainingDays)}`;
                    errorText.textContent = `✓ 激活成功！${daysInfo}`;
                    
                    setTimeout(() => {
                        overlay.style.opacity = '0';
                        overlay.style.transition = 'opacity 0.3s';
                        setTimeout(() => {
                            overlay.style.display = 'none';
                            overlay.style.visibility = 'hidden';
                            this.showActivatedStatus();
                        }, 300);
                    }, 1500);
                } else {
                    activateBtn.disabled = false;
                    activateBtn.textContent = '激活';
                    
                    errorText.style.color = '#f87171';
                    errorText.style.display = 'block';
                    errorText.textContent = result.error || '激活码无效';
                    
                    codeInput.style.borderColor = '#f87171';
                    codeInput.style.animation = 'shake 0.5s';
                    setTimeout(() => {
                        codeInput.style.animation = '';
                    }, 500);
                }
            };
        }
        
        // 输入框事件
        if (codeInput) {
            codeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    activateBtn.click();
                }
            });
            
            codeInput.addEventListener('input', () => {
                errorText.style.display = 'none';
                codeInput.style.borderColor = '#4b5563';
            });
        }
    },
    
    // 销毁清理
    destroy() {
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
        }
        if (this.statusCheckTimer) {
            clearInterval(this.statusCheckTimer);
        }
    }
};

// 添加抖动动画样式
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
        20%, 40%, 60%, 80% { transform: translateX(5px); }
    }
`;
document.head.appendChild(shakeStyle);

// 等待免责声明关闭后初始化
function waitForDisclaimerAndInit() {
    const disclaimerOverlay = document.getElementById('disclaimerOverlay');
    const agreeBtn = document.getElementById('disclaimerAgreeBtn');
    
    if (disclaimerOverlay && agreeBtn && disclaimerOverlay.style.display !== 'none') {
        // 免责声明还在显示，等待用户点击同意
        agreeBtn.addEventListener('click', () => {
            // 等待免责弹窗隐藏后再初始化激活界面
            setTimeout(() => {
                Activation.init();
            }, 400);
        }, { once: true });
    } else {
        // 免责声明已关闭或不存在，直接初始化
        Activation.init();
    }
}

// 页面加载后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForDisclaimerAndInit);
} else {
    waitForDisclaimerAndInit();
}
