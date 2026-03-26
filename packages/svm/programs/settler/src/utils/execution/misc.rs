use anchor_lang::prelude::*;

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
