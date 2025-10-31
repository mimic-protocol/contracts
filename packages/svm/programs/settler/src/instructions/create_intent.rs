use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CreateIntent {

}

pub fn add_axia_sig(ctx: Context<CreateIntent>) -> Result<()> {
    Ok(())
}
