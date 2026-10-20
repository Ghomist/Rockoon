pub mod brp;
pub mod mod_config;
pub mod options;
pub mod tdb;
// 只在其它平台（Wine）启动游戏前用（commands/process.rs）
#[cfg(not(target_os = "windows"))]
pub mod input_fix;
