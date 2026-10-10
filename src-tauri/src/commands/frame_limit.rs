//! TAS 回放调速：往游戏里 RockoonIO 模组建的共享内存槽写目标帧率、读实际帧率。
//!
//! 「Bandicam 式」限速 —— 不碰游戏逻辑，模组只在每个逻辑帧末尾等到下一帧该开始的时刻
//! （见 `src-bmodp/src/FramePacer.*`）。TAS 每个逻辑帧消耗一帧录像，所以
//! 回放速度 = 目标帧率 / 录像帧率，播放中随时可改，下一帧生效。
//!
//! 槽名 `Local\RockoonIO.FrameLimit.<pid>`，只在游戏带着 `ROCKOON_TAS_FPS` 启动时才有
//! （TAS 编辑器启动的才带）。游戏还在载入、模组还没建槽时这里会报「not ready」，
//! 调用方过一会儿重试即可。

use crate::common::exception::{RcResult, RcResultWith};
use serde::Serialize;

/// 槽的当前状态。
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct FrameLimitInfo {
    /// 当前目标帧率（<= 0 = 不限速）
    pub target_fps: f32,
    /// 模组最近约 0.5 秒实测的逻辑帧率
    pub measured_fps: f32,
}

/// 设定游戏 pid 的目标帧率（`fps <= 0` = 不限速）。
#[tauri::command]
pub fn set_game_frame_limit(pid: u32, fps: f32) -> RcResult {
    #[cfg(target_os = "windows")]
    {
        win::with_slot(pid, |slot| unsafe {
            std::ptr::write_volatile(&mut (*slot).target_fps, if fps.is_finite() { fps } else { 0.0 });
        })
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (pid, fps);
        Err(crate::common::exception::RcError::Other(
            "frame limiting is only supported on Windows".into(),
        ))
    }
}

/// 读游戏 pid 的目标帧率与实测帧率。
#[tauri::command]
pub fn game_frame_limit(pid: u32) -> RcResultWith<FrameLimitInfo> {
    #[cfg(target_os = "windows")]
    {
        let mut info = FrameLimitInfo::default();
        win::with_slot(pid, |slot| unsafe {
            info.target_fps = std::ptr::read_volatile(&(*slot).target_fps);
            info.measured_fps = std::ptr::read_volatile(&(*slot).measured_fps);
        })?;
        Ok(info)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = pid;
        Ok(FrameLimitInfo::default())
    }
}

#[cfg(target_os = "windows")]
mod win {
    use crate::common::exception::{RcError, RcResult};
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Memory::{
        MapViewOfFile, OpenFileMappingW, UnmapViewOfFile, FILE_MAP_READ, FILE_MAP_WRITE,
        MEMORY_MAPPED_VIEW_ADDRESS,
    };

    /// 与 `FramePacer.h` 里的 `FrameLimitShared` 逐字段一致（改了两边一起改并升 VERSION）。
    #[repr(C)]
    pub struct Slot {
        pub magic: u32,
        pub version: u32,
        pub target_fps: f32,
        pub measured_fps: f32,
    }

    const MAGIC: u32 = 0x4C46_4B52; // "RKFL"
    const VERSION: u32 = 1;

    /// 打开 pid 的槽、映射、校验后交给 `f`，用完立刻解除映射。
    pub fn with_slot(pid: u32, f: impl FnOnce(*mut Slot)) -> RcResult {
        let name: Vec<u16> = format!("Local\\RockoonIO.FrameLimit.{pid}")
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            let mapping = OpenFileMappingW(FILE_MAP_READ | FILE_MAP_WRITE, 0, name.as_ptr());
            if mapping.is_null() {
                return Err(RcError::Other(format!(
                    "frame limit channel of pid {pid} is not ready"
                )));
            }
            let view = MapViewOfFile(
                mapping,
                FILE_MAP_READ | FILE_MAP_WRITE,
                0,
                0,
                std::mem::size_of::<Slot>(),
            );
            if view.Value.is_null() {
                CloseHandle(mapping);
                return Err(RcError::Other(format!(
                    "could not map the frame limit channel of pid {pid}"
                )));
            }
            let slot = view.Value as *mut Slot;
            let ok = std::ptr::read_volatile(&(*slot).magic) == MAGIC
                && std::ptr::read_volatile(&(*slot).version) == VERSION;
            if ok {
                f(slot);
            }
            UnmapViewOfFile(MEMORY_MAPPED_VIEW_ADDRESS { Value: view.Value });
            CloseHandle(mapping);
            if ok {
                Ok(())
            } else {
                Err(RcError::Other(format!(
                    "frame limit channel of pid {pid} has an unexpected layout"
                )))
            }
        }
    }
}
