@echo off
echo === 更新 NA 默写卷 ===
git -C "D:/math/NA" add .
set /p msg="NA 提交信息（直接回车跳过）: "
if "%msg%"=="" goto skip_na
git -C "D:/math/NA" commit -m "%msg%"
git -C "D:/math/NA" push
:skip_na

echo.
echo === 更新 QR 工具 ===
git -C "D:/programming/QR-viewer-simple" add .
set /p msg2="QR 提交信息（直接回车跳过）: "
if "%msg2%"=="" goto skip_qr
git -C "D:/programming/QR-viewer-simple" commit -m "%msg2%"
git -C "D:/programming/QR-viewer-simple" push
copy /y "D:/programming/QR-viewer-simple/qr-visualization.html" "D:/blog/qr/qr-visualization.html" >nul
:skip_qr

echo.
echo === 同步博客 ===
git -C "D:/blog" submodule update --remote na
git -C "D:/blog" add .
git -C "D:/blog" commit -m "sync"
git -C "D:/blog" push

echo.
echo 全部完成！
pause
