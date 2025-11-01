use anchor_lang::prelude::*;

declare_id!("7PwVkjnnapxytWFW69WFDLhfVZZgKhBE9m3zwcDZmncr");

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod types;

use crate::{instructions::*, types::*};

#[program]
pub mod whitelist {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        admin: Pubkey,
        proposed_admin_cooldown: u64,
    ) -> Result<()> {
        instructions::initialize(ctx, admin, proposed_admin_cooldown)
    }

    pub fn propose_admin(ctx: Context<ProposeAdmin>, proposed_admin: Pubkey) -> Result<()> {
        instructions::propose_admin(ctx, proposed_admin)
    }

    pub fn set_entity_whitelist_status(
        ctx: Context<SetEntityWhitelistStatus>,
        entity_type: EntityType,
        entity_pubkey: Pubkey,
        status: WhitelistStatus,
    ) -> Result<()> {
        instructions::set_entity_whitelist_status(ctx, entity_type, entity_pubkey, status)
    }

    pub fn set_proposed_admin(ctx: Context<SetProposedAdmin>) -> Result<()> {
        instructions::set_proposed_admin(ctx)
    }
}
