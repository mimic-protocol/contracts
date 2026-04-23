use anchor_lang::prelude::*;

#[error_code]
pub enum ControllerError {
    #[msg("Only deployer can call this instruction")]
    OnlyDeployer,

    #[msg("Only admin can call this instruction")]
    OnlyAdmin,

    #[msg("Entity address can only be Solana (32 bytes) or Ethereum (20 bytes)")]
    EntityAddressHasWrongSize,

    #[msg("Min validations cannot be zero")]
    MinValidationsCannotBeZero,
}
