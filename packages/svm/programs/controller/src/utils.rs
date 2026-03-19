use anchor_lang::prelude::{program::invoke, *};

pub fn resize_account<'info>(
    from: &AccountInfo<'info>,
    account: &AccountInfo<'info>,
    new_len: usize,
    system_program: &AccountInfo<'info>,
) -> Result<()> {
    let rent = Rent::get()?;
    let needed = rent.minimum_balance(new_len);
    let missing = needed.saturating_sub(account.lamports());

    if missing > 0 {
        invoke(
            &system_instruction::transfer(&from.key(), &account.key(), missing),
            &[from.clone(), account.clone(), system_program.clone()],
        )?;
    }

    account.resize(new_len)?;

    Ok(())
}
