use super::{decode, encode, find_eos, VtColumn, VtTable, VtValue, VtValueType};
use crate::common::exception::{RcError, RcResult, RcResultWith};
use std::{fs, ops::Index};

const PLACEHOLDER: [u8; 4] = [0xFF, 0xFF, 0xFF, 0xFF];
const C_EOS: u8 = 0x00; // c-style end of string

#[derive(Debug)]
pub struct Tdb {
    db_path: String,
    tables: Vec<VtTable>,
}

impl Tdb {
    pub fn new(path: &str) -> Self {
        Self {
            db_path: path.to_string(),
            tables: Vec::new(),
        }
    }

    pub fn load(&mut self) -> RcResult {
        let mut content = fs::read(&self.db_path)?;
        for b in &mut content {
            *b = decode(*b);
        }

        self.tables.clear();

        let mut i: usize = 0;
        while i < content.len() {
            let eos = find_eos(&content, i)?;
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
            let mut table: VtTable = VtTable::new(table_name);
            for _ in 0..col {
                // field name
                let eos = find_eos(&content, i)?;
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
                        let eos = find_eos(&content, i)?;
                        value = &content[i..eos];
                        i = eos + 1;
                    } else {
                        value = &content[i..i + 4];
                        i += 4;
                    }
                    current_col.values.push(VtValue::new(value));
                }
            }

            // assert table size
            assert_eq!(col, table.cols.len());
            assert_eq!(row, table.cols[0].values.len());

            self.tables.push(table);
        }

        Ok(())
    }

    pub fn dump(&self) -> RcResult {
        if self.db_path.is_empty() {
            return Err(RcError::TdbParseError("No path specified".into()));
        }

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

            content.extend_from_slice(&(table.cols.len() as i32).to_le_bytes());
            content.extend_from_slice(&(table.cols[0].values.len() as i32).to_le_bytes());
            content.extend_from_slice(&PLACEHOLDER); // separator

            for col in &table.cols {
                content.extend_from_slice(col.name.as_bytes());
                content.push(C_EOS);
                content.extend_from_slice(&col.value_type.to_int().to_le_bytes());
            }

            for col in &table.cols {
                for v in &col.values {
                    if col.value_type == VtValueType::String {
                        content.extend_from_slice(v.get_slice());
                        content.push(C_EOS);
                    } else {
                        content.extend_from_slice(&v.get_byte_slice());
                    }
                }
            }

            let chunk_size = content.len() - chunk_size_start;
            let chunk_size = (chunk_size as i32).to_le_bytes();
            let target_slice = &mut content[chunk_size_offset..chunk_size_offset + 4];
            target_slice[..4].copy_from_slice(&chunk_size);
        }

        for b in &mut content {
            *b = encode(*b);
        }

        fs::write(&self.db_path, content)?;

        Ok(())
    }

    pub fn get_table(&self, name: &str) -> RcResultWith<&VtTable> {
        for t in &self.tables {
            if t.name == name {
                return Ok(t);
            }
        }
        Err(RcError::TdbParseError("Cannot find table".into()))
    }

    /// find named table, if no table matched, insert a new table and return it
    pub fn get_table_mut(&mut self, name: &str) -> &mut VtTable {
        let table_index = self.tables.iter().position(|t| t.name == name);
        match table_index {
            Some(index) => &mut self.tables[index],
            None => {
                self.tables.push(VtTable::new(name.to_string()));
                self.tables.last_mut().unwrap()
            }
        }
    }
}

impl Index<usize> for Tdb {
    type Output = VtTable;

    fn index(&self, index: usize) -> &Self::Output {
        &self.tables[index]
    }
}
