use anchor_lang::prelude::*;

#[error_code]
pub enum SettlerError {
    #[msg("Only Deployer can call this instruction")]
    OnlyDeployer,

    #[msg("Only a whitelisted solver can call this instruction")]
    OnlySolver,

    #[msg("Provided Axia address is not whitelisted")]
    AxiaNotWhitelisted,

    #[msg("Only a whitelisted validator can call this instruction")]
    OnlyValidator,

    #[msg("Validator is not whitelisted")]
    ValidatorNotWhitelisted,

    #[msg("Signer must be intent creator")]
    IncorrectIntentCreator,

    #[msg("Signer must be proposal creator")]
    IncorrectProposalCreator,

    #[msg("Intent is already final")]
    IntentIsFinal,

    #[msg("Intent is not final")]
    IntentIsNotFinal,

    #[msg("Proposal is already final")]
    ProposalIsFinal,

    #[msg("Proposal is not final")]
    ProposalIsNotFinal,

    #[msg("Intent not yet expired. Please wait for the deadline to pass")]
    IntentNotYetExpired,

    #[msg("Intent has already expired")]
    IntentIsExpired,

    #[msg("Proposal not yet expired. Please wait for the deadline to pass")]
    ProposalNotYetExpired,

    #[msg("Proposal has already expired")]
    ProposalIsExpired,

    #[msg("Deadline must be in the future")]
    DeadlineIsInThePast,

    #[msg("Proposal deadline can't be after the Intent's deadline")]
    ProposalDeadlineExceedsIntentDeadline,

    #[msg("Intent has insufficient validations")]
    InsufficientIntentValidations,

    #[msg("Signature verification failed")]
    SigVerificationFailed,

    #[msg("Incorrect intent for proposal")]
    IncorrectIntentForProposal,

    #[msg("Proposal is not signed by Axia")]
    ProposalIsNotSigned,

    #[msg("Invalid fee mint")]
    InvalidFeeMint,

    #[msg("Fee amount exceeds max fee")]
    FeeAmountExceedsMaxFee,

    #[msg("Math Error")]
    MathError,
}
