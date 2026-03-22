@echo off
echo ==============================================
echo AMRUHTAM ERP - PUSHING LATEST CODE TO VERCEL
echo ==============================================
echo.
echo 1. Adding files to staging...
git add -A

echo.
echo 2. Committing changes...
git commit -m "Auto-fixing Vercel Build via Batch Script"

echo.
echo 3. Force pushing to GitHub to trigger Vercel deployment...
git push origin main:master --force
git push origin main --force

echo.
echo ==============================================
echo SUCCESS! Vercel should be building the new code now.
echo You can close this window.
echo ==============================================
pause
