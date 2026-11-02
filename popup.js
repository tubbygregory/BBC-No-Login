"use strict";

const preference = document.getElementById("never-reminders");
const reset = document.getElementById("allow-reminders");
const status = document.getElementById("status");
let current = false;
let revision = 0;

function render(value) {
  current = value;
  preference.checked = value;
  preference.disabled = false;
  reset.disabled = !value;
  status.textContent = value
    ? "Optional sign-in reminders will be dismissed automatically."
    : "Look for Never next to a reminder's Maybe later or Not now option.";
}

function save(value) {
  preference.disabled = true;
  reset.disabled = true;
  const writeRevision = revision;
  chrome.storage.local.set({ neverAskToSignIn: value }, () => {
    if (chrome.runtime.lastError) {
      render(current);
      status.textContent = "Your preference could not be saved. Please try again.";
      return;
    }
    if (revision === writeRevision) {
      revision++;
      render(value);
    }
  });
}

preference.addEventListener("change", () => save(preference.checked));
reset.addEventListener("click", () => save(false));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.hasOwn(changes, "neverAskToSignIn")) {
    revision++;
    render(changes.neverAskToSignIn.newValue === true);
  }
});

const readRevision = revision;
chrome.storage.local.get({ neverAskToSignIn: false }, (result) => {
  if (revision !== readRevision) return;
  if (chrome.runtime.lastError) {
    render(false);
    status.textContent = "Your preference could not be read. Please try again.";
    return;
  }
  render(result.neverAskToSignIn === true);
});
