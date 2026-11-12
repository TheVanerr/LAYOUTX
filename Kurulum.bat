@echo off
chcp 65001 >nul
rem Layout Cizim Motoru kurulumu: masaustu + Baslat menusu simgesi ve layoutx:// baslatma baglantisi.
rem Yonetici izni gerekmez (yalniz bu kullanici). Kaldirmak icin: python layout_app.py --uninstall
cd /d "%~dp0"
python layout_app.py --install
if errorlevel 1 (
  echo.
  echo Kurulum basarisiz. Python kurulu ve PATH'te mi?
) else (
  echo.
  echo Tamam. Masaustundeki "Layout Cizim Motoru" simgesiyle ya da index.html ile baslatabilirsiniz.
)
pause
