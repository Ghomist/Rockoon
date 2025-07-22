use super::VtColumn;
use std::ops::{Index, IndexMut};

#[derive(Debug)]
pub struct VtTable {
    pub name: String,
    pub cols: Vec<VtColumn>,
}

impl VtTable {
    pub fn new(name: String) -> Self {
        Self {
            name,
            cols: Vec::new(),
        }
    }

    pub fn add_column(&mut self, index: usize, column: VtColumn) -> &mut VtColumn {
        self.cols.insert(index, column);
        &mut self.cols[index]
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
