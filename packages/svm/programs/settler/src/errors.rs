use anchor_lang::prelude::*;

#[error_code]
pub enum SettlerError {
    #[msg("Only Deployer can call this instruction")]
    OnlyDeployer,
}
