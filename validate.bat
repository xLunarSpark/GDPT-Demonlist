@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo === JavaScript Syntax Checks ===
where node >nul 2>&1
if errorlevel 1 (
  echo SKIP: Node.js not found on PATH; skipping JavaScript syntax checks.
) else (
  set js_failed=0
  for %%f in (
    "js\components\Spinner.js"
    "js\components\Btn.js"
    "js\util.js"
    "js\score.js"
    "js\routes.js"
    "js\components\List\LevelAuthors.js"
    "js\content.js"
    "js\main.js"
    "js\pages\Roulette.js"
    "js\pages\List.js"
    "js\pages\Leaderboard.js"
    "functions\_shared.js"
    "functions\auth\login.js"
    "functions\api\submissions.js"
    "functions\auth\callback.js"
    "functions\api\edit.js"
  ) do (
    node --check %%f >nul 2>&1
    if errorlevel 1 (
      echo ERROR in %%f:
      node --check %%f
      set js_failed=1
    )
  )
  if !js_failed! equ 0 (
    echo OK: All 16 JavaScript files are valid
  ) else (
    echo FAILED: JavaScript syntax errors detected
  )
)

echo.
echo === Python Compile Checks ===
set py_failed=0
for %%f in (
  "checkDuplicates.py"
  "cleanClans.py"
  "rebuild.py"
  "updatePointercrate.py"
) do (
  python -m py_compile %%f >nul 2>&1
  if errorlevel 1 (
    echo ERROR in %%f:
    python -m py_compile %%f
    set py_failed=1
  )
)
if %py_failed% equ 0 (
  echo OK: All 4 Python files compiled successfully
) else (
  echo FAILED: Python compilation errors detected
)
