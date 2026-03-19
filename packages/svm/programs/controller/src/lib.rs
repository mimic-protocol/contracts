use anchor_lang::prelude::*;

declare_id!("DL2RrwABRChbMFawCu5tGZ6VavM3RZgiGHEbu7PP47fK");

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod types;
pub mod utils;

use crate::{instructions::*, types::*};

#[program]
pub mod controller {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, admin: Pubkey, min_validations: u16) -> Result<()> {
        instructions::initialize(ctx, admin, min_validations)
    }

    pub fn resize_settings(ctx: Context<ResizeSettings>) -> Result<()> {
        instructions::resize_settings(ctx)
    }

    pub fn set_admin(ctx: Context<SetAdmin>, new_admin: Pubkey) -> Result<()> {
        instructions::set_admin(ctx, new_admin)
    }

    pub fn set_min_validations(
        ctx: Context<SetMinValidations>,
        new_min_validations: u16,
    ) -> Result<()> {
        instructions::set_min_validations(ctx, new_min_validations)
    }

    pub fn set_allowed_entity(
        ctx: Context<SetAllowedEntity>,
        entity_type: EntityType,
        entity_address: Vec<u8>,
    ) -> Result<()> {
        instructions::set_allowed_entity(ctx, entity_type, entity_address)
    }

    pub fn close_entity_registry(
        ctx: Context<CloseEntityRegistry>,
        entity_type: EntityType,
        entity_address: Vec<u8>,
    ) -> Result<()> {
        instructions::close_entity_registry(ctx, entity_type, entity_address)
    }
}
