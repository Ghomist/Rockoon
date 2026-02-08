#include <windows.h>
#include <locale>
#include <codecvt>

#include "RockoonIO.h"

inline static const char* FormatRockoonMessage(std::string str) {
	return ("\x1b[32m[Rockoon] " + str + "\x1b[0m").c_str();
}

static std::string WString2String(const std::wstring& wstr) {
	std::wstring_convert<std::codecvt_utf8_utf16<wchar_t>> converter;
	return converter.to_bytes(wstr);
}

static std::wstring String2WString(const std::string& mbs) {
	std::wstring_convert<std::codecvt_utf8_utf16<wchar_t>> converter;
	return converter.from_bytes(mbs);
}

static void SetParamString(CKParameter* param, const char* value)
{
	param->SetStringValue((CKSTRING)value);
}

template<typename T>
static void SetParamValue(CKParameter* param, T value)
{
	param->SetValue(&value, sizeof(T));
}

void RockoonIO::OnLoad()
{

	auto motd = this->GetRockoonArg(this->F_MOTD);
	if (!motd.empty())
	{
		m_BML->SendIngameMessage(FormatRockoonMessage(motd));
	}

	auto startup_map = this->GetRockoonArg(this->F_STARTUP);
	if (!startup_map.empty())
	{
		m_BML->SendIngameMessage(FormatRockoonMessage("Starting: " + startup_map));
		m_BML->AddTimer(5.0f, [this]()
			{
				//auto current_level = m_BML->GetArrayByName("CurrentLevel");
				LoadMap("C:\\Users\\ghomist\\Desktop\\Ballance\\ModLoader\\Maps\\000.nmo");
				m_BML->SendIngameMessage("111111111111111111");
			});
	}
}

void RockoonIO::OnLoadScript(const char* filename, CKBehavior* script) {
	/*if (!strcmp(script->GetName(), "Event_handler"))
		OnEditScript_Base_EventHandler(script);

	if (!strcmp(script->GetName(), "Menu_Init"))
		OnEditScript_Menu_MenuInit(script);

	if (!strcmp(script->GetName(), "Menu_Options"))
		OnEditScript_Menu_OptionsMenu(script);

	if (!strcmp(script->GetName(), "Gameplay_Ingame"))
		OnEditScript_Gameplay_Ingame(script);

	if (!strcmp(script->GetName(), "Gameplay_Energy"))
		OnEditScript_Gameplay_Energy(script);

	if (!strcmp(script->GetName(), "Gameplay_Events"))
		OnEditScript_Gameplay_Events(script);*/

	if (!strcmp(script->GetName(), "Levelinit_build"))
	{
		CKBehavior* loadLevel = ScriptHelper::FindFirstBB(script, "Load LevelXX");
		CKBehaviorLink* inLink = ScriptHelper::FindNextLink(loadLevel, loadLevel->GetInput(0));
		CKBehavior* op = ScriptHelper::FindNextBB(loadLevel, inLink->GetOutBehaviorIO()->GetOwner());
		m_LevelRow = op->GetOutputParameter(0)->GetDestination(0);
		CKBehavior* objLoad = ScriptHelper::FindFirstBB(loadLevel, "Object Load");
		CKBehavior* bin = ScriptHelper::CreateBB(loadLevel, VT_LOGICS_BINARYSWITCH);
		ScriptHelper::CreateLink(loadLevel, loadLevel->GetInput(0), bin, 0);
		m_LoadCustom = ScriptHelper::CreateLocalParameter(loadLevel, "Custom Level", CKPGUID_BOOL);
		bin->GetInputParameter(0)->SetDirectSource(m_LoadCustom);
		inLink->SetInBehaviorIO(bin->GetOutput(1));
		ScriptHelper::CreateLink(loadLevel, bin, objLoad);
		m_MapFile = objLoad->GetInputParameter(0)->GetDirectSource();

		CKBehavior* smat = ScriptHelper::FindFirstBB(script, "Set Mapping and Textures");
		if (!smat) return;
		CKBehavior* sml = ScriptHelper::FindFirstBB(smat, "Set Mat Laterne");
		if (!sml) return;
		CKBehavior* sat = ScriptHelper::FindFirstBB(sml, "Set Alpha Test");
		if (!sat) return;

		/*CKParameter* sate = sat->GetInputParameter(0)->GetDirectSource();
		if (sate) {
			CKBOOL atest = m_LanternAlphaTest->GetBoolean();
			sate->SetValue(&atest);
		}*/
	}

	/*if (m_FixLifeBall) {
		if (!strcmp(script->GetName(), "P_Extra_Life_Particle_Blob Script") ||
			!strcmp(script->GetName(), "P_Extra_Life_Particle_Fizz Script"))
			OnEditScript_ExtraLife_Fix(script);
	}*/
}

void RockoonIO::LoadMap(const std::string& path)
{
	if (path.empty())
		return;

	//std::string filename = CreateTempMapFile(path);
	std::string filename = path;
	SetParamString(m_MapFile, filename.c_str());
	SetParamValue(m_LoadCustom, TRUE);
	//int level = m_CustomMapNumber->GetInteger();
	int level = rand() % 10 + 2;
	m_CurLevel->SetElementValue(0, 0, &level);
	level--;
	SetParamValue(m_LevelRow, level);

	//std::string mapPath = utils::ToString(path);
	//BML_DataShare_Set(m_DataShare, "CustomMapName", path.c_str(), path.size() + 1);
	auto ctx = m_BML->GetCKContext();
	auto mm = ctx->GetMessageManager();
	auto loadLevel = mm->AddMessageType((CKSTRING)"Load Level");
	auto loadMenu = mm->AddMessageType((CKSTRING)"Menu_Load");

	mm->SendMessageSingle(loadLevel, ctx->GetCurrentLevel());
	mm->SendMessageSingle(loadMenu, m_BML->GetGroupByName("All_Sound"));
	m_BML->Get2dEntityByName("M_BlackScreen")->Show(CKHIDE);
	m_ExitStart->ActivateInput(0);
	m_ExitStart->Activate();
}

std::string RockoonIO::GetRockoonArg(const std::string flag)
{
	int argc;
	auto argv = CommandLineToArgvW(GetCommandLineW(), &argc);
	for (int i = 0; i < argc; i++)
	{
		auto arg = argv[i];

		std::wstring ws(arg);
		std::wstring_convert<std::codecvt_utf8<wchar_t>> conv;
		std::string arg_str = conv.to_bytes(ws);

		if (arg_str.starts_with(flag))
		{
			LocalFree(argv);
			return arg_str.substr(flag.length());
		}
	}
	LocalFree(argv);
	return "";
}

void FakeBMLMod::LoadMap(const std::wstring& path)
{
	m_BML->SendIngameMessage("666666666666");
}