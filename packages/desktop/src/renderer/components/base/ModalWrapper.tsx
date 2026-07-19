import type { ModalProps } from '@arco-design/web-react';
import { Modal } from '@arco-design/web-react';
import { Close } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface ModalWrapperProps extends Omit<ModalProps, 'title'> {
  children?: React.ReactNode;
  title?: React.ReactNode;
  showCustomClose?: boolean;
}

const useRestoreFocusOnClose = (visible: boolean) => {
  const wasVisibleRef = React.useRef(false);
  const restoreFocusRef = React.useRef<HTMLElement | null>(null);

  React.useLayoutEffect(() => {
    if (visible && !wasVisibleRef.current && !restoreFocusRef.current) {
      restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    wasVisibleRef.current = visible;
  }, [visible]);

  React.useEffect(() => {
    if (visible || !restoreFocusRef.current) return undefined;
    const restoreFocus = restoreFocusRef.current;
    const frame = window.requestAnimationFrame(() => {
      if (restoreFocus.isConnected) restoreFocus.focus({ preventScroll: true });
      restoreFocusRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [visible]);

  React.useEffect(
    () => () => {
      const restoreFocus = restoreFocusRef.current;
      if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
    },
    []
  );
};

const ModalWrapper: React.FC<ModalWrapperProps> = ({
  children,
  title,
  showCustomClose = true,
  onCancel,
  className = '',
  ...props
}) => {
  const { t } = useTranslation();
  const titleId = React.useId();
  useRestoreFocusOnClose(Boolean(props.visible));

  return (
    <Modal
      {...props}
      title={null}
      closable={false}
      onCancel={onCancel}
      focusLock={props.focusLock ?? true}
      autoFocus={props.autoFocus ?? true}
      modalRender={(modalNode) => {
        const labelledNode =
          showCustomClose && title && React.isValidElement(modalNode)
            ? React.cloneElement(modalNode as React.ReactElement<Record<string, unknown>>, {
                'aria-labelledby': titleId,
              })
            : modalNode;
        return props.modalRender ? props.modalRender(labelledNode) : labelledNode;
      }}
      className={`aionui-modal ${className}`}
    >
      <div>
        {showCustomClose && title && (
          <div className='aionui-modal-header'>
            <h3 id={titleId} className='aionui-modal-title'>
              {title}
            </h3>
            <button type='button' onClick={onCancel} className='aionui-modal-close-btn' aria-label={t('common.close')}>
              <Close size={20} fill='#86909c' aria-hidden='true' />
            </button>
          </div>
        )}
        {children}
      </div>
    </Modal>
  );
};

export default ModalWrapper;
