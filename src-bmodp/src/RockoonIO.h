#include <filesystem>
#include <vector>

#include <BML/ExecuteBB.h>
#include <BML/Guids/Visuals.h>
#include <BML/IMod.h>
#include <BML/ScriptHelper.h>
#include <BML/Guids.h>

#include "MapLoader.h"

#define ENV_PREFIX "ROCKOON_"

class RockoonIO final : public IMod {
public:
	explicit RockoonIO(IBML* bml) : IMod(bml) {}
	const char* GetID() override { return "RockoonIO"; }
	const char* GetVersion() override { return "1.0.0"; }
	const char* GetName() override { return "RockoonIO Mod"; }
	const char* GetAuthor() override { return "Ghomist"; }
	const char* GetDescription() override { return "Rockoon specific mod"; }
	DECLARE_BML_VERSION;

	virtual void OnLoad() override;
	virtual void OnPostStartMenu() override;
	virtual void OnPostExitLevel() override;
	virtual void OnStartLevel() override;

private:
	inline static const wchar_t* E_MOTD = L"ROCKOON_MOTD";
	inline static const wchar_t* E_STARTUP = L"ROCKOON_STARTUP";
	inline static const wchar_t* E_SCREENSHOT_DIR = L"ROCKOON_SCREENSHOT_DIR";

	std::wstring GetRockoonEnv(const wchar_t* name);
	void DoScreenshot();

	bml::MapLoader m_MapLoader;
	std::vector<std::filesystem::path> m_SavedScreenshots;
};

extern "C" __declspec(dllexport) IMod* BMLEntry(IBML* bml) {
	return new RockoonIO(bml);
}
extern "C" __declspec(dllexport) void BMLExit(IMod* mod) { delete mod; }
