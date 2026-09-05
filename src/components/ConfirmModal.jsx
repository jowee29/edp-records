export default function ConfirmModal({
  open,
  title = 'Confirm Action',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  saving = false,
  onConfirm = () => {},
  onCancel = () => {},
}) {
  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onCancel();
      }}
    >
      <div
        className="modal confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">CONFIRMATION</p>
            <h2 id="confirm-modal-title">{title}</h2>
          </div>
          <button className="modal-close" type="button" disabled={saving} onClick={onCancel} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <div className={`confirm-icon ${danger ? 'confirm-icon-danger' : ''}`}>{danger ? '!' : '?'}</div>
          <p className="confirm-message">{message}</p>
        </div>
        <div className="modal-footer">
          <button type="button" className="ghost-btn" disabled={saving} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={danger ? 'danger-btn' : 'amber-btn'} disabled={saving} onClick={onConfirm}>
            {saving ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
