#pragma once

#include <windows.h>
#include <cstdint>

namespace rockoon {

	/**
	 * 共享内存里的帧率槽（Rockoon 的 TAS 编辑器 ↔ 游戏）。
	 *
	 * 名字：`Local\RockoonIO.FrameLimit.<游戏 pid>`，由本模组创建；编辑器那边
	 * （src-tauri/src/commands/frame_limit.rs）按 pid 打开、写 targetFps、读 measuredFps。
	 * 布局两边必须一致，改了要同时改 Rust 侧并升 version。
	 */
	struct FrameLimitShared {
		uint32_t magic;               // kFrameLimitMagic
		uint32_t version;             // kFrameLimitVersion
		volatile float targetFps;     // 编辑器写：每秒推进多少个逻辑帧；<= 0 = 不限速
		volatile float measuredFps;   // 模组写：最近约 0.5 秒实际跑出来的帧率
	};

	constexpr uint32_t kFrameLimitMagic = 0x4C464B52; // "RKFL"
	constexpr uint32_t kFrameLimitVersion = 1;

	/**
	 * 「Bandicam 式」帧率限制：不碰游戏逻辑，只在每一帧结束时等到下一帧该开始的时刻。
	 *
	 * Ballance 是单线程主循环（处理 + 渲染），所以压住每一轮循环的节奏就同时压住了
	 * 逻辑帧的推进速度 —— TAS 每个逻辑帧消耗一帧录像，于是回放速度 = 目标帧率 / 录像帧率，
	 * 而录像里的 deltaTime（游戏内时间）完全不受影响。目标帧率随时可改，下一帧就生效。
	 */
	class FramePacer {
	public:
		~FramePacer() { Shutdown(); }

		/** 创建共享内存槽并写入初始帧率。失败返回 false（此时不限速）。 */
		bool Init(float initialFps);
		void Shutdown();
		bool Active() const { return m_Shared != nullptr; }

		/**
		 * 每个逻辑帧调用一次：按当前目标帧率等到下一帧的时刻，并统计实际帧率。
		 * `unpaced` = 这一帧不等（快进：BallanceTAS 的 SkipRenderUntilFrame 期间不渲染，
		 * 这时候限速只会让「跳到第 N 帧」慢得没法用）。
		 */
		void Wait(bool unpaced = false);

	private:
		HANDLE m_Mapping = nullptr;
		FrameLimitShared* m_Shared = nullptr;
		bool m_TimerRaised = false;

		int64_t m_Freq = 0;
		/** 下一帧该开始的时刻（QPC 计数）；0 = 重新起拍 */
		int64_t m_Next = 0;
		float m_LastFps = -1.0f;

		int64_t m_StatStart = 0;
		uint32_t m_StatFrames = 0;
	};

}
