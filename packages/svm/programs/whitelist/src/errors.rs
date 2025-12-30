use anchor_lang::prelude::*;

#[error_code]
pub enum WhitelistError {
    #[msg("Only deployer can call this instruction")]
    OnlyDeployer,

    #[msg("Only admin can call this instruction")]
    OnlyAdmin,

    #[msg("Math error")]
    MathError,
}
