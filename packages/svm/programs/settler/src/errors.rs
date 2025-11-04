use anchor_lang::prelude::*;

#[error_code]
pub enum SettlerError {
    #[msg("Only Deployer can call this instruction")]
    OnlyDeployer,

    #[msg("Only a whitelisted solver can call this instruction")]
    OnlySolver,

    #[msg("Only a whitelisted Axia address can call this instruction")]
    OnlyAxia,

    #[msg("Only a whitelisted validator can call this instruction")]
    OnlyValidator,

    #[msg("Signer must be intent creator")]
    IncorrectIntentCreator,

    #[msg("Intent is already final")]
    IntentIsFinal,

    #[msg("Proposal is already final")]
    ProposalIsFinal,

    #[msg("Intent not yet expired. Please wait for the deadline to pass")]
    IntentNotYetExpired,

    #[msg("Deadline can't be in the past")]
    DeadlineIsInThePast,
}
