use anchor_lang::prelude::*;
use anchor_spl::{
    token,
    token_2022::{self, TransferChecked},
    token_interface::{self, Mint as IMint, TokenAccount as ITokenAccount},
};

use core::slice::Iter;

use crate::{
    errors::SettlerError,
    state::{Intent, Proposal},
    types::OpType,
    utils::handle_transfer,
};

pub fn handle_intent_execution<'info>(
    intent: &Intent,
    proposal: &Proposal,
    delegate: &AccountInfo<'info>,
    remaining_accounts_iter: &mut Iter<'_, AccountInfo<'info>>,
    token_program: &AccountInfo<'info>,
    token_2022_program: &AccountInfo<'info>,
    delegate_bump: u8,
) -> Result<()> {
    match intent.op {
        OpType::Swap => err!(SettlerError::UnsupportedIntentOp),
        OpType::Transfer => handle_transfer(
            intent,
            proposal,
            delegate,
            remaining_accounts_iter,
            token_program,
            token_2022_program,
            delegate_bump,
        ),
        OpType::EvmCall => err!(SettlerError::UnsupportedIntentOp),
        OpType::SvmCall => err!(SettlerError::UnsupportedIntentOp),
    }
}

/// Deserializes and checks the following remaining_accounts:
///
/// For each fee_token:
///
/// pub fee_token: Account<'info, IMint>,
///
/// #[account(
///     mut,
///     token::owner = solver,
///     token::mint = fee_token
/// )]
/// pub solver_ta: Account<'info, ITokenAccount>,
///
/// #[account(
///     mut,
///     token::owner = user,
///     token::mint = fee_token,
/// )]
/// pub user_ta: Account<'info, ITokenAccount>,
///
pub fn pay_solver_fees<'info>(
    remaining_accounts_iter: &mut Iter<'_, AccountInfo<'info>>,
    intent: &Intent,
    proposal: &Proposal,
    token_program: &AccountInfo<'info>,
    token_2022_program: &AccountInfo<'info>,
    delegate: &AccountInfo<'info>,
    delegate_bump: u8,
) -> Result<()> {
    let delegate_seeds: &[&[u8]] = &[b"delegate", intent.user.as_ref(), &[delegate_bump]];
    let signer_seeds = [delegate_seeds];

    for (fee, max_fee) in proposal.fees.iter().zip(&intent.max_fees) {
        let token_account_info = next_account_info(remaining_accounts_iter)?;
        let solver_ta_account_info = next_account_info(remaining_accounts_iter)?;
        let user_ta_account_info = next_account_info(remaining_accounts_iter)?;

        check_owner_is_token_program(token_account_info)?;
        check_owner_is_token_program(user_ta_account_info)?;
        check_owner_is_token_program(solver_ta_account_info)?;

        let token_mint = {
            let mut token_mint_data: &[u8] = &token_account_info.try_borrow_data()?;
            IMint::try_deserialize(&mut token_mint_data)?
        };

        let user_ta = {
            let mut user_ta_data: &[u8] = &user_ta_account_info.try_borrow_data()?;
            ITokenAccount::try_deserialize(&mut user_ta_data)?
        };

        let solver_ta = {
            let mut solver_ta_data: &[u8] = &solver_ta_account_info.try_borrow_data()?;
            ITokenAccount::try_deserialize(&mut solver_ta_data)?
        };

        require_keys_eq!(
            token_account_info.key(),
            max_fee.token,
            SettlerError::IncorrectFeeToken
        );
        require_keys_eq!(
            user_ta.owner,
            intent.user,
            SettlerError::IncorrectUserTokenAccount
        );
        require_keys_eq!(
            user_ta.mint,
            max_fee.token,
            SettlerError::IncorrectUserTokenAccount
        );
        require_keys_eq!(
            solver_ta.owner,
            proposal.creator,
            SettlerError::IncorrectSolverTokenAccount
        );
        require_keys_eq!(
            solver_ta.mint,
            max_fee.token,
            SettlerError::IncorrectSolverTokenAccount
        );

        // Construct transfer_checked CPI
        let cpi_accounts = TransferChecked {
            authority: delegate.clone(),
            from: user_ta_account_info.clone(),
            mint: token_account_info.clone(),
            to: solver_ta_account_info.clone(),
        };

        let cpi_program = match *token_account_info.owner {
            anchor_spl::token::ID => token_program.clone(),
            anchor_spl::token_2022::ID => token_2022_program.clone(),
            _ => err!(SettlerError::AccountNotOwnedByTokenProgram)?,
        };

        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, &signer_seeds);
        token_interface::transfer_checked(cpi_ctx, *fee, token_mint.decimals)?;
    }

    Ok(())
}

pub fn check_owner_is_token_program<'info>(account_info: &AccountInfo<'info>) -> Result<()> {
    if *account_info.owner != token::ID && *account_info.owner != token_2022::ID {
        err!(SettlerError::AccountNotOwnedByTokenProgram)?;
    }

    Ok(())
}
