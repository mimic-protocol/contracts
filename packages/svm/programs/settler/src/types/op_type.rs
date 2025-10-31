#[repr(u8)]
pub enum OpType {
    Swap = 1,
    Transfer = 2,
    Call = 3,
}
