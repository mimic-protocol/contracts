use anchor_lang::prelude::*;

use crate::{
    errors::ControllerError,
    state::{ControllerSettings, EntityRegistry},
    types::EntityType,
};

#[derive(Accounts)]
#[instruction(entity_type: EntityType, entity_address: Vec<u8>)]
pub struct CloseEntityRegistry<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"entity-registry".as_ref(), &[entity_type as u8], entity_address.as_ref()],
        bump = entity_registry.bump,
        close = admin,
    )]
    pub entity_registry: Box<Account<'info, EntityRegistry>>,

    #[account(
        seeds = [b"controller-settings"],
        bump = controller_settings.bump,
        has_one = admin @ ControllerError::OnlyAdmin
    )]
    pub controller_settings: Box<Account<'info, ControllerSettings>>,

    pub system_program: Program<'info, System>,
}

pub fn close_entity_registry(
    _ctx: Context<CloseEntityRegistry>,
    entity_type: EntityType,
    entity_address: Vec<u8>,
) -> Result<()> {
    emit!(CloseEntityRegistryEvent {
        entity_type,
        entity_address,
        timestamp: Clock::get()?.unix_timestamp as u64,
    });

    Ok(())
}

#[event]
pub struct CloseEntityRegistryEvent {
    pub entity_type: EntityType,
    pub entity_address: Vec<u8>,
    pub timestamp: u64,
}
