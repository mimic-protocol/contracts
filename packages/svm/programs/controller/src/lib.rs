use anchor_lang::prelude::*;

declare_id!("7PwVkjnnapxytWFW69WFDLhfVZZgKhBE9m3zwcDZmncr");

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod types;

use crate::{instructions::*, types::*};

#[program]
pub mod controller {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, admin: Pubkey) -> Result<()> {
        instructions::initialize(ctx, admin)
    }

    pub fn set_admin(ctx: Context<SetAdmin>, new_admin: Pubkey) -> Result<()> {
        instructions::set_admin(ctx, new_admin)
    }

    pub fn set_entity_allowlist_status(
        ctx: Context<SetEntityAllowlistStatus>,
        entity_type: EntityType,
        entity_pubkey: Pubkey,
        status: AllowlistStatus,
    ) -> Result<()> {
        instructions::set_entity_allowlist_status(ctx, entity_type, entity_pubkey, status)
    }
}
