#ifndef BML_MAPLOADER_H
#define BML_MAPLOADER_H

#include <string>

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <Windows.h>

#include "CKAll.h"

namespace bml {

/**
 * Utility for loading custom maps (.nmo/.cmo) into Ballance.
 *
 * Requires BML+ with BML_MapMenu already loaded (the Levelinit_build script
 * must have been hooked). Call Init() once CKContext is available, then
 * Load() to trigger a custom map load.
 *
 * Usage from a module:
 *   bml::MapLoader loader;
 *   loader.Init(ckContext);
 *   auto result = loader.Load(L"C:/path/to/map.nmo");
 *   if (!result.success) { // handle error }
 */
class MapLoader {
public:
    struct Result {
        bool success = false;
        std::string message;
    };

    MapLoader() = default;

    /**
     * Discover required CK objects from the context.
     * Call after engine init (CKContext available and Levelinit_build hooked).
     */
    bool Init(CKContext *ctx);

    /**
     * Load a custom map file.
     * @param mapPath      Full path to the .nmo or .cmo file.
     * @param levelNumber  Level slot (1-13). 0 = default (level 2).
     */
    Result Load(const std::wstring &mapPath, int levelNumber = 0);

    bool IsReady() const;

    /** Release all cached references. */
    void Reset();

private:
    static void WriteParam(CKParameter *param, const char *value);
    static void WriteParam(CKParameter *param, int value);

    bool DiscoverNamedObjects();
    bool DiscoverBehaviorParams();

    static CKBehavior *FindScriptByName(CKContext *ctx, const char *name);
    static CKBehavior *FindSubBehavior(CKBehavior *parent, const char *name);
    static CKBehavior *FindExitBehavior(CKBehavior *parent);
    static CKParameter *FindLocalParamByName(CKBehavior *beh, const char *name);
    static CKParameter *FindObjectLoadMapFile(CKBehavior *loadLevel);
    static CKParameter *FindLevelRowParam(CKBehavior *loadLevel);

    static std::wstring GetTempMapsDir();
    static std::string StageMapFile(const std::wstring &path);
    static uint32_t HashStem(const std::wstring &value);
    static std::string WideToUtf8(const std::wstring &wide);

    CKContext *m_Context = nullptr;
    CK_ID m_LoadCustomId = 0;
    CK_ID m_MapFileId = 0;
    CK_ID m_LevelRowId = 0;
    CK_ID m_ExitStartId = 0;
    CK_ID m_ExitMainId = 0;
    CK_ID m_CurrentLevelArrayId = 0;
    bool m_ParamsReady = false;
};

} // namespace bml

#endif // BML_MAPLOADER_H
