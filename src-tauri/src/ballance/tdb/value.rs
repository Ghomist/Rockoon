use std::fmt::Display;

#[derive(Debug)]
pub struct VtValue {
    slice: Vec<u8>,
}

#[derive(PartialEq, Debug)]
pub enum VtValueType {
    None,
    Int,
    Float,
    String,
}

impl VtValueType {
    pub fn new(i: i32) -> Self {
        match i {
            1 => Self::Int,
            2 => Self::Float,
            3 => Self::String,
            _ => Self::None,
        }
    }

    pub fn to_int(&self) -> i32 {
        match self {
            Self::Int => 1,
            Self::Float => 2,
            Self::String => 3,
            Self::None => 0,
        }
    }
}

impl VtValue {
    pub fn new(slice: &[u8]) -> Self {
        VtValue {
            slice: Vec::from(slice),
        }
    }

    pub fn new_float(f: f32) -> Self {
        VtValue {
            slice: f.to_le_bytes().to_vec(),
        }
    }

    pub fn new_string(s: &str) -> Self {
        VtValue {
            slice: s.as_bytes().to_vec(),
        }
    }

    pub fn new_int(i: i32) -> Self {
        VtValue {
            slice: i.to_le_bytes().to_vec(),
        }
    }

    pub fn new_bool(b: bool) -> Self {
        VtValue {
            slice: (b as i32).to_le_bytes().to_vec(),
        }
    }

    pub fn get_slice(&self) -> &[u8] {
        &self.slice
    }

    pub fn get_byte_slice(&self) -> [u8; 4] {
        let s = &self.slice[..4];
        [s[0], s[1], s[2], s[3]]
    }

    pub fn to_float(&self) -> f32 {
        f32::from_le_bytes(self.get_byte_slice())
    }

    pub fn to_int(&self) -> i32 {
        i32::from_le_bytes(self.get_byte_slice())
    }

    pub fn to_usize(&self) -> usize {
        self.to_int() as usize
    }

    pub fn to_bool(&self) -> bool {
        self.to_int() != 0
    }
}

impl Display for VtValue {
    /// implement for `to_string()`
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", String::from_utf8_lossy(&self.slice))
    }
}
