use anchor_lang::prelude::*;

#[error_code]
pub enum ControllerError {
    #[msg("Only deployer can call this instruction")]
    OnlyDeployer,

    #[msg("Only admin can call this instruction")]
    OnlyAdmin,
}
