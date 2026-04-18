#include <windows.h>

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
}

void RockoonIO::OnPostStartMenu()
{
	auto startup_map = this->GetRockoonEnv(this->E_STARTUP);
	if (!startup_map.empty())
	{
		m_BML->SendIngameMessage(FormatRockoonMessage("Starting: " + WString2String(startup_map)));
		m_BML->AddTimer(50.0f, [this, startup_map]()
			{
				m_MapLoader.Init(m_BML->GetCKContext());
				auto result = m_MapLoader.Load(startup_map);
				if (result.success)
					m_BML->SendIngameMessage(FormatRockoonMessage(result.message));
				else
					m_BML->SendIngameMessage(FormatRockoonMessage("Failed: " + result.message));
			});
	}
}

void RockoonIO::OnPostExitLevel()
{
	PostQuitMessage(0);
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
