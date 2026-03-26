use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::TransferChecked,
    token_interface::{self, Mint as IMint, TokenAccount as ITokenAccount},
};

use crate::{
    errors::SettlerError,
    state::{Intent, Proposal},
    types::SvmTransferIntentData,
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
    execute_transfer(
        &intent.user,
        delegate,
        remaining_accounts,
        &decoded_intent_data,
        &[delegate_seeds],
    )?;

    Ok(())
}

fn execute_transfer<'info>(
    user: &Pubkey,
    delegate: &AccountInfo<'info>,
    remaining_accounts: &[AccountInfo<'info>],
    intent_data: &SvmTransferIntentData,
    delegate_seeds: &[&[&[u8]]],
) -> Result<()> {
    let mut remaining_accounts_iter = remaining_accounts.iter();

    let token_program = next_account_info(&mut remaining_accounts_iter)?;
    let token_2022_program = next_account_info(&mut remaining_accounts_iter)?;

    require_keys_eq!(token_program.key(), anchor_spl::token::ID);
    require_keys_eq!(token_2022_program.key(), anchor_spl::token_2022::ID);

    for transfer in &intent_data.transfers {
        let token_account_info = next_account_info(&mut remaining_accounts_iter)?;
        let recipient_account_info = next_account_info(&mut remaining_accounts_iter)?;
        let recipient_ta_account_info = next_account_info(&mut remaining_accounts_iter)?;
        let user_ta_account_info = next_account_info(&mut remaining_accounts_iter)?;

        let mut token_data: &[u8] = &token_account_info.try_borrow_data()?;
        let token_mint = IMint::try_deserialize(&mut token_data)?;

        let mut recipient_ta_data: &[u8] = &recipient_ta_account_info.try_borrow_data()?;
        let recipient_ta = ITokenAccount::try_deserialize(&mut recipient_ta_data)?;

        let mut user_ta_data: &[u8] = &user_ta_account_info.try_borrow_data()?;
        let user_ta = ITokenAccount::try_deserialize(&mut user_ta_data)?;

        let transfer_recipient = Pubkey::try_from(transfer.recipient.as_slice())
            .map_err(|_| error!(SettlerError::InvalidTransferRecipient))?;

        let transfer_token = Pubkey::try_from(transfer.token.as_slice())
            .map_err(|_| error!(SettlerError::InvalidTransferToken))?;

        require_keys_eq!(transfer_recipient, recipient_account_info.key());
        require_keys_eq!(transfer_token, token_account_info.key());
        require_keys_eq!(recipient_ta.owner, recipient_account_info.key());
        require_keys_eq!(recipient_ta.mint, token_account_info.key());
        require_keys_eq!(user_ta.owner, *user);
        require_keys_eq!(user_ta.mint, token_account_info.key());

        let cpi_accounts = TransferChecked {
            authority: delegate.clone(),
            from: user_ta_account_info.clone(),
            mint: token_account_info.clone(),
            to: recipient_ta_account_info.clone(),
        };

        let cpi_program = if *token_account_info.owner == anchor_spl::token::ID {
            token_program.clone()
        } else {
            token_2022_program.clone()
        };

        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, delegate_seeds);
        token_interface::transfer_checked(cpi_ctx, transfer.amount, token_mint.decimals)?;
    }

    Ok(())
}

fn validate_transfer(proposal: &Proposal, intent_data: &SvmTransferIntentData) -> Result<()> {
    require_eq!(intent_data.chain_id, 507424, SettlerError::IncorrectChainId);
    require_eq!(proposal.instructions.len(), 0);

    Ok(())
}
