/*
 * BallanceLauncher.exe —— 在 Wine 里拉起游戏，盯到游戏窗口出来为止。
 *
 * 用法：wine BallanceLauncher.exe Player.exe [参数...]
 *   拉起后面的命令行（工作目录、环境变量都继承），等它出现主窗口：
 *   - 出窗口了：退出码 0，游戏照常跑（本程序不再管它）；
 *   - 游戏自己退了，或者 30 秒还没有窗口：结束它重来，最多 8 次，都不行退出码 1。
 *     （出事的尝试一般 2 秒内就结束了，多试几次代价很小）
 *   游戏的命令行用程序的完整路径：Wine 把它当成进程标题，启动器和 Rockoon 靠它认出游戏在跑。
 *
 * 为什么要有它：Apple 芯片上 Wine 的 32 位程序靠 Rosetta 2 跑，32 → 64 位的模式切换偶尔不生效
 * （远跳转之后 CPU 还按 32 位解码 64 位代码），Player 初始化 Direct3D 时就会撞上访问违例：
 * 要么报 “No render driver found” 直接退出，要么主线程没了、进程却吊着不退。
 * 这是 Rosetta / Wine 层面的问题，游戏和 Mod 改不了；重启一次通常就好了。
 *
 * 构建：zig cc -target x86-windows-gnu -Os -s -o BallanceLauncher.exe launch.c -luser32 -lshell32
 */
#include <windows.h>
#include <stdio.h>

#define ATTEMPTS 8
#define WINDOW_TIMEOUT_MS 30000
#define POLL_MS 250
/* 窗口出来后再看这么久，确认游戏没有紧接着退出：Player 先建窗口再初始化 Direct3D，
 * 出事的话一般在窗口出现后 1~2 秒内退出 */
#define SETTLE_MS 5000

static DWORD target_pid;
static HWND window_found;

static BOOL CALLBACK find_window(HWND hwnd, LPARAM unused) {
    DWORD pid = 0;
    RECT rect;
    (void)unused;
    GetWindowThreadProcessId(hwnd, &pid);
    if (pid != target_pid || !IsWindowVisible(hwnd) || GetWindow(hwnd, GW_OWNER))
        return TRUE;
    /* 游戏窗口至少 640×480；Player 的启动画面（472×219）和 Wine 的辅助窗口都比这小 ——
     * 启动画面亮着的时候 Direct3D 还没初始化，不能算数 */
    if (GetWindowRect(hwnd, &rect) && rect.right - rect.left >= 640 && rect.bottom - rect.top >= 400) {
        window_found = hwnd;
        return FALSE;
    }
    return TRUE;
}

/* 游戏窗口还在、而且主线程还在处理消息（卡死或主线程没了的进程会超时） */
static BOOL window_alive(HWND hwnd) {
    DWORD_PTR result;
    return IsWindow(hwnd) && IsWindowVisible(hwnd) &&
           SendMessageTimeoutW(hwnd, WM_NULL, 0, 0, SMTO_ABORTIFHUNG, 3000, &result);
}

/* 跳过 argv[0]（保留后面原样的引号与空格） */
static WCHAR *skip_first_arg(WCHAR *cmdline) {
    BOOL quoted = FALSE;
    while (*cmdline && (quoted || (*cmdline != L' ' && *cmdline != L'\t'))) {
        if (*cmdline == L'"')
            quoted = !quoted;
        cmdline++;
    }
    while (*cmdline == L' ' || *cmdline == L'\t')
        cmdline++;
    return cmdline;
}

/*
 * 要拉起的程序的完整路径。相对路径按当前目录解析：CreateProcess 自己找的话，
 * 环境里有 NoDefaultCurrentDirectoryInExePath 时不会搜当前目录（Wine 会把 Unix 环境变量带进来）。
 */
static BOOL resolve_program(const WCHAR *args, WCHAR *out, DWORD size) {
    int argc = 0;
    WCHAR **argv = CommandLineToArgvW(args, &argc);
    BOOL ok = FALSE;
    if (argv && argc > 0) {
        const WCHAR *prog = argv[0];
        BOOL absolute = (prog[0] && prog[1] == L':') || prog[0] == L'\\';
        if (absolute)
            ok = wcslen(prog) < size && lstrcpyW(out, prog) != NULL;
        else
            ok = GetFullPathNameW(prog, size, out, NULL) > 0;
    }
    LocalFree(argv);
    return ok;
}

/* 0 = 窗口出来了；1 = 游戏退了；2 = 超时没窗口（或窗口出来后卡住了） */
static int wait_for_window(HANDLE process) {
    DWORD waited = 0;
    while (waited < WINDOW_TIMEOUT_MS) {
        if (WaitForSingleObject(process, POLL_MS) == WAIT_OBJECT_0)
            return 1;
        waited += POLL_MS;
        window_found = NULL;
        EnumWindows(find_window, 0);
        if (window_found) {
            if (WaitForSingleObject(process, SETTLE_MS) == WAIT_OBJECT_0)
                return 1;
            return window_alive(window_found) ? 0 : 2;
        }
    }
    return 2;
}

int main(void) {
    WCHAR *args = skip_first_arg(GetCommandLineW());
    WCHAR program[MAX_PATH];
    WCHAR *game_cmdline;
    size_t len;
    int attempt;

    if (!*args || !resolve_program(args, program, MAX_PATH)) {
        fprintf(stderr, "usage: BallanceLauncher.exe <program> [args...]\n");
        return 2;
    }
    /* "<完整路径>" + 原来的其余参数 */
    args = skip_first_arg(args);
    len = wcslen(program) + wcslen(args) + 4;
    game_cmdline = HeapAlloc(GetProcessHeap(), 0, len * sizeof(WCHAR));
    swprintf(game_cmdline, len, L"\"%ls\"%ls%ls", program, *args ? L" " : L"", args);
    len = wcslen(game_cmdline);

    for (attempt = 1; attempt <= ATTEMPTS; attempt++) {
        STARTUPINFOW si = {sizeof(si)};
        PROCESS_INFORMATION pi;
        /* CreateProcessW 可能改写命令行缓冲区，每次给一份新的 */
        WCHAR *cmdline = HeapAlloc(GetProcessHeap(), 0, (len + 1) * sizeof(WCHAR));
        int result;

        memcpy(cmdline, game_cmdline, (len + 1) * sizeof(WCHAR));
        if (!CreateProcessW(program, cmdline, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
            fprintf(stderr, "launcher: CreateProcess failed (%lu)\n", GetLastError());
            HeapFree(GetProcessHeap(), 0, cmdline);
            return 1;
        }
        HeapFree(GetProcessHeap(), 0, cmdline);
        CloseHandle(pi.hThread);
        target_pid = pi.dwProcessId;

        result = wait_for_window(pi.hProcess);
        if (result == 0) {
            fprintf(stderr, "launcher: game window up (attempt %d, pid %04lx)\n", attempt, target_pid);
            CloseHandle(pi.hProcess);
            return 0;
        }
        fprintf(stderr, "launcher: attempt %d %s, retrying\n", attempt,
                result == 1 ? "exited before the game came up" : "showed no live window in time");
        TerminateProcess(pi.hProcess, 1);
        WaitForSingleObject(pi.hProcess, 5000);
        CloseHandle(pi.hProcess);
    }
    fprintf(stderr, "launcher: giving up after %d attempts\n", ATTEMPTS);
    return 1;
}
