use anchor_lang::prelude::*;
use crate::errors::SettlerError;

#[inline]
pub fn add(a: usize, b: usize) -> Result<usize> {
    Ok(a.checked_add(b).ok_or(SettlerError::MathError)?)
}

#[inline]
pub fn sub(a: usize, b: usize) -> Result<usize> {
    Ok(a.checked_sub(b).ok_or(SettlerError::MathError)?)
}

#[inline]
pub fn mul(a: usize, b: usize) -> Result<usize> {
    Ok(a.checked_mul(b).ok_or(SettlerError::MathError)?)
}
