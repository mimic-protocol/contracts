use anchor_lang::prelude::*;

use crate::{errors::SettlerError, types::OpType, utils::handle_transfer};

pub fn handle_intent_execution(op: &OpType) -> Result<()> {
    match op {
        OpType::Swap => err!(SettlerError::UnsupportedIntentOp),
        OpType::Transfer => handle_transfer(),
        OpType::EvmCall => err!(SettlerError::UnsupportedIntentOp),
        OpType::SvmCall => err!(SettlerError::UnsupportedIntentOp),
    }
}

pub fn pay_solver_fees() -> Result<()> {
    // TODO
    Ok(())
}
