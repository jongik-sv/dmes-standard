"use client";

import { Button } from "@mantine/core";
import { Modal } from "../components/modal";

export interface ErrorModalProps {
  message: string | null;
  onClose: () => void;
}

export function ErrorModal({ message, onClose }: ErrorModalProps) {
  return (
    <Modal
      open={message !== null}
      onClose={onClose}
      size="sm"
      title="오류"
      footer={
        <Button className="cm-btn cm-btn-primary" color="danger" autoFocus onClick={onClose}>
          확인
        </Button>
      }
    >
      <div className="error-modal__body">
        <p>{message}</p>
      </div>
    </Modal>
  );
}
