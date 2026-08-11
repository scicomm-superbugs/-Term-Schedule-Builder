@echo off
echo ===================================================
echo   Term Schedule Builder — Automatic Deployer
echo ===================================================
echo.

set GIT_PATH=C:\Users\amage\AppData\Local\PortableGit\cmd\git.exe
if not exist "%GIT_PATH%" (
    set GIT_PATH=git
)

echo [1/5] Initializing Git repository...
"%GIT_PATH%" init
"%GIT_PATH%" branch -M main

echo [2/5] Setting Git remote origin...
"%GIT_PATH%" remote remove origin 2>nul
"%GIT_PATH%" remote add origin https://github.com/scicomm-superbugs/-Term-Schedule-Builder.git

echo [3/5] Setting user identity...
"%GIT_PATH%" config user.name "Abdullah Amr Maged"
"%GIT_PATH%" config user.email "abdullah@aiu.edu.eg"

echo [4/5] Staging and committing files...
"%GIT_PATH%" add .
"%GIT_PATH%" commit -m "Term Schedule Builder - Full Features, Accounts, Activity Log & Visual Exporter"

echo [5/5] Pushing code to GitHub...
"%GIT_PATH%" push -u origin main --force
"%GIT_PATH%" push -u origin main:master --force
"%GIT_PATH%" push -u origin main:gh-pages --force

echo.
echo ===================================================
echo   Deployment Completed Successfully!
echo   Repo: https://github.com/scicomm-superbugs/-Term-Schedule-Builder
echo ===================================================
