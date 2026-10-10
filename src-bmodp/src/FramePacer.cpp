#include "FramePacer.h"

#include <algorithm>
#include <cmath>
#include <string>

#pragma comment(lib, "winmm.lib")

namespace rockoon {

	static int64_t QpcNow() {
		LARGE_INTEGER now;
		QueryPerformanceCounter(&now);
		return now.QuadPart;
	}

	bool FramePacer::Init(float initialFps) {
		if (m_Shared) return true;

		const std::wstring name = L"Local\\RockoonIO.FrameLimit." + std::to_wstring(GetCurrentProcessId());
		m_Mapping = CreateFileMappingW(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0,
			sizeof(FrameLimitShared), name.c_str());
		if (!m_Mapping) return false;

		m_Shared = static_cast<FrameLimitShared*>(
			MapViewOfFile(m_Mapping, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(FrameLimitShared)));
		if (!m_Shared) {
			CloseHandle(m_Mapping);
			m_Mapping = nullptr;
			return false;
		}

		m_Shared->targetFps = std::isfinite(initialFps) ? initialFps : 0.0f;
		m_Shared->measuredFps = 0.0f;
		m_Shared->version = kFrameLimitVersion;
		// magic 最后写：编辑器以它判断槽已就绪
		MemoryBarrier();
		m_Shared->magic = kFrameLimitMagic;

		LARGE_INTEGER freq;
		QueryPerformanceFrequency(&freq);
		m_Freq = freq.QuadPart;

		// 240 fps 一帧只有 4.17ms：默认 15.6ms 的系统时钟粒度下 Sleep 根本不准
		m_TimerRaised = timeBeginPeriod(1) == TIMERR_NOERROR;
		return true;
	}

	void FramePacer::Shutdown() {
		if (m_TimerRaised) {
			timeEndPeriod(1);
			m_TimerRaised = false;
		}
		if (m_Shared) {
			UnmapViewOfFile(m_Shared);
			m_Shared = nullptr;
		}
		if (m_Mapping) {
			CloseHandle(m_Mapping);
			m_Mapping = nullptr;
		}
	}

	void FramePacer::Wait(bool unpaced) {
		if (!m_Shared) return;

		int64_t now = QpcNow();

		// 实际帧率：约每 0.5 秒结算一次，给编辑器显示
		if (m_StatStart == 0) m_StatStart = now;
		++m_StatFrames;
		if (now - m_StatStart >= m_Freq / 2) {
			m_Shared->measuredFps = static_cast<float>(
				static_cast<double>(m_StatFrames) * m_Freq / static_cast<double>(now - m_StatStart));
			m_StatStart = now;
			m_StatFrames = 0;
		}

		const float fps = m_Shared->targetFps;
		if (unpaced || !(fps > 0.0f) || !std::isfinite(fps)) {
			// 不限速
			m_Next = 0;
			m_LastFps = fps;
			return;
		}

		const int64_t period = static_cast<int64_t>(static_cast<double>(m_Freq) / fps);
		if (period <= 0) return;

		// 目标帧率变了 / 刚起拍 / 落后太多（载入关卡、窗口拖动之类的长卡顿）→ 从现在重新起拍，
		// 不去「追帧」，否则卡顿之后会以不限速狂奔一段。门槛按时间算（至少 100ms）：
		// 系统调度的小抖动（几到十几毫秒）要追回来，否则高帧率下每次抖动都白丢几帧，
		// 实测 240 fps 会掉到 232
		const int64_t stall = (std::max)(period * 4, m_Freq / 10);
		if (fps != m_LastFps || m_Next == 0 || now - m_Next > stall) {
			m_Next = now + period;
			m_LastFps = fps;
		} else {
			// 按固定节拍往后排：单帧的抖动会被下一帧吸收，平均帧率精确等于目标
			m_Next += period;
		}

		for (;;) {
			now = QpcNow();
			const int64_t remain = m_Next - now;
			if (remain <= 0) break;
			const double ms = static_cast<double>(remain) * 1000.0 / static_cast<double>(m_Freq);
			if (ms > 2.0) {
				Sleep(static_cast<DWORD>(ms - 1.5));
			} else {
				// 最后 2ms 自旋：Sleep(1) 实际可能睡 1~2ms，会把 240 fps 拉低
				YieldProcessor();
			}
		}
	}

}
