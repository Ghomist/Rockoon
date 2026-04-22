#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif // !WIN32_LEAN_AND_MEAN

#include <Windows.h>
#include <objidl.h>
#include <gdiplus.h>
#include <memory>
#include <numbers>

#include "RockoonIO.h"

namespace {
	CKCamera* screenshot_camera = nullptr;

	bool screenshot_mode = false;
	std::wstring screenshot_dir;

	ULONG_PTR gdiplus_token;
	Gdiplus::GdiplusStartupInput gdiplus_startup_input;
	CLSID png_clsid;

  int GetEncoderClsid(const WCHAR* format, CLSID* pClsid) {
    UINT  num = 0;          // number of image encoders
    UINT  size = 0;         // size of the image encoder array in bytes

    Gdiplus::GetImageEncodersSize(&num, &size);
    if (size == 0)
      return -1;  // Failure

    auto pData = std::make_unique_for_overwrite<std::byte[]>(size);
    if (!pData)
      return -1;  // Failure
    auto pImageCodecInfo = (Gdiplus::ImageCodecInfo*) pData.get();

    Gdiplus::GetImageEncoders(num, size, pImageCodecInfo);

    for (UINT j = 0; j < num; ++j) {
      if (wcscmp(pImageCodecInfo[j].MimeType, format) == 0) {
        *pClsid = pImageCodecInfo[j].Clsid;
        return j;  // Success
      }
    }

    return -1;  // Failure
  }

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
}


void RockoonIO::OnLoad()
{
	auto motd = this->GetRockoonEnv(this->E_MOTD);
	if (!motd.empty())
	{
		m_BML->SendIngameMessage(FormatRockoonMessage(WString2String(motd)));
	}

	// gdi init
	Gdiplus::GdiplusStartup(&gdiplus_token, &gdiplus_startup_input, nullptr);
	GetEncoderClsid(L"image/png", &png_clsid);

	screenshot_camera = static_cast<CKCamera*>(m_BML->GetCKContext()->CreateObject(CKCID_CAMERA, (CKSTRING)"RockoonScreenshotCamera"));

	screenshot_dir = this->GetRockoonEnv(this->E_SCREENSHOT_DIR);
	if (!screenshot_dir.empty())
		screenshot_mode = true;
	std::filesystem::create_directories(screenshot_dir);
}

void RockoonIO::OnPostStartMenu()
{
	auto startup_map = this->GetRockoonEnv(this->E_STARTUP);
	if (!startup_map.empty())
	{
		// m_BML->SendIngameMessage(FormatRockoonMessage("Starting: " + WString2String(startup_map)));
		m_BML->AddTimer(50.0f, [this, startup_map]()
		{
			m_MapLoader.Init(m_BML->GetCKContext());
			auto result = m_MapLoader.Load(startup_map);
			// if (result.success)
			// 	m_BML->SendIngameMessage(FormatRockoonMessage(result.message));
			// else
			// 	m_BML->SendIngameMessage(FormatRockoonMessage("Failed: " + result.message));
		});
	}
}

void RockoonIO::OnPostExitLevel()
{
	PostQuitMessage(0);
}

void RockoonIO::OnStartLevel()
{
	if (!screenshot_mode) return;

	m_BML->AddTimer(CKDWORD{10}, [this]
	{
		auto ingame_camera = m_BML->GetTargetCameraByName("InGameCam");
		assert(ingame_camera);

		int width, height;
		ingame_camera->GetAspectRatio(width, height);
		screenshot_camera->SetWorldMatrix(ingame_camera->GetWorldMatrix());
		screenshot_camera->SetAspectRatio(width, height);
		screenshot_camera->SetBackPlane(16384.0f);
		screenshot_camera->SetFov(ingame_camera->GetFov() * 1.1f); // increase FOV a bit to capture more of the scene in screenshots

		static const VxVector rotation_x {1, 0, 0}, back_translation {0, 0, -80.0};
		screenshot_camera->Rotate(&rotation_x, 0.42f, screenshot_camera);
		screenshot_camera->Translate(&back_translation, screenshot_camera);

		m_BML->GetRenderContext()->AttachViewpointToCamera(screenshot_camera);

		// hide HUD
		m_BML->GetGroupByName("HUD_sprites")->Show(CKHIDE);
		m_BML->GetGroupByName("LifeBalls")->Show(CKHIDE);

		// wait for the skybox / remaining modules to stabilize
		m_BML->AddTimer(1500.0f, [this]
		{
			m_SavedScreenshots.clear();
			for (CKDWORD i = 0; i < 24; ++i) {
				m_BML->AddTimer(2 * i, [this]
				{
					DoScreenshot();
					// rotate the camera 45 degrees around the Y axis to capture different angles of the scene, increasing chances of getting a good screenshot without HUD elements
					static const VxVector reverse_back_translation = -back_translation, rotation_y {0, 1, 0};
					screenshot_camera->Translate(&reverse_back_translation, screenshot_camera);
					screenshot_camera->Rotate(&rotation_y, std::numbers::pi_v<float> / 12); // 15 degrees
					screenshot_camera->Translate(&back_translation, screenshot_camera);
				});
			}

			m_BML->AddTimer(CKDWORD{50}, [this]
			{
				// only save the biggest (most likely to be the best) screenshot
				if (m_SavedScreenshots.empty()) return;

				std::filesystem::path best_screenshot = m_SavedScreenshots[0];
				uintmax_t max_size = std::filesystem::file_size(best_screenshot);
				for (const auto& path : m_SavedScreenshots) {
					auto size = std::filesystem::file_size(path);
					if (size > max_size) {
						max_size = size;
						best_screenshot = path;
					}
				}

				// delete the rest
				for (const auto& path : m_SavedScreenshots) {
					if (path != best_screenshot) {
						std::filesystem::remove(path);
					}
				}

				GetLogger()->Info("Saved final screenshot as %s", WString2String(best_screenshot.wstring()).c_str());
			});
		});
	});
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

void RockoonIO::DoScreenshot()
{
	auto handle = static_cast<HWND>(m_BML->GetCKContext()->GetMainWindow());
	VxRect rect; m_BML->GetRenderContext()->GetWindowRect(rect);
	int width = rect.GetWidth();
	int height = rect.GetHeight();
	RECT window_rect; GetClientRect(handle, &window_rect);
	if (window_rect.right - window_rect.left < width || window_rect.bottom - window_rect.top < height) {
		window_rect.right = window_rect.left + width;
		window_rect.bottom = window_rect.top + height;
		AdjustWindowRectEx(&window_rect, GetWindowLong(handle, GWL_STYLE), false, GetWindowLong(handle, GWL_EXSTYLE));
		SetWindowPos(handle, handle, 0, 0, window_rect.right - window_rect.left, window_rect.bottom - window_rect.top, SWP_NOMOVE | SWP_NOZORDER);
	}

	HDC hdc_screen = GetDC(handle);
	HDC hdc = CreateCompatibleDC(hdc_screen);
	HBITMAP hbmp = CreateCompatibleBitmap(hdc_screen, width, height);
	HGDIOBJ old_obj = SelectObject(hdc, hbmp);

	BitBlt(hdc, 0, 0, width, height, hdc_screen, 0, 0, SRCCOPY);
	
	// char timestamp[32]{};
	// std::strftime(timestamp, sizeof(timestamp), "%Y-%m-%d_%H-%M-%S", &local_tm);
	std::filesystem::path p(GetRockoonEnv(this->E_STARTUP));
	
	std::filesystem::path base = std::filesystem::path(screenshot_dir) / p.stem();
	std::filesystem::path screenshot_path = base;
	screenshot_path += L"_";
	std::chrono::milliseconds ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch());
	screenshot_path += std::to_wstring(ms.count());
	screenshot_path += L".png";
	while (std::filesystem::exists(screenshot_path)) {
		base += L"_";
		screenshot_path = base;
		screenshot_path += L".png";
	}
	m_SavedScreenshots.push_back(screenshot_path);

	Gdiplus::Bitmap bitmap(hbmp, nullptr);
	bitmap.Save(screenshot_path.c_str(), &png_clsid);

	auto saved_path = WString2String(screenshot_path.wstring());
	GetLogger()->Info("Saved screenshot as %s", saved_path.c_str());

	SelectObject(hdc, old_obj);
	DeleteDC(hdc);
	DeleteObject(hbmp);
	ReleaseDC(handle, hdc_screen);
}
