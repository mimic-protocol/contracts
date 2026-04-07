use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::TransferChecked,
    token_interface::{self, Mint as IMint, TokenAccount as ITokenAccount},
};

use core::slice::Iter;

use crate::{
    errors::SettlerError,
    state::{Intent, Proposal},
    types::{SvmTransfer, SvmTransferIntentData},
    utils::check_owner_is_token_program,
};

pub fn handle_transfer<'info>(
    intent: &Intent,
    proposal: &Proposal,
    delegate: &AccountInfo<'info>,
    remaining_accounts: &[AccountInfo<'info>],
    delegate_bump: u8,
) -> Result<()> {
    let decoded_intent_data = SvmTransferIntentData::try_from_slice(&intent.data)?;

    validate_transfer(proposal, &decoded_intent_data)?;

    let delegate_seeds: &[&[u8]] = &[b"delegate", intent.user.as_ref(), &[delegate_bump]];
    execute_transfers(
        intent.user,
        delegate,
        remaining_accounts,
        &decoded_intent_data,
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
    remaining_accounts: &[AccountInfo<'info>],
    intent_data: &SvmTransferIntentData,
    delegate_seeds: &[&[&[u8]]],
) -> Result<()> {
    let mut remaining_accounts_iter = remaining_accounts.iter();

    let token_program = next_account_info(&mut remaining_accounts_iter)?;
    let token_2022_program = next_account_info(&mut remaining_accounts_iter)?;

    require_keys_eq!(
        token_program.key(),
        anchor_spl::token::ID,
        SettlerError::IncorrectTokenProgram
    );
    require_keys_eq!(
        token_2022_program.key(),
        anchor_spl::token_2022::ID,
        SettlerError::IncorrectTokenProgram
    );

    for transfer in &intent_data.transfers {
        execute_transfer(
            transfer,
            delegate,
            &mut remaining_accounts_iter,
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
    let token_account_info = next_account_info(remaining_accounts_iter)?;
    let recipient_account_info = next_account_info(remaining_accounts_iter)?;
    let recipient_ta_account_info = next_account_info(remaining_accounts_iter)?;
    let user_ta_account_info = next_account_info(remaining_accounts_iter)?;

    check_owner_is_token_program(recipient_ta_account_info)?;
    check_owner_is_token_program(user_ta_account_info)?;

    let token_mint = {
        let token_data: &[u8] = &token_account_info.try_borrow_data()?;
        let mut token_data_ref: &[u8] = &token_data;
        IMint::try_deserialize(&mut token_data_ref)?
    };

    let recipient_ta = {
        let recipient_ta_data = recipient_ta_account_info.try_borrow_data()?;
        let mut recipient_ta_data_ref: &[u8] = &recipient_ta_data;
        ITokenAccount::try_deserialize(&mut recipient_ta_data_ref)?
    };

    let user_ta = {
        let user_ta_data = user_ta_account_info.try_borrow_data()?;
        let mut user_ta_data_ref: &[u8] = &user_ta_data;
        ITokenAccount::try_deserialize(&mut user_ta_data_ref)?
    };

    let transfer_recipient = Pubkey::try_from(transfer.recipient.as_slice())
        .map_err(|_| error!(SettlerError::InvalidTransferRecipient))?;

    let transfer_token = Pubkey::try_from(transfer.token.as_slice())
        .map_err(|_| error!(SettlerError::InvalidTransferToken))?;

    require_keys_eq!(
        transfer_recipient,
        recipient_account_info.key(),
        SettlerError::IncorrectTransferRecipient
    );
    require_keys_eq!(
        transfer_token,
        token_account_info.key(),
        SettlerError::IncorrectTransferToken
    );
    require_keys_eq!(
        recipient_ta.owner,
        recipient_account_info.key(),
        SettlerError::IncorrectRecipientTokenAccount
    );
    require_keys_eq!(
        recipient_ta.mint,
        token_account_info.key(),
        SettlerError::IncorrectRecipientTokenAccount
    );
    require_keys_eq!(user_ta.owner, user, SettlerError::IncorrectUserTokenAccount);
    require_keys_eq!(
        user_ta.mint,
        token_account_info.key(),
        SettlerError::IncorrectUserTokenAccount
    );

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

fn validate_transfer(proposal: &Proposal, intent_data: &SvmTransferIntentData) -> Result<()> {
    require_eq!(intent_data.chain_id, 507424, SettlerError::IncorrectChainId);
    require_eq!(
        proposal.instructions.len(),
        0,
        SettlerError::IncorrectProposalData
    );

    Ok(())
}
