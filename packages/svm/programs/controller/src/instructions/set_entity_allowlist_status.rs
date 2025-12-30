use anchor_lang::prelude::*;

use crate::{
    errors::ControllerError,
    state::{EntityRegistry, GlobalSettings},
    types::{AllowlistStatus, EntityType},
};

#[derive(Accounts)]
#[instruction(entity_type: EntityType, entity_pubkey: Pubkey)]
pub struct SetEntityAllowlistStatus<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init_if_needed,
        seeds = [b"entity-registry".as_ref(), &[entity_type as u8], entity_pubkey.as_ref()],
        bump,
        payer = admin,
        space = 8 + EntityRegistry::INIT_SPACE
    )]
    pub entity_registry: Box<Account<'info, EntityRegistry>>,

    #[account(
        seeds = [b"global-settings"],
        bump = global_settings.bump,
        has_one = admin @ ControllerError::OnlyAdmin
    )]
    pub global_settings: Box<Account<'info, GlobalSettings>>,

    pub system_program: Program<'info, System>,
}

pub fn set_entity_allowlist_status(
    ctx: Context<SetEntityAllowlistStatus>,
    entity_type: EntityType,
    entity_pubkey: Pubkey,
    status: AllowlistStatus,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;
    let entity_registry = &mut ctx.accounts.entity_registry;

    if entity_registry.bump == 0 {
        entity_registry.entity_type = entity_type;
        entity_registry.entity_pubkey = entity_pubkey;
        entity_registry.bump = ctx.bumps.entity_registry;
    }
    entity_registry.status = status;

    emit!(SetEntityAllowlistStatusEvent {
        entity_type,
        entity_pubkey,
        status,
        timestamp: now,
    });

    Ok(())
}

#[event]
pub struct SetEntityAllowlistStatusEvent {
    pub entity_type: EntityType,
    pub entity_pubkey: Pubkey,
    pub status: AllowlistStatus,
    pub timestamp: u64,
}
