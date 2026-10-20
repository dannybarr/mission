/** Only native, non-sensitive error categories are shown on the lock screen. */
export function unlockError(error: unknown): string {
  const reason = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  switch (reason) {
    case "Passphrase did not unlock this Mission card":
      return "This passphrase did not unlock the card. Check keyboard layout and spacing, then try the original passphrase. No memory was changed.";
    case "Invalid vault or passphrase":
      return "The card header or encrypted memory failed an integrity check. Keep the USB connected; do not reset it yet.";
    case "Storage operation failed":
      return "Mission could not read the USB vault. Check the drive connection and available space. Do not reset it yet.";
    case "Invalid input":
      return "The vault format could not be read by this version of Mission. Do not reset it yet.";
    case "Access denied":
      return "Mission could not verify this removable device. Reconnect it and select the correct USB.";
    case "Vault unavailable or locked":
      return "The USB or Mission session changed while opening. Keep the drive connected and try again.";
    default:
      return "Mission could not open this vault. Its contents were not reset. Please report this message before wiping the card.";
  }
}
