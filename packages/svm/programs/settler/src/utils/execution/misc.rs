use anchor_lang::prelude::*;
use anchor_spl::{token, token_2022};

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
    remaining_accounts: &[AccountInfo<'info>],
    delegate_bump: u8,
) -> Result<()> {
    match intent.op {
        OpType::Swap => err!(SettlerError::UnsupportedIntentOp),
        OpType::Transfer => handle_transfer(
            intent,
            proposal,
            delegate,
            remaining_accounts,
            delegate_bump,
        ),
        OpType::EvmCall => err!(SettlerError::UnsupportedIntentOp),
        OpType::SvmCall => err!(SettlerError::UnsupportedIntentOp),
    }
}

pub fn pay_solver_fees() -> Result<()> {
    // TODO
    Ok(())
}

pub fn check_owner_is_token_program<'info>(account_info: &AccountInfo<'info>) -> Result<()> {
    if *account_info.owner != token::ID && *account_info.owner != token_2022::ID {
        err!(SettlerError::AccountNotOwnedByTokenProgram)?;
    }

    Ok(())
}
