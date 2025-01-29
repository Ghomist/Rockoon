pub fn find_eos(bytes: &[u8], start: usize) -> usize {
    for i in start..bytes.len() {
        if bytes[i] == 0x00 {
            return i;
        }
    }
    panic!("Cannot find string's end")
}

pub fn decode(byte: u8) -> u8 {
    let byte = byte << 3 | byte >> 5;
    let byte = byte ^ 0xAF ^ 0xFF;
    let byte = if byte == 0xFF { 0 } else { byte + 1 };
    byte
}

pub fn encode(byte: u8) -> u8 {
    let byte = if byte == 0 { 0xFF } else { byte - 1 };
    let byte = byte ^ 0xFF ^ 0xAF;
    let byte = byte << 5 | byte >> 3;
    byte
}
