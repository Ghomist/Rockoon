use crate::common::exception::{RcError, RcResultWith};

pub fn find_eos(bytes: &[u8], start: usize) -> RcResultWith<usize> {
    for (i, b) in bytes.iter().enumerate().skip(start) {
        if *b == 0x00 {
            return Ok(i);
        }
    }
    Err(RcError::TdbParseError("Cannot find string's end".into()))
}

pub fn decode(byte: u8) -> u8 {
    let byte = byte.rotate_left(3);
    let byte = byte ^ 0xAF ^ 0xFF;
    if byte == 0xFF {
        0
    } else {
        byte + 1
    }
}

pub fn encode(byte: u8) -> u8 {
    let byte = if byte == 0 { 0xFF } else { byte - 1 };
    let byte = byte ^ 0xFF ^ 0xAF;
    byte.rotate_right(3)
}
