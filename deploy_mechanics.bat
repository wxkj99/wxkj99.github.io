@echo off
cd /d D:\math\Mechanics
git add .
set /p msg="提交信息: "
git commit -m "%msg%"
git push
echo.
cd /d D:\blog
git submodule update --remote mechanics
git add mechanics
git commit -m "update mechanics submodule"
git push
echo.
echo 完成！四大力学内容已同步到博客。
pause
