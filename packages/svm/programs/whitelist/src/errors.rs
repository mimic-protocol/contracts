use anchor_lang::prelude::*;

#[error_code]
pub enum WhitelistError {
    #[msg("Only deployer can call this instruction")]
    OnlyDeployer,

    #[msg("Only admin can call this instruction")]
    OnlyAdmin,

    #[msg("Only proposed admin can call this instruction")]
    OnlyProposedAdmin,

    #[msg("Proposed admin is already set")]
    ProposedAdminIsAlreadySet,

    #[msg("Can't set proposed admin - either no next admin is proposed or cooldown period is not over yet")]
    SetProposedAdminError,

    #[msg("Cooldown too large")]
    CooldownTooLarge,

    #[msg("Cooldown can't be zero")]
    CooldownCantBeZero,

    #[msg("Math error")]
    MathError,
}
