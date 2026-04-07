use anchor_lang::prelude::*;

#[error_code]
pub enum SettlerError {
    #[msg("Only Deployer can call this instruction")]
    OnlyDeployer,

    #[msg("Only an allowlisted solver can call this instruction")]
    OnlySolver,

    #[msg("Only a allowlisted validator can call this instruction")]
    OnlyValidator,

    #[msg("Only Controller admin can call this instruction")]
    OnlyControllerAdmin,

    #[msg("Provided Axia address is not allowlisted")]
    AxiaNotAllowlisted,

    #[msg("No max fees provided")]
    NoMaxFees,

    #[msg("Validator is not allowlisted")]
    ValidatorNotAllowlisted,

    #[msg("Incorrect intent creator")]
    IncorrectIntentCreator,

    #[msg("Incorrect proposal creator")]
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

    #[msg("Incorrect proposal data")]
    IncorrectProposalData,

    #[msg("Intent has insufficient validations")]
    InsufficientIntentValidations,

    #[msg("Signature verification failed: invalid preinstruction")]
    SigVerificationFailedInvalidPreinstruction,

    #[msg("Signature verification failed: incorrect message")]
    SigVerificationFailedIncorrectMessage,

    #[msg("Signature verification failed: incorrect validator")]
    SigVerificationFailedIncorrectValidator,

    #[msg("Signature verification failed: incorrect Axia")]
    SigVerificationFailedIncorrectAxia,

    #[msg("Incorrect intent for proposal")]
    IncorrectIntentForProposal,

    #[msg("Proposal is not signed by Axia")]
    ProposalIsNotSigned,

    #[msg("Invalid fee mint")]
    InvalidFeeMint,

    #[msg("Fee amount exceeds max fee")]
    FeeAmountExceedsMaxFee,

    #[msg("Unsupported intent op")]
    UnsupportedIntentOp,

    #[msg("Incorrect intent chain id")]
    IncorrectChainId,

    #[msg("Invalid transfer recipient: malformed pubkey")]
    InvalidTransferRecipient,

    #[msg("Incorrect transfer recipient account")]
    IncorrectTransferRecipient,

    #[msg("Invalid transfer token: malformed pubkey")]
    InvalidTransferToken,

    #[msg("Incorrect transfer token mint account")]
    IncorrectTransferToken,

    #[msg("Account not owned by TokenKeg or Token2022 programs")]
    AccountNotOwnedByTokenProgram,

    #[msg("Incorrect recipient token account: mint or authority do not match expected")]
    IncorrectRecipientTokenAccount,

    #[msg("Incorrect user token account: mint or authority do not match expected")]
    IncorrectUserTokenAccount,

    #[msg("Incorrect token program account provided")]
    IncorrectTokenProgram,

    #[msg("Math Error")]
    MathError,
}
