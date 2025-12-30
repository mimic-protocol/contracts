use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ChangeControllerProgram {}

pub fn change_controller_program(ctx: Context<ChangeControllerProgram>) -> Result<()> {
    // TODO: check against crate::controller::ID
    Ok(())
}
