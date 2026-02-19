@echo off
cd /d D:\math\NA
git add .
set /p msg="提交信息: "
git commit -m "%msg%"
git push
echo.
cd /d D:\blog
git submodule update --remote na
git add na
git commit -m "update na submodule"
git push
echo.
echo 完成！NA 内容已同步到博客。
pause
