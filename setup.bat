@echo off
echo التحقق من تثبيت Node.js...

REM التحقق من Node.js
node --version
if errorlevel 1 (
    echo Node.js غير مثبت. يرجى تثبيت Node.js من https://nodejs.org/
    pause
    exit /b 1
)

REM تثبيت المتطلبات
echo تثبيت المتطلبات...
npm install
npm install axios --save
echo اكتمل الإعداد بنجاح!
pause
