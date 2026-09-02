"use client";

import React from "react";
import { createPortal } from "react-dom";

export interface ErrorModalProps {
  message: string | null;
  onClose: () => void;
}

export function ErrorModal({ message, onClose }: ErrorModalProps) {
  // Modal(createPortal→body, z-index:9999) 과 같은 루트 stacking context 에서 렌더해야 z-index(10001)가
  // 직접 비교되어 팝업 위에 뜬다. 인라인 렌더 시 페이지가 만든 stacking context 에 갇혀 팝업 뒤로 깔린다
  // (2026-07-19 사용자 지시 — 행위 주체 앞에 알람 표시). SSR 가드는 Modal.tsx 와 동일.
  if (!message || typeof document === "undefined") return null;

  return createPortal(
    <div className="error-modal-overlay">
      <div className="error-modal">
        <div className="error-modal__header">오류</div>
        <div className="error-modal__body">
          <p>{message}</p>
        </div>
        <div className="error-modal__footer">
          <button className="btn btn-primary" onClick={onClose}>
            확인
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
