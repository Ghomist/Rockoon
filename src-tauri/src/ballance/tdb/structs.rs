use std::fs;
use std::ops::Index;
use std::ops::IndexMut;

use super::decode;
use super::find_eos;
use super::utils::encode;

const PLACEHOLDER: [u8; 4] = [0xFF, 0xFF, 0xFF, 0xFF];
const C_EOS: u8 = 0x00; // c-style end of string

#[derive(Debug)]
pub struct TDB {
    db_path: String,
    tables: Vec<VtTable>,
}

#[derive(Debug)]
pub struct VtTable {
    pub name: String,
    pub row_len: usize,
    pub col_len: usize,
    cols: Vec<VtColumn>,
}

#[derive(Debug)]
pub struct VtColumn {
    pub name: String,
    pub value_type: VtValueType,
    values: Vec<VtValue>,
}

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
    fn new(i: i32) -> Self {
        match i {
            1 => Self::Int,
            2 => Self::Float,
            3 => Self::String,
            _ => Self::None,
        }
    }

    fn to_int(&self) -> i32 {
        match self {
            Self::Int => 1,
            Self::Float => 2,
            Self::String => 3,
            Self::None => 0,
        }
    }
}

impl TDB {
    pub fn new(path: &str) -> Self {
        // TODO: 判断文件是否存在
        let mut content = fs::read(path).unwrap();
        for b in &mut content {
            *b = decode(*b);
        }

        let mut db: TDB = Self {
            db_path: path.to_string(),
            tables: Vec::new(),
        };

        let mut i: usize = 0;
        while i < content.len() {
            let eos = find_eos(&content, i);
            let table_name = VtValue::new(&content[i..eos]).to_string();
            i = eos + 1;

            // get table size (yes we don't need this parsing ballance database)
            // let chunk_size = VtValue::new(&content[index..index + 4]).to_usize();
            i += 4;

            // read size
            let col = VtValue::new(&content[i..i + 4]).to_usize();
            i += 4;
            let row = VtValue::new(&content[i..i + 4]).to_usize();
            i += 4;

            // skip four '0xFF' (separator)
            i += 4;

            // make header
            let mut table: VtTable = VtTable::new(table_name, row, col);
            for _ in 0..col {
                // field name
                let eos = find_eos(&content, i);
                let field_name = VtValue::new(&content[i..eos]).to_string();
                i = eos + 1;

                // field type
                let field_type = VtValue::new(&content[i..i + 4]).to_int();
                i += 4;

                // make field
                table.cols.push(VtColumn {
                    name: field_name,
                    value_type: VtValueType::new(field_type),
                    values: Vec::new(),
                });
            }

            // fill data
            for j in 0..col {
                let current_col: &mut VtColumn = &mut table.cols[j];
                for _ in 0..row {
                    let value;
                    if current_col.value_type == VtValueType::String {
                        let eos = find_eos(&content, i);
                        value = &content[i..eos];
                        i = eos + 1;
                    } else {
                        value = &content[i..i + 4];
                        i += 4;
                    }
                    current_col.values.push(VtValue::new(value));
                }
            }

            db.tables.push(table);
        }
        db
    }

    pub fn write(&self) {
        let mut content = Vec::new();

        for table in &self.tables {
            let header = table.name.as_bytes();
            content.extend_from_slice(header);
            content.push(C_EOS);

            // offset to put chunk size
            // we'll set this later
            let chunk_size_offset = content.len();
            content.extend_from_slice(&PLACEHOLDER);

            // chunk size starts here
            let chunk_size_start = chunk_size_offset + 4;

            content.extend_from_slice(&(table.col_len as i32).to_le_bytes());
            content.extend_from_slice(&(table.row_len as i32).to_le_bytes());
            content.extend_from_slice(&PLACEHOLDER); // separator

            for col in &table.cols {
                content.extend_from_slice(col.name.as_bytes());
                content.push(C_EOS);
                content.extend_from_slice(&col.value_type.to_int().to_le_bytes());
            }

            for col in &table.cols {
                for v in &col.values {
                    content.extend_from_slice(&v.slice);
                    if col.value_type == VtValueType::String {
                        content.push(C_EOS);
                    }
                }
            }

            let chunk_size = content.len() - chunk_size_start;
            let chunk_size = (chunk_size as i32).to_le_bytes();
            let target_slice = &mut content[chunk_size_offset..chunk_size_offset + 4];
            for i in 0..4 {
                target_slice[i] = chunk_size[i];
            }
        }

        for b in &mut content {
            *b = encode(*b);
        }

        fs::write(&self.db_path, content).unwrap();
    }

    pub fn get_table(&self, name: &str) -> &VtTable {
        for t in &self.tables {
            if t.name == name {
                return t;
            }
        }
        panic!("Cannot find table");
    }

    pub fn get_table_mut(&mut self, name: &str) -> &mut VtTable {
        for t in &mut self.tables {
            if t.name == name {
                return t;
            }
        }
        panic!("Cannot find table");
    }
}

impl VtTable {
    fn new(name: String, row: usize, col: usize) -> Self {
        Self {
            name,
            row_len: row,
            col_len: col,
            cols: Vec::new(),
        }
    }
}

impl Index<usize> for VtTable {
    type Output = VtColumn;

    fn index(&self, index: usize) -> &Self::Output {
        &self.cols[index]
    }
}

impl IndexMut<usize> for VtTable {
    fn index_mut(&mut self, index: usize) -> &mut Self::Output {
        &mut self.cols[index]
    }
}

impl VtValue {
    pub fn new(slice: &[u8]) -> Self {
        VtValue {
            slice: Vec::from(slice),
        }
    }

    fn get_byte_slice(&self) -> [u8; 4] {
        let s = &self.slice[0..4];
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

    pub fn to_string(&self) -> String {
        String::from_utf8_lossy(&self.slice).to_string()
    }
}

impl Index<usize> for VtColumn {
    type Output = VtValue;

    fn index(&self, index: usize) -> &Self::Output {
        &self.values[index]
    }
}

impl IndexMut<usize> for VtColumn {
    fn index_mut(&mut self, index: usize) -> &mut VtValue {
        &mut self.values[index]
    }
}

impl std::ops::Index<usize> for TDB {
    type Output = VtTable;

    fn index(&self, index: usize) -> &Self::Output {
        &self.tables[index]
    }
}
