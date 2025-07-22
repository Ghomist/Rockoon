use super::{VtValue, VtValueType};
use std::ops::{Index, IndexMut};

#[derive(Debug)]
pub struct VtColumn {
    pub name: String,
    pub value_type: VtValueType,
    pub values: Vec<VtValue>,
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
