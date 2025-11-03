pub const DEPLOYER_KEY: &'static str = env!(
    "DEPLOYER_KEY",
    "Please set the DEPLOYER_KEY env variable before compiling."
);

pub const MAX_COOLDOWN: u64 = 3600 * 24 * 30;
