#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

declare_id!("HbNt35Ng8aM4NUy39evpCQqXEC4Nmaq16ewY8dyNF6NF");

pub mod instructions;
pub mod state;
pub mod errors;
pub mod types;

#[program]
pub mod settler {
    use super::*;
}
