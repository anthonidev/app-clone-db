use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Creates a Command with platform-specific settings to hide console windows on Windows
pub fn create_command(program: &str) -> Command {
    let mut cmd = Command::new(program);

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    cmd
}
