@echo off
chcp 65001 >nul
echo === ساخت نصب‌کننده ورکشاپ پرو ===
where node >nul 2>nul || (echo Node.js نصب نیست. از https://nodejs.org نسخه LTS را نصب کنید و دوباره اجرا کنید. & pause & exit /b 1)
call npm install || (echo خطا در npm install & pause & exit /b 1)
call npm run dist || (echo خطا در ساخت & pause & exit /b 1)
echo.
echo تمام شد. فایل نصب در پوشه dist است.
start "" dist
pause
