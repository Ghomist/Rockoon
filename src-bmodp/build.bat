:: Make VS project
cmake . -B build -A Win32

:: Build
cmake --build build --config Release

:: Copy to tauri
xcopy /y build\Release\RockoonIO.bmodp ..\src-tauri\resources\builtin-mods\ /s /e
