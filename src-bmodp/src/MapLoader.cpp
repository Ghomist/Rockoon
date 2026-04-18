#include "MapLoader.h"

#include <filesystem>
#include <algorithm>
#include <cstdlib>
#include <cstring>

// BinarySwitch prototype GUID (VT_LOGICS_BINARYSWITCH)
static const CKGUID kBinarySwitchGuid(0xeb506901, 0x984afccc);

namespace fs = std::filesystem;

namespace bml {

// ---------------------------------------------------------------------------
// Inline parameter helpers (replaces BML/Behavior.h dependency)
// ---------------------------------------------------------------------------

void MapLoader::WriteParam(CKParameter *param, const char *value) {
    if (param) param->SetStringValue((CKSTRING)value);
}

void MapLoader::WriteParam(CKParameter *param, int value) {
    if (param) param->SetValue(&value, sizeof(value));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

bool MapLoader::Init(CKContext *ctx) {
    if (!ctx) return false;
    m_Context = ctx;

    if (!DiscoverNamedObjects()) return false;
    if (!DiscoverBehaviorParams()) return false;

    m_ParamsReady = true;
    return true;
}

bool MapLoader::IsReady() const {
    if (!m_ParamsReady || !m_Context) return false;
    return m_Context->GetObject(m_LoadCustomId)
        && m_Context->GetObject(m_MapFileId)
        && m_Context->GetObject(m_ExitStartId);
}

void MapLoader::Reset() {
    m_Context = nullptr;
    m_LoadCustomId = 0;
    m_MapFileId = 0;
    m_LevelRowId = 0;
    m_ExitStartId = 0;
    m_ExitMainId = 0;
    m_CurrentLevelArrayId = 0;
    m_ParamsReady = false;
}

MapLoader::Result MapLoader::Load(const std::wstring &mapPath, int levelNumber) {
    Result result;

    if (mapPath.empty()) {
        result.message = "map path is empty";
        return result;
    }

    if (!m_ParamsReady || !m_Context) {
        result.message = "MapLoader not initialized; call Init() first";
        return result;
    }

    auto *loadCustom = static_cast<CKParameter *>(m_Context->GetObject(m_LoadCustomId));
    auto *mapFile = static_cast<CKParameter *>(m_Context->GetObject(m_MapFileId));
    auto *exitStart = static_cast<CKBehavior *>(m_Context->GetObject(m_ExitStartId));

    if (!loadCustom || !mapFile || !exitStart) {
        result.message = "required CK objects are no longer valid";
        return result;
    }

    auto *currentLevel = static_cast<CKDataArray *>(
        m_Context->GetObject(m_CurrentLevelArrayId));
    if (!currentLevel) {
        result.message = "CurrentLevel array unavailable";
        return result;
    }

    const std::string tempFile = StageMapFile(mapPath);
    if (tempFile.empty()) {
        result.message = "failed to stage map file: " + WideToUtf8(mapPath);
        return result;
    }

    if (levelNumber < 1 || levelNumber > 13)
        levelNumber = 2;

    WriteParam(mapFile, tempFile.c_str());
    WriteParam(loadCustom, TRUE);

    currentLevel->SetElementValue(0, 0, &levelNumber);

    auto *levelRow = static_cast<CKParameter *>(m_Context->GetObject(m_LevelRowId));
    if (levelRow) {
        int levelRowVal = levelNumber - 1;
        WriteParam(levelRow, levelRowVal);
    }

    CKMessageManager *messageManager = m_Context->GetMessageManager();
    auto *allSound = static_cast<CKGroup *>(
        m_Context->GetObjectByNameAndClass((CKSTRING)"All_Sound", CKCID_GROUP));
    auto *blackScreen = static_cast<CK2dEntity *>(
        m_Context->GetObjectByNameAndClass((CKSTRING)"M_BlackScreen", CKCID_2DENTITY));

    if (!messageManager || !allSound || !blackScreen ||
        !m_Context->GetCurrentLevel()) {
        result.message = "menu transition objects unavailable";
        return result;
    }

    CKMessageType loadLevelMessage =
        messageManager->AddMessageType((CKSTRING)"Load Level");
    CKMessageType loadMenuMessage =
        messageManager->AddMessageType((CKSTRING)"Menu_Load");

    messageManager->SendMessageSingle(loadLevelMessage, m_Context->GetCurrentLevel());
    messageManager->SendMessageSingle(loadMenuMessage, allSound);
    blackScreen->Show(CKHIDE);

    // Activate Exit in both Menu_Start and Menu_Main so the menu is fully
    // torn down regardless of which screen the player is on.
    for (CK_ID exitId : {m_ExitStartId, m_ExitMainId}) {
        if (!exitId) continue;
        auto *exitBeh = static_cast<CKBehavior *>(m_Context->GetObject(exitId));
        if (exitBeh) {
            exitBeh->ActivateInput(0);
            exitBeh->Activate();
        }
    }

    result.success = true;
    result.message = "loading " + WideToUtf8(mapPath);
    return result;
}

// ---------------------------------------------------------------------------
// Discovery helpers
// ---------------------------------------------------------------------------

bool MapLoader::DiscoverNamedObjects() {
    auto *currentLevel = static_cast<CKDataArray *>(
        m_Context->GetObjectByNameAndClass((CKSTRING)"CurrentLevel", CKCID_DATAARRAY));
    if (currentLevel)
        m_CurrentLevelArrayId = currentLevel->GetID();

    CKBehavior *menuStart = FindScriptByName(m_Context, "Menu_Start");
    if (menuStart) {
        CKBehavior *exitBeh = FindExitBehavior(menuStart);
        if (exitBeh)
            m_ExitStartId = exitBeh->GetID();
    }

    CKBehavior *menuMain = FindScriptByName(m_Context, "Menu_Main");
    if (menuMain) {
        CKBehavior *exitBeh = FindExitBehavior(menuMain);
        if (exitBeh)
            m_ExitMainId = exitBeh->GetID();
    }

    return m_CurrentLevelArrayId != 0 && m_ExitStartId != 0;
}

bool MapLoader::DiscoverBehaviorParams() {
    CKBehavior *levelInit = FindScriptByName(m_Context, "Levelinit_build");
    if (!levelInit) return false;

    CKBehavior *loadLevel = FindSubBehavior(levelInit, "Load LevelXX");
    if (!loadLevel) return false;

    CKParameter *customLevel = FindLocalParamByName(loadLevel, "Custom Level");
    if (customLevel)
        m_LoadCustomId = customLevel->GetID();

    CKParameter *mapFile = FindObjectLoadMapFile(loadLevel);
    if (mapFile)
        m_MapFileId = mapFile->GetID();

    CKParameter *levelRow = FindLevelRowParam(loadLevel);
    if (levelRow)
        m_LevelRowId = levelRow->GetID();

    return m_LoadCustomId != 0 && m_MapFileId != 0;
}

// ---------------------------------------------------------------------------
// CK2 object lookups
// ---------------------------------------------------------------------------

CKBehavior *MapLoader::FindScriptByName(CKContext *ctx, const char *name) {
    if (!ctx || !name) return nullptr;
    const int count = ctx->GetObjectsCountByClassID(CKCID_BEHAVIOR);
    CK_ID *ids = ctx->GetObjectsListByClassID(CKCID_BEHAVIOR);
    for (int i = 0; i < count; i++) {
        CKObject *obj = ctx->GetObject(ids[i]);
        if (!obj) continue;
        auto *beh = static_cast<CKBehavior *>(obj);
        if ((beh->GetType() & CKBEHAVIORTYPE_SCRIPT) == 0) continue;
        const char *behName = beh->GetName();
        if (behName && std::strcmp(behName, name) == 0)
            return beh;
    }
    return nullptr;
}

CKBehavior *MapLoader::FindSubBehavior(CKBehavior *parent, const char *name) {
    if (!parent || !name) return nullptr;
    const int count = parent->GetSubBehaviorCount();
    for (int i = 0; i < count; i++) {
        CKBehavior *sub = parent->GetSubBehavior(i);
        if (!sub) continue;
        const char *subName = sub->GetName();
        if (subName && std::strcmp(subName, name) == 0)
            return sub;
    }
    return nullptr;
}

CKBehavior *MapLoader::FindExitBehavior(CKBehavior *parent) {
    if (!parent) return nullptr;
    const int count = parent->GetSubBehaviorCount();
    for (int i = 0; i < count; i++) {
        CKBehavior *sub = parent->GetSubBehavior(i);
        if (!sub) continue;
        const char *name = sub->GetName();
        if (!name || std::strcmp(name, "Exit") != 0) continue;
        if (sub->GetInputCount() > 0 && sub->GetOutputCount() == 0)
            return sub;
    }
    return nullptr;
}

CKParameter *MapLoader::FindLocalParamByName(CKBehavior *beh, const char *name) {
    if (!beh || !name) return nullptr;
    const int count = beh->GetLocalParameterCount();
    for (int i = 0; i < count; i++) {
        CKParameterLocal *param = beh->GetLocalParameter(i);
        if (!param) continue;
        const char *paramName = param->GetName();
        if (paramName && std::strcmp(paramName, name) == 0)
            return param;
    }
    return nullptr;
}

CKParameter *MapLoader::FindObjectLoadMapFile(CKBehavior *loadLevel) {
    CKBehavior *objectLoad = FindSubBehavior(loadLevel, "Object Load");
    if (!objectLoad || objectLoad->GetInputParameterCount() <= 0)
        return nullptr;
    CKParameterIn *inputParam = objectLoad->GetInputParameter(0);
    if (!inputParam) return nullptr;
    return inputParam->GetDirectSource();
}

CKParameter *MapLoader::FindLevelRowParam(CKBehavior *loadLevel) {
    if (!loadLevel) return nullptr;
    const int subCount = loadLevel->GetSubBehaviorCount();
    for (int i = 0; i < subCount; i++) {
        CKBehavior *sub = loadLevel->GetSubBehavior(i);
        if (!sub) continue;

        const char *name = sub->GetName();
        if (name && std::strcmp(name, "Object Load") == 0) continue;

        CKBehaviorPrototype *proto = sub->GetPrototype();
        if (proto && proto->GetGuid() == kBinarySwitchGuid) continue;

        if (sub->GetOutputParameterCount() > 0) {
            CKParameterOut *outParam = sub->GetOutputParameter(0);
            if (outParam && outParam->GetDestinationCount() > 0)
                return outParam->GetDestination(0);
        }
    }
    return nullptr;
}

// ---------------------------------------------------------------------------
// File staging
// ---------------------------------------------------------------------------

std::wstring MapLoader::GetTempMapsDir() {
    wchar_t tempPath[MAX_PATH] = {};
    DWORD length = GetTempPathW(MAX_PATH, tempPath);
    fs::path base = (length > 0 && length < MAX_PATH)
        ? fs::path(tempPath) : fs::temp_directory_path();
    return (base / L"BML" / L"Maps").wstring();
}

uint32_t MapLoader::HashStem(const std::wstring &value) {
    uint32_t hash = 2166136261u;
    for (wchar_t ch : value) {
        uint32_t code = static_cast<uint32_t>(towlower(ch));
        hash ^= code & 0xFFu;
        hash *= 16777619u;
        hash ^= (code >> 8) & 0xFFu;
        hash *= 16777619u;
    }
    return hash;
}

std::string MapLoader::StageMapFile(const std::wstring &path) {
    std::error_code ec;
    if (path.empty() || !fs::exists(path, ec)) return {};

    const fs::path source(path);
    const std::wstring stem = source.stem().wstring();
    const std::wstring extension = source.extension().wstring();
    const uint32_t hash = HashStem(stem);

    wchar_t hashBuffer[9] = {};
    swprintf_s(hashBuffer, L"%08X", hash);

    const fs::path tempDir(GetTempMapsDir());
    fs::create_directories(tempDir, ec);
    if (ec) return {};

    const fs::path destination = tempDir / (std::wstring(hashBuffer) + extension);
    fs::copy_file(source, destination, fs::copy_options::overwrite_existing, ec);
    if (ec) return {};

    return WideToUtf8(destination.wstring());
}

std::string MapLoader::WideToUtf8(const std::wstring &wide) {
    if (wide.empty()) return {};
    int len = WideCharToMultiByte(CP_UTF8, 0, wide.c_str(),
        static_cast<int>(wide.size()), nullptr, 0, nullptr, nullptr);
    if (len <= 0) return {};
    std::string result(static_cast<size_t>(len), '\0');
    WideCharToMultiByte(CP_UTF8, 0, wide.c_str(),
        static_cast<int>(wide.size()), result.data(), len, nullptr, nullptr);
    return result;
}

} // namespace bml
