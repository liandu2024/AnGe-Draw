import { useSetAtom } from "../editor-jotai";
import { t } from "../i18n";

import { isLibraryMenuOpenAtom } from "./LibraryMenu";
import { useExcalidrawSetAppState } from "./App";

import "./ConfirmDialog.scss";

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  children?: React.ReactNode;
  className?: string;
}
const ConfirmDialog = (props: Props) => {
  const {
    onConfirm,
    onCancel,
    children,
    title,
    confirmText = t("buttons.confirm"),
    cancelText = t("buttons.cancel"),
  } = props;
  const setAppState = useExcalidrawSetAppState();
  const setIsLibraryMenuOpen = useSetAtom(isLibraryMenuOpenAtom);

  const handleCancel = () => {
    setAppState({ openMenu: null });
    setIsLibraryMenuOpen(false);
    onCancel();
  };

  const handleConfirm = () => {
    setAppState({ openMenu: null });
    setIsLibraryMenuOpen(false);
    onConfirm();
  };

  return (
    <div className="confirm-dialog-overlay" onClick={handleCancel}>
      <div
        className="confirm-dialog-card"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h3 className="confirm-dialog-title">{title}</h3>}
        <div className="confirm-dialog-content">{children}</div>
        <div className="confirm-dialog-buttons">
          <button
            className="confirm-dialog-btn confirm-dialog-btn--cancel"
            onClick={handleCancel}
          >
            {cancelText}
          </button>
          <button
            className="confirm-dialog-btn confirm-dialog-btn--confirm"
            onClick={handleConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
export default ConfirmDialog;
