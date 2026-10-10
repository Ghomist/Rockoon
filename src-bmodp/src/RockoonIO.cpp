#include <windows.h>
#include <string>

#include "RockoonIO.h"

inline static const char* FormatRockoonMessage(std::string str) {
	return ("\x1b[32m[Rockoon] " + str + "\x1b[0m").c_str();
}

static std::string WString2String(const std::wstring& ws) {
	if (ws.empty()) return "";
	int len = WideCharToMultiByte(CP_ACP, 0, ws.c_str(), (int)ws.size(), nullptr, 0, nullptr, nullptr);
	std::string result(len, '\0');
	WideCharToMultiByte(CP_ACP, 0, ws.c_str(), (int)ws.size(), result.data(), len, nullptr, nullptr);
	return result;
}

void RockoonIO::OnLoad()
{
	auto motd = this->GetRockoonEnv(this->E_MOTD);
	if (!motd.empty())
	{
		m_BML->SendIngameMessage(FormatRockoonMessage(WString2String(motd)));
	}

	// 只有 TAS 编辑器启动的游戏才限速；普通启动完全不受影响
	auto tas_fps = this->GetRockoonEnv(this->E_TAS_FPS);
	if (!tas_fps.empty())
	{
		m_EditorHosted = true;
		float fps = 0.0f;
		try { fps = std::stof(tas_fps); }
		catch (...) { fps = 0.0f; }
		if (m_Pacer.Init(fps))
			GetLogger()->Info("TAS frame pacer enabled (initial %.3f fps)", fps);
		else
			GetLogger()->Error("Failed to create the TAS frame limit channel (error %lu)", GetLastError());
	}
}

void RockoonIO::OnUnload()
{
	m_Pacer.Shutdown();
}

void RockoonIO::OnProcess()
{
	if (m_EditorHosted)
		KeepCursorVisibleWhenInactive();

	if (!m_Pacer.Active())
		return;

	// 节奏完全由 FramePacer 掌握：Virtools 自己的限速（BML+ 的 SetMaxFrameRate、垂直同步）
	// 只会在它之上再压一道，让高倍速跑不上去。BML+ 改配置时会重设，所以每帧都检查一下。
	if (auto* tm = m_BML->GetTimeManager())
	{
		if ((tm->GetLimitOptions() & CK_FRAMERATE_MASK) != CK_FRAMERATE_FREE)
			tm->ChangeLimitOptions(CK_FRAMERATE_FREE);
	}

	// BallanceTAS 的 SkipRenderUntilFrame（「从第 N 帧播放」）期间不渲染：这时不限速，
	// 一路快进到目标帧；一恢复渲染就回到目标帧率。连续 2 帧没渲染才算，免得偶尔丢一帧就放开。
	m_UnrenderedFrames = m_RenderedSinceProcess ? 0 : m_UnrenderedFrames + 1;
	m_RenderedSinceProcess = false;
	m_Pacer.Wait(m_UnrenderedFrames >= 2);
}

void RockoonIO::OnRender(CK_RENDER_FLAGS flags)
{
	m_RenderedSinceProcess = true;
}

void RockoonIO::OnPostStartMenu()
{
	auto startup_map = this->GetRockoonEnv(this->E_STARTUP);
	if (!startup_map.empty())
	{
		// 占位关卡：0 或非法值交给 MapLoader 自行随机 1~13 关
		auto slot_env = this->GetRockoonEnv(this->E_LEVEL_SLOT);
		int level_slot = 0;
		if (!slot_env.empty())
		{
			try { level_slot = std::stoi(slot_env); }
			catch (...) { level_slot = 0; }
		}

		m_BML->SendIngameMessage(FormatRockoonMessage("Starting: " + WString2String(startup_map)));
		m_BML->AddTimer(50.0f, [this, startup_map, level_slot]()
			{
				m_MapLoader.Init(m_BML->GetCKContext());
				auto result = m_MapLoader.Load(startup_map, level_slot);
				if (result.success)
					m_BML->SendIngameMessage(FormatRockoonMessage(result.message));
				else
					m_BML->SendIngameMessage(FormatRockoonMessage("Failed: " + result.message));
			});
	}
}

void RockoonIO::OnPostExitLevel()
{
	auto startup_map = this->GetRockoonEnv(this->E_STARTUP);
	auto map_only = this->GetRockoonEnv(this->E_MAP_ONLY);
	if (!startup_map.empty() && map_only == L"1")
		PostQuitMessage(0);
}

/**
 * 游戏在前台时会 ShowCursor(FALSE) 把指针藏起来，失去前台后却不还原。平时无所谓（指针一离开
 * 游戏窗口就归别的程序管），但 TAS 编辑器把游戏窗口的 owner 设成了编辑器 —— 跨进程 owner
 * 会让两边线程**共用输入队列**，而 ShowCursor 的计数就在队列上，于是指针在整个编辑器里都
 * 不见了，速度之类的控件根本点不到（实测：GetCursorInfo 在编辑器上 flags=0、hCursor=0，
 * 其它程序上正常）。
 *
 * 所以编辑器托管时：游戏**不在前台**就把本线程的显示计数抬回 0（恰好 0，不多抬）。游戏在
 * 前台（编辑器里点了「操作游戏」）时不管，游戏照常藏指针。约每 50ms 查一次。
 */
void RockoonIO::KeepCursorVisibleWhenInactive()
{
	const ULONGLONG now = GetTickCount64();
	if (now - m_LastCursorCheck < 50)
		return;
	m_LastCursorCheck = now;

	DWORD fg_pid = 0;
	if (HWND fg = GetForegroundWindow())
		GetWindowThreadProcessId(fg, &fg_pid);
	if (fg_pid == GetCurrentProcessId())
		return;

	// ShowCursor 返回新的计数：先 +1 探一下，原本 >= 0 就撤回，原本 < 0 就一路抬到 0
	int count = ShowCursor(TRUE);
	if (count > 0)
		ShowCursor(FALSE);
	else
		while (count < 0)
			count = ShowCursor(TRUE);
}

std::wstring RockoonIO::GetRockoonEnv(const wchar_t* name)
{
	auto len = GetEnvironmentVariableW(name, nullptr, 0);
	if (len == 0)
		return L"";

	std::wstring value(len - 1, L'\0');
	GetEnvironmentVariableW(name, value.data(), len);
	return value;
}
