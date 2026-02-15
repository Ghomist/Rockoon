export const parseBallanceLaunchConfig = (
  rawConfig: RawLaunchConfig
): BallanceLaunchConfig => ({
  Window: {
    ClipCursor: rawConfig["Window"]["ClipCursor"] === "1",
    Borderless: rawConfig["Window"]["Borderless"] === "1",
    ChildWindowRendering: rawConfig["Window"]["ChildWindowRendering"] === "1",
    AlwaysHandleInput: rawConfig["Window"]["AlwaysHandleInput"] === "1",
    X: parseInt(rawConfig["Window"]["X"]),
    Y: parseInt(rawConfig["Window"]["Y"])
  },
  Graphics: {
    Width: parseInt(rawConfig["Graphics"]["Width"]),
    Height: parseInt(rawConfig["Graphics"]["Height"]),
    FullScreen: rawConfig["Graphics"]["FullScreen"] === "1",
    Driver: parseInt(rawConfig["Graphics"]["Driver"]),
    DisableDithering: rawConfig["Graphics"]["DisableDithering"] === "1",
    DisableSpecular: rawConfig["Graphics"]["DisableSpecular"] === "1",
    DisableMipmap: rawConfig["Graphics"]["DisableMipmap"] === "1",
    DisablePerspectiveCorrection:
      rawConfig["Graphics"]["DisablePerspectiveCorrection"] === "1",
    ForceLinearFog: rawConfig["Graphics"]["ForceLinearFog"] === "1",
    ForceSoftware: rawConfig["Graphics"]["ForceSoftware"] === "1",
    DisableFilter: rawConfig["Graphics"]["DisableFilter"] === "1",
    EnsureVertexShader: rawConfig["Graphics"]["EnsureVertexShader"] === "1",
    UseIndexBuffers: rawConfig["Graphics"]["UseIndexBuffers"] === "1",
    SortTransparentObjects:
      rawConfig["Graphics"]["SortTransparentObjects"] === "1",
    TextureCacheManagement:
      rawConfig["Graphics"]["TextureCacheManagement"] === "1",
    EnableDebugMode: rawConfig["Graphics"]["EnableDebugMode"] === "1",
    EnableScreenDump: rawConfig["Graphics"]["EnableScreenDump"] === "1",
    Antialias: parseInt(rawConfig["Graphics"]["Antialias"]),
    VertexCache: parseInt(rawConfig["Graphics"]["VertexCache"]),
    BitsPerPixel: parseInt(rawConfig["Graphics"]["BitsPerPixel"]),
    SpriteVideoFormat: rawConfig["Graphics"]["SpriteVideoFormat"],
    TextureVideoFormat: rawConfig["Graphics"]["TextureVideoFormat"]
  },
  Game: {
    Language: parseInt(rawConfig["Game"]["Language"]),
    UnlockFramerate: rawConfig["Game"]["UnlockFramerate"] === "1",
    ApplyHotfix: rawConfig["Game"]["ApplyHotfix"] === "1",
    UnlockWidescreen: rawConfig["Game"]["UnlockWidescreen"] === "1",
    UnlockHighResolution: rawConfig["Game"]["UnlockHighResolution"] === "1",
    SkipOpening: rawConfig["Game"]["SkipOpening"] === "1",
    Debug: rawConfig["Game"]["Debug"] === "1",
    Rookie: rawConfig["Game"]["Rookie"] === "1"
  },
  Startup: {
    LogMode: rawConfig["Startup"]["LogMode"] === "1",
    Verbose: rawConfig["Startup"]["Verbose"] === "1",
    ManualSetup: rawConfig["Startup"]["ManualSetup"] === "1"
  }
});

export const dumpBallanceLaunchConfig = (
  config: BallanceLaunchConfig
): RawLaunchConfig => {
  const rawConfig: RawLaunchConfig = {};
  for (const [category, items] of Object.entries(config)) {
    rawConfig[category] = {};
    for (const [key, value] of Object.entries(items)) {
      if (typeof value === "boolean") {
        rawConfig[category][key] = value ? "1" : "0";
        continue;
      } else if (typeof value === "number") {
        rawConfig[category][key] = value.toString();
        continue;
      } else if (typeof value === "string") {
        rawConfig[category][key] = value;
        continue;
      }
    }
  }
  return rawConfig;
};
