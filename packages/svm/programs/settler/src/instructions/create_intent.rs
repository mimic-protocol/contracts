use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CreateIntent {

}

pub fn create_intent(ctx: Context<CreateIntent>) -> Result<()> {
    Ok(())
}
