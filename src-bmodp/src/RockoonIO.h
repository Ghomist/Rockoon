#include <BML/ExecuteBB.h>
#include <BML/Guids/Visuals.h>
#include <BML/IMod.h>
#include <BML/ScriptHelper.h>
#include <BML/Guids.h>

#define FLAG(f) "--rockoon:" #f "="

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
	/*
	virtual void OnPostStartMenu() override;
	virtual void OnLoadObject(CKSTRING filename, BOOL isMap, CKSTRING masterName,
		CK_CLASSID filterClass, BOOL addtoscene, BOOL reuseMeshes, BOOL reuseMaterials,
		BOOL dynamic, XObjectArray* objArray, CKObject* masterObj) override;
	*/
	void OnLoadScript(const char* filename, CKBehavior* script);

private:
	inline static const std::string F_MOTD = FLAG(motd);
	inline static const std::string F_STARTUP = FLAG(startup);

	void LoadMap(const std::string& path);
	std::string GetRockoonArg(std::string flag);

	CKBehavior* m_ExitStart = nullptr;
	CKParameter* m_LoadCustom = nullptr;
	CKParameter* m_MapFile = nullptr;
	CKParameter* m_LevelRow = nullptr;
	CKDataArray* m_CurLevel = nullptr;
};

extern "C" __declspec(dllexport) IMod* BMLEntry(IBML* bml) {
	return new RockoonIO(bml);
}
extern "C" __declspec(dllexport) void BMLExit(IMod* mod) { delete mod; }
