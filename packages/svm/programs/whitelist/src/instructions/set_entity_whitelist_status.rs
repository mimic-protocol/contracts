use anchor_lang::prelude::*;

use crate::{
    errors::WhitelistError,
    state::{EntityRegistry, GlobalSettings},
    types::{EntityType, WhitelistStatus},
};

#[derive(Accounts)]
#[instruction(entity_type: u8, entity_pubkey: Pubkey)]
pub struct SetEntityWhitelistStatus<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init_if_needed,
        seeds = [b"entity-registry", entity_type.to_le_bytes().as_ref(), entity_pubkey.as_ref()],
        bump,
        payer = admin,
        space = 8 + EntityRegistry::INIT_SPACE
    )]
    pub entity_registry: Box<Account<'info, EntityRegistry>>,

    #[account(
        seeds = [b"global-settings"],
        bump = global_settings.bump,
        has_one = admin @ WhitelistError::OnlyAdmin
    )]
    pub global_settings: Box<Account<'info, GlobalSettings>>,

    pub system_program: Program<'info, System>,
}

pub fn set_entity_whitelist_status(
    ctx: Context<SetEntityWhitelistStatus>,
    entity_type: EntityType,
    entity_pubkey: Pubkey,
    status: WhitelistStatus,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;
    let entity_registry = &mut ctx.accounts.entity_registry;

    if entity_registry.last_update == 0 {
        entity_registry.entity_type = entity_type;
        entity_registry.entity_pubkey = entity_pubkey;
        entity_registry.bump = ctx.bumps.entity_registry;
    }
    entity_registry.status = status;
    entity_registry.last_update = now;
    entity_registry.updated_by = ctx.accounts.admin.key();

    emit!(SetEntityWhitelistStatusEvent {
        entity_type,
        entity_pubkey,
        status,
        timestamp: now,
        updated_by: entity_registry.updated_by,
    });

    Ok(())
}

#[event]
pub struct SetEntityWhitelistStatusEvent {
    pub entity_type: EntityType,
    pub entity_pubkey: Pubkey,
    pub status: WhitelistStatus,
    pub timestamp: u64,
    pub updated_by: Pubkey,
}
