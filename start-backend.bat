@echo off
chcp 65001 >nul
REM ============================================================
REM  家校共育系统 · 本地后端启动脚本
REM  双击即可启动，浏览器/小程序访问 http://localhost:3123
REM  数据库走 .env.local 里的 Neon 生产库（与线上同一份数据）
REM ============================================================
cd /d "%~dp0"

echo [1/2] 检查依赖...
if not exist "node_modules" (
  echo     首次运行，正在安装依赖，请稍候...
  call npm install
)

echo [2/2] 启动后端服务...
echo.
echo      服务地址: http://localhost:3123
echo      停止服务: 在本窗口按 Ctrl + C
echo.
echo      提示: 微信开发者工具请勾选
echo            详情 - 本地设置 - 不校验合法域名
echo.
call npm start
pause
