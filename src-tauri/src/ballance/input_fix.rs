//! 修 Virtools 输入管理器（`Managers/Dx5InputManager.dll`）的按键重复 bug。
//!
//! 它把每个键「按下时的 DirectInput 时间戳」存成有符号 32 位整数，并拿正负号当状态：
//! 正 = 等首次重复的延迟，负 = 已经在重复。时间戳就是 GetTickCount（开机以来的毫秒数），
//! 开机时间（按 49.7 天取模）超过 24.8 天后最高位是 1，一按下就被当成「已经在重复」，
//! 算出来的补发次数是个天文数字 —— 输入名字时一个键出一串字、退格一次删一串。
//! Windows 上开机这么久的人少；Mac 很少重启，Wine 的 GetTickCount 又是从开机算起（含睡眠），
//! 所以 Mac 上几乎必现。
//!
//! 补丁把这两边的时间都只留低 31 位：按下时存的时间戳和两处 GetTickCount 的结果各 `and 0x7fffffff`。
//! 重复逻辑只看时间差，行为不变（每 24.8 天回绕的那一瞬间按着键会抽一下）。
//! 只用相对跳转、跳到函数间的 NOP 填充里，不引入新的重定位。
//! 只认原版文件（sha256 对得上才改），改之前留一份 `.orig`。

use crate::common::exception::RcResultWith;
use sha2::{Digest, Sha256};
use std::path::Path;

/// 原版 Dx5InputManager.dll（Virtools 2.1，2002-10-31）
const ORIGINAL_SHA256: &str = "0317d13fb29af13ffd0aed98b1e34f3a24691b973f4ade2a48968f1d684d82a7";
const PATCHED_SHA256: &str = "52def7e70f239d2d17edc2925441f25410749dc0269568e2a761a7a14f1d2fc1";

/// (文件偏移, 原字节, 新字节)
const PATCHES: &[(usize, &[u8], &[u8])] = &[
    // mov [esi+eax*4+0x132c], edi  →  call cave_edi
    (
        0x1d02,
        &[0x89, 0xbc, 0x86, 0x2c, 0x13, 0x00, 0x00],
        &[0xe8, 0x6a, 0x01, 0x00, 0x00, 0x90, 0x90],
    ),
    // GetTickCount 之后的 mov ecx, [esi+0x2738]  →  call cave_eax（两处）
    (
        0x1d4a,
        &[0x8b, 0x8e, 0x38, 0x27, 0x00, 0x00],
        &[0xe8, 0xd4, 0x00, 0x00, 0x00, 0x90],
    ),
    (
        0x1d6c,
        &[0x8b, 0x8e, 0x38, 0x27, 0x00, 0x00],
        &[0xe8, 0xb2, 0x00, 0x00, 0x00, 0x90],
    ),
    // cave_eax: and eax, 0x7fffffff; mov ecx, [esi+0x2738]; ret
    (
        0x1e23,
        &[0x90; 12],
        &[
            0x25, 0xff, 0xff, 0xff, 0x7f, 0x8b, 0x8e, 0x38, 0x27, 0x00, 0x00, 0xc3,
        ],
    ),
    // cave_edi: and edi, 0x7fffffff; mov [esi+eax*4+0x132c], edi; ret
    (
        0x1e71,
        &[0x90; 14],
        &[
            0x81, 0xe7, 0xff, 0xff, 0xff, 0x7f, 0x89, 0xbc, 0x86, 0x2c, 0x13, 0x00, 0x00, 0xc3,
        ],
    ),
];

fn sha256(data: &[u8]) -> String {
    format!("{:x}", Sha256::digest(data))
}

fn patch(data: &mut [u8]) -> bool {
    for (off, old, _) in PATCHES {
        if data.get(*off..off + old.len()) != Some(*old) {
            return false;
        }
    }
    for (off, _, new) in PATCHES {
        data[*off..off + new.len()].copy_from_slice(new);
    }
    true
}

/// 给游戏根目录 `root` 里的原版输入管理器打补丁。改了返回 true；
/// 已经改过、不是原版（别人换过）或者文件不存在都返回 false，不报错。
pub fn fix_input_manager(root: &Path) -> RcResultWith<bool> {
    let dll = root.join("Managers").join("Dx5InputManager.dll");
    let Ok(mut data) = std::fs::read(&dll) else {
        return Ok(false);
    };
    if sha256(&data) != ORIGINAL_SHA256 || !patch(&mut data) {
        return Ok(false);
    }
    debug_assert_eq!(sha256(&data), PATCHED_SHA256);
    let backup = dll.with_extension("dll.orig");
    if !backup.exists() {
        std::fs::copy(&dll, &backup)?;
    }
    std::fs::write(&dll, &data)?;
    log::info!("Patched key repeat in {}", dll.display());
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 补丁的原字节/新字节长度一致，且互不重叠
    #[test]
    fn patches_are_well_formed() {
        let mut ranges: Vec<_> = PATCHES
            .iter()
            .map(|(off, old, new)| {
                assert_eq!(old.len(), new.len());
                (*off, off + old.len())
            })
            .collect();
        ranges.sort();
        for pair in ranges.windows(2) {
            assert!(pair[0].1 <= pair[1].0);
        }
    }

    /// 本机装了游戏时（~/Games/Ballance）在副本上验证一遍：原版 → 补丁后哈希对得上
    #[test]
    fn patches_real_dll_when_available() {
        let Some(home) = std::env::var_os("HOME") else {
            return;
        };
        let game = Path::new(&home).join("Games/Ballance/Managers/Dx5InputManager.dll");
        let source = [game.with_extension("dll.orig"), game]
            .into_iter()
            .find(|p| std::fs::read(p).is_ok_and(|d| sha256(&d) == ORIGINAL_SHA256));
        let Some(source) = source else {
            return;
        };
        let dir = std::env::temp_dir().join("rockoon-input-fix-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("Managers")).unwrap();
        let dll = dir.join("Managers/Dx5InputManager.dll");
        std::fs::copy(&source, &dll).unwrap();

        assert!(fix_input_manager(&dir).unwrap());
        assert_eq!(sha256(&std::fs::read(&dll).unwrap()), PATCHED_SHA256);
        assert!(dll.with_extension("dll.orig").exists());
        // 再跑一次什么都不做
        assert!(!fix_input_manager(&dir).unwrap());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
