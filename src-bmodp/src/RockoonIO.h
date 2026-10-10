#include <BML/ExecuteBB.h>
#include <BML/Guids/Visuals.h>
#include <BML/IMod.h>
#include <BML/ScriptHelper.h>
#include <BML/Guids.h>

#include "FramePacer.h"
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
	virtual void OnUnload() override;
	virtual void OnProcess() override;
	virtual void OnRender(CK_RENDER_FLAGS flags) override;
	virtual void OnPostStartMenu() override;
	virtual void OnPostExitLevel() override;

private:
	inline static const wchar_t* E_MOTD = L"ROCKOON_MOTD";
	inline static const wchar_t* E_STARTUP = L"ROCKOON_STARTUP";
	inline static const wchar_t* E_MAP_ONLY = L"ROCKOON_MAP_ONLY";
	inline static const wchar_t* E_LEVEL_SLOT = L"ROCKOON_LEVEL_SLOT";
	/** TAS 编辑器启动游戏时带上：初始的回放帧率（之后通过共享内存随时改，见 FramePacer） */
	inline static const wchar_t* E_TAS_FPS = L"ROCKOON_TAS_FPS";

	std::wstring GetRockoonEnv(const wchar_t* name);
	void KeepCursorVisibleWhenInactive();

	/** 游戏是 TAS 编辑器启动的（带了 ROCKOON_TAS_FPS）：摆在编辑器里、只看不碰 */
	bool m_EditorHosted = false;
	ULONGLONG m_LastCursorCheck = 0;
	/** 上一个逻辑帧之后有没有渲染过；连续几帧都没渲染 = BallanceTAS 在快进（跳过渲染） */
	bool m_RenderedSinceProcess = true;
	int m_UnrenderedFrames = 0;

	bml::MapLoader m_MapLoader;
	rockoon::FramePacer m_Pacer;
};

extern "C" __declspec(dllexport) IMod* BMLEntry(IBML* bml) {
	return new RockoonIO(bml);
}
extern "C" __declspec(dllexport) void BMLExit(IMod* mod) { delete mod; }
