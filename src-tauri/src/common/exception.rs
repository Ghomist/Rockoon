use serde::{ser::Serializer, Serialize};

#[derive(thiserror::Error, Debug)]
pub enum RcError {
    #[error("io error: {0}")]
    IOError(#[from] std::io::Error),
    #[error("zip error: {0}")]
    ZipError(#[from] zip::result::ZipError),
    #[error("tauri error: {0}")]
    TauriError(#[from] tauri::Error),
    #[error("tdb parse error: {0}")]
    TdbParseError(String),
    #[error("other error: {0}")]
    Other(String),
}

impl Serialize for RcError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

pub type RcResult = Result<(), RcError>;
pub type RcResultWith<T> = Result<T, RcError>;
