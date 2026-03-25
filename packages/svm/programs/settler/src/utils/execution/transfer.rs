use anchor_lang::prelude::*;

pub fn handle_transfer() -> Result<()> {
    execute_transfer()?;
    validate_transfer()?;

    Ok(())
}

fn execute_transfer() -> Result<()> {
    // TODO
    Ok(())
}

fn validate_transfer() -> Result<()> {
    // TODO
    Ok(())
}
