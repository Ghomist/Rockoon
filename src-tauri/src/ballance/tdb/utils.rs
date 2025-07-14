pub fn find_eos(bytes: &[u8], start: usize) -> usize {
    for (i, b) in bytes.iter().enumerate().skip(start) {
        if *b == 0x00 {
            return i;
        }
    }
    panic!("Cannot find string's end")
}

pub fn decode(byte: u8) -> u8 {
    let byte = byte.rotate_left(3) | byte.rotate_right(5);
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
    byte.rotate_right(5) | byte.rotate_left(3)
}
