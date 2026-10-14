// The launch screen and the power panel are native modal <dialog>s (focus trap, inert page behind them).
// Neither may be dismissed with Escape: the launch screen needs the initialize gesture, and the power
// panel only closes through REBOOT. Chrome closes a dialog on a second Escape even when `cancel` was
// prevented, so an unexpected close reopens it.

export function lockModal(dialog) {
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  dialog.addEventListener('close', () => {
    if (dialog.dataset.closing) {
      delete dialog.dataset.closing;
      return;
    }
    dialog.showModal();
  });
}

export function openModal(dialog) {
  if (!dialog.open) dialog.showModal();
}

export function closeModal(dialog) {
  if (!dialog.open) return;
  dialog.dataset.closing = '1';
  dialog.close();
}
