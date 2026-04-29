use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::TransferChecked,
    token_interface::{self, Mint as IMint, TokenAccount as ITokenAccount},
};

use core::slice::Iter;

use crate::{
    constants::CHAIN_ID, errors::SettlerError, state::{Intent, Proposal}, types::{SvmTransfer, SvmTransferIntentData}, utils::check_owner_is_token_program
};

pub fn handle_transfer<'info>(
    intent: &Intent,
    proposal: &Proposal,
    delegate: &AccountInfo<'info>,
    remaining_accounts_iter: &mut Iter<'_, AccountInfo<'info>>,
    token_program: &AccountInfo<'info>,
    token_2022_program: &AccountInfo<'info>,
    delegate_bump: u8,
) -> Result<()> {
    let decoded_intent_data = SvmTransferIntentData::try_from_slice(&intent.data)?;

    validate_transfer(proposal, &decoded_intent_data)?;

    let delegate_seeds: &[&[u8]] = &[b"delegate", intent.user.as_ref(), &[delegate_bump]];
    execute_transfers(
        intent.user,
        delegate,
        remaining_accounts_iter,
        &decoded_intent_data,
        token_program,
        token_2022_program,
        &[delegate_seeds],
    )?;

    Ok(())
}

/// Deserializes and checks the following remaining_accounts:
///
/// pub token_program: Program<'info, Token>,
///
/// pub token_2022_program: Program<'info, Token2022>,
///
fn execute_transfers<'info>(
    user: Pubkey,
    delegate: &AccountInfo<'info>,
    remaining_accounts_iter: &mut Iter<'_, AccountInfo<'info>>,
    intent_data: &SvmTransferIntentData,
    token_program: &AccountInfo<'info>,
    token_2022_program: &AccountInfo<'info>,
    delegate_seeds: &[&[&[u8]]],
) -> Result<()> {
    for transfer in &intent_data.transfers {
        execute_transfer(
            transfer,
            delegate,
            remaining_accounts_iter,
            delegate_seeds,
            user,
            token_program,
            token_2022_program,
        )?;
    }

    Ok(())
}

/// Deserializes and checks the following remaining_accounts:
///
/// #[account(
///     address = transfer.token,
/// )]
/// pub token: Account<'info, Mint>,
///
/// #[account(
///     address = transfer.recipient,
/// )]
/// pub recipient: AccountInfo<'info>,
///
/// #[account(
///     mut,
///     token::authority = recipient,
///     token::mint = token,
/// )]
/// pub recipient_token_account: Account<'info, TokenAccount>,
///
/// #[account(
///     mut,
///     token::authority = user,
///     token::mint = token,
/// )]
/// NOTE: must have PDA delegate approved and amount at least transfer.amount
/// pub user_token_account: Account<'info, TokenAccount>,
///
fn execute_transfer<'info>(
    transfer: &SvmTransfer,
    delegate: &AccountInfo<'info>,
    remaining_accounts_iter: &mut Iter<'_, AccountInfo<'info>>,
    delegate_seeds: &[&[&[u8]]],
    user: Pubkey,
    token_program: &AccountInfo<'info>,
    token_2022_program: &AccountInfo<'info>,
) -> Result<()> {
    // Read remaining accounts
    let token_account_info = next_account_info(remaining_accounts_iter)?;
    let recipient_account_info = next_account_info(remaining_accounts_iter)?;
    let recipient_ta_account_info = next_account_info(remaining_accounts_iter)?;
    let user_ta_account_info = next_account_info(remaining_accounts_iter)?;

    // Check account ownership
    check_owner_is_token_program(token_account_info)?;
    check_owner_is_token_program(recipient_ta_account_info)?;
    check_owner_is_token_program(user_ta_account_info)?;

    // Check account layout
    let token_mint = {
        let mut token_data: &[u8] = &token_account_info.try_borrow_data()?;
        IMint::try_deserialize(&mut token_data)?
    };

    let recipient_ta = {
        let mut recipient_ta_data: &[u8] = &recipient_ta_account_info.try_borrow_data()?;
        ITokenAccount::try_deserialize(&mut recipient_ta_data)?
    };

    let user_ta = {
        let mut user_ta_data: &[u8] = &user_ta_account_info.try_borrow_data()?;
        ITokenAccount::try_deserialize(&mut user_ta_data)?
    };

    // Check logical constraints
    check_token_accounts(
        recipient_account_info.key(),
        token_account_info.key(),
        user,
        &recipient_ta,
        &user_ta,
        &transfer.recipient,
        &transfer.token,
    )?;

    // Construct transfer_checked CPI
    let cpi_accounts = TransferChecked {
        authority: delegate.clone(),
        from: user_ta_account_info.clone(),
        mint: token_account_info.clone(),
        to: recipient_ta_account_info.clone(),
    };

    let cpi_program = match *token_account_info.owner {
        anchor_spl::token::ID => token_program.clone(),
        anchor_spl::token_2022::ID => token_2022_program.clone(),
        _ => err!(SettlerError::AccountNotOwnedByTokenProgram)?,
    };

    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, delegate_seeds);
    token_interface::transfer_checked(cpi_ctx, transfer.amount, token_mint.decimals)
}

/// Checks token accounts have correct owner and mint, and that they equal expected values per transfer struct
fn check_token_accounts(
    recipient: Pubkey,
    token: Pubkey,
    user: Pubkey,
    recipient_ta: &ITokenAccount,
    user_ta: &ITokenAccount,
    expected_recipient: &[u8],
    expected_token: &[u8],
) -> Result<()> {
    let expected_recipient_pubkey = Pubkey::try_from(expected_recipient)
        .map_err(|_| error!(SettlerError::InvalidTransferRecipient))?;

    let expected_token_pubkey =
        Pubkey::try_from(expected_token).map_err(|_| error!(SettlerError::InvalidTransferToken))?;

    require_keys_eq!(
        recipient,
        expected_recipient_pubkey,
        SettlerError::IncorrectTransferRecipient
    );

    require_keys_eq!(
        token,
        expected_token_pubkey,
        SettlerError::IncorrectTransferToken
    );

    require_keys_eq!(
        recipient_ta.owner,
        expected_recipient_pubkey,
        SettlerError::IncorrectRecipientTokenAccount
    );

    require_keys_eq!(
        recipient_ta.mint,
        expected_token_pubkey,
        SettlerError::IncorrectRecipientTokenAccount
    );

    require_keys_eq!(user_ta.owner, user, SettlerError::IncorrectUserTokenAccount);

    require_keys_eq!(
        user_ta.mint,
        expected_token_pubkey,
        SettlerError::IncorrectUserTokenAccount
    );

    Ok(())
}

fn validate_transfer(proposal: &Proposal, intent_data: &SvmTransferIntentData) -> Result<()> {
    require_eq!(intent_data.chain_id, CHAIN_ID, SettlerError::IncorrectChainId);
    require_eq!(
        proposal.instructions.len(),
        0,
        SettlerError::IncorrectProposalData
    );

    Ok(())
}
