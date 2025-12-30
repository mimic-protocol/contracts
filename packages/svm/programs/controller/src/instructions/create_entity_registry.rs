use anchor_lang::prelude::*;

use crate::{
    errors::ControllerError,
    state::{ControllerSettings, EntityRegistry},
    types::EntityType,
};

#[derive(Accounts)]
#[instruction(entity_type: EntityType, entity_pubkey: Pubkey)]
pub struct CreateEntityRegistry<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        seeds = [b"entity-registry".as_ref(), &[entity_type as u8], entity_pubkey.as_ref()],
        bump,
        payer = admin,
        space = 8 + EntityRegistry::INIT_SPACE
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

pub fn create_entity_registry(
    ctx: Context<CreateEntityRegistry>,
    entity_type: EntityType,
    entity_pubkey: Pubkey,
) -> Result<()> {
    let entity_registry = &mut ctx.accounts.entity_registry;

    entity_registry.entity_type = entity_type;
    entity_registry.entity_pubkey = entity_pubkey;
    entity_registry.bump = ctx.bumps.entity_registry;

    Ok(())
}
