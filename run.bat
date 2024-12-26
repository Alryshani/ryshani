@echo off
echo تشغيل تطبيق أسعار العملات...

REM التحقق من وجود node_modules
if not exist node_modules (
    echo المتطلبات غير مثبتة. يرجى تشغيل setup.bat أولاً
    pause
    exit /b 1
)

REM تشغيل التطبيق
node server.js
pause
pause
