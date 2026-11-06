@echo off
rem Layout Cizim Motoru - tarayicida http://127.0.0.1:8765 acilir. Kapatmak icin bu pencereyi kapatin.
cd /d "%~dp0"
python layout_app.py
if errorlevel 1 pause
