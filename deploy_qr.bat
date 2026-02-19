@echo off
cd /d D:\programming\QR-viewer-simple
git add .
set /p msg="提交信息: "
git commit -m "%msg%"
git push
echo.
copy /y "D:\programming\QR-viewer-simple\qr-visualization.html" "D:\blog\qr\qr-visualization.html"
cd /d D:\blog
git submodule update --remote qr
git commit -m "update qr"
git push
echo.
echo 完成！QR 工具已同步到博客。
pause
