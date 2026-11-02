"use strict";

const browserChoices = document.querySelectorAll('input[name="browser"]');
const extensionsAddress = document.getElementById("extensions-address");
const copyAddress = document.getElementById("copy-address");
const copyStatus = document.getElementById("copy-status");
const developerModeHint = document.getElementById("developer-mode-hint");

const browsers = {
  chrome: { address: "chrome://extensions", hint: "Developer mode is in the top-right corner." },
  edge: { address: "edge://extensions", hint: "Developer mode is in the left sidebar." },
  brave: { address: "brave://extensions", hint: "Developer mode is in the top-right corner." }
};

for (const choice of browserChoices) {
  choice.addEventListener("change", () => {
    if (!choice.checked) return;
    const browser = browsers[choice.value];
    extensionsAddress.value = browser.address;
    developerModeHint.textContent = browser.hint;
    copyStatus.textContent = "";
  });
}

copyAddress.addEventListener("click", async () => {
  const restoreFocus = document.activeElement === copyAddress;
  copyAddress.disabled = true;
  copyStatus.textContent = "";
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(extensionsAddress.value);
    copyStatus.textContent = "Address copied. Paste it into your browser’s address bar.";
  } catch {
    // Local-file clipboard access varies by browser; leave a usable manual path.
    extensionsAddress.focus();
    extensionsAddress.select();
    copyStatus.textContent = "Select and copy the address above, then paste it into your browser’s address bar.";
  } finally {
    copyAddress.disabled = false;
    if (restoreFocus && document.activeElement === document.body) copyAddress.focus({ preventScroll: true });
  }
});
