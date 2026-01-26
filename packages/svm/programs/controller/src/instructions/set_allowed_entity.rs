use anchor_lang::prelude::*;

use crate::{
    errors::ControllerError,
    state::{ControllerSettings, EntityRegistry},
    types::EntityType,
};

#[derive(Accounts)]
#[instruction(entity_type: EntityType, entity_address: Vec<u8>)]
pub struct SetAllowedEntity<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        seeds = [b"entity-registry".as_ref(), &[entity_type as u8], entity_address.as_ref()],
        bump,
        payer = admin,
        space = 8 + EntityRegistry::size(&entity_address)
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

pub fn set_allowed_entity(
    ctx: Context<SetAllowedEntity>,
    entity_type: EntityType,
    entity_address: Vec<u8>,
) -> Result<()> {
    let entity_registry = &mut ctx.accounts.entity_registry;

    let addr_len = entity_address.len();
    require!(
        addr_len == 32 || addr_len == 20,
        ControllerError::EntityAddressHasWrongSize
    );

    entity_registry.entity_type = entity_type;
    entity_registry.entity_address = entity_address;
    entity_registry.bump = ctx.bumps.entity_registry;

    Ok(())
}
