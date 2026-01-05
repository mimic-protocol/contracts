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

    pub fn set_allowed_entity(
        ctx: Context<SetAllowedEntity>,
        entity_type: EntityType,
        entity_pubkey: Pubkey,
    ) -> Result<()> {
        instructions::set_allowed_entity(ctx, entity_type, entity_pubkey)
    }

    pub fn close_entity_registry(
        ctx: Context<CloseEntityRegistry>,
        entity_type: EntityType,
        entity_pubkey: Pubkey,
    ) -> Result<()> {
        instructions::close_entity_registry(ctx, entity_type, entity_pubkey)
    }
}
