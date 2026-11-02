"use strict";

const preference = document.getElementById("never-reminders");
const reset = document.getElementById("allow-reminders");
const status = document.getElementById("status");
const title = document.getElementById("state-title");
const stateLabel = document.getElementById("state-label");
const card = document.querySelector(".preference-card");
const retry = document.getElementById("retry-preference");
let current = null;
let revision = 0;
let pending = false;
let retryAction = null;
let focusToRestore = null;

function rememberControlFocus() {
  if ([preference, reset, retry].includes(document.activeElement)) focusToRestore = document.activeElement;
}

function restoreControlFocus() {
  if (!focusToRestore) return;
  if (document.activeElement === document.body) {
    const target = focusToRestore.disabled || focusToRestore.hidden
      ? (preference.disabled ? retry : preference)
      : focusToRestore;
    if (!target.disabled && !target.hidden) target.focus({ preventScroll: true });
  }
  focusToRestore = null;
}

function setState(state, heading, label, message) {
  document.body.dataset.state = state;
  title.textContent = heading;
  stateLabel.textContent = label;
  status.textContent = message;
  card.setAttribute("aria-busy", String(state === "loading" || state === "saving"));
}

function clearRetry() {
  retry.hidden = true;
  retryAction = null;
}

function render(value, resetFeedback = false) {
  current = value;
  pending = false;
  clearRetry();
  preference.checked = value;
  preference.disabled = false;
  reset.hidden = false;
  reset.disabled = !value;
  setState(
    value ? "on" : "off",
    value ? "Your choice is remembered." : "Make the choice once.",
    value ? "Never is on" : "Your choice",
    value
      ? "Optional sign-in reminders are dismissed automatically. You can change your mind here anytime."
      : resetFeedback
        ? "Reminders are allowed again. This applies to future reminders; it won't reopen one already dismissed."
        : "Choose Never beside Maybe later on a BBC reminder, or turn this on here."
  );
  restoreControlFocus();
}

function showError(message, action) {
  pending = false;
  preference.disabled = current === null;
  preference.checked = current === true;
  reset.disabled = current !== true;
  reset.hidden = true;
  retryAction = action;
  retry.hidden = false;
  setState("error", "Let's try that again.", "Couldn't save", message);
  restoreControlFocus();
}

function readPreference() {
  rememberControlFocus();
  const readRevision = revision;
  clearRetry();
  preference.disabled = true;
  reset.hidden = false;
  reset.disabled = true;
  setState("loading", "Checking your preference", "Checking", "One moment while we load your saved choice.");
  chrome.storage.local.get({ neverAskToSignIn: false }, (result) => {
    const error = chrome.runtime.lastError;
    if (revision !== readRevision) return;
    if (error) {
      showError("Your preference could not be read. Try again to check your saved choice.", readPreference);
      stateLabel.textContent = "Couldn't load";
      return;
    }
    render(result.neverAskToSignIn === true);
  });
}

function save(value) {
  if (pending || current === null) return;
  rememberControlFocus();
  pending = true;
  clearRetry();
  preference.disabled = true;
  reset.hidden = false;
  reset.disabled = true;
  const writeRevision = revision;
  setState("saving", "Saving your choice", "Saving", "Your preference is being saved on this device.");
  chrome.storage.local.set({ neverAskToSignIn: value }, () => {
    const error = chrome.runtime.lastError;
    if (error) {
      if (revision !== writeRevision) return;
      showError("Your preference could not be saved. Your previous choice is still active.", () => save(value));
      return;
    }
    if (revision === writeRevision) {
      revision++;
      render(value, !value);
    }
  });
}

preference.addEventListener("change", () => save(preference.checked));
reset.addEventListener("click", () => save(false));
retry.addEventListener("click", () => retryAction?.());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.hasOwn(changes, "neverAskToSignIn")) {
    const next = changes.neverAskToSignIn.newValue === true;
    const wasPending = pending;
    revision++;
    // An own-write notification may follow its callback. Keep the confirmation
    // already shown rather than immediately replacing it with the default copy.
    if (next === current && !pending && document.body.dataset.state !== "error") return;
    render(next, wasPending && !next);
  }
});

readPreference();
