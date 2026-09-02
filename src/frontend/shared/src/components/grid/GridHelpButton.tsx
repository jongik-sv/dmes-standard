"use client";

import { memo, useCallback, useState, type ReactNode } from "react";
import { Modal } from "../modal";

export interface GridHelpValue {
  label: string;
  description: ReactNode;
}

export interface GridHelpItem {
  header: string;
  description: ReactNode;
  values?: readonly GridHelpValue[];
  note?: ReactNode;
}

export interface GridHelpConfig {
  title?: string;
  summary?: ReactNode;
  columns: readonly GridHelpItem[];
}

export interface GridHelpButtonProps extends GridHelpConfig {
  ariaLabel?: string;
  className?: string;
}

function GridHelpButtonComponent({
  title = "그리드 도움말",
  summary,
  columns,
  ariaLabel,
  className = "",
}: GridHelpButtonProps) {
  const [open, setOpen] = useState(false);
  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);
  const buttonLabel = ariaLabel ?? title;
  const hasColumns = columns.length > 0;

  return (
    <>
      <button
        type="button"
        className={`grid-panel-help-button ${className}`.trim()}
        onClick={handleOpen}
        title={buttonLabel}
        aria-label={buttonLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CircleQuestionIcon />
      </button>

      <Modal open={open} title={title} onClose={handleClose} size="lg">
        <div className="grid-help">
          {summary ? <p className="grid-help-summary">{summary}</p> : null}
          {hasColumns ? (
            <div className="grid-help-table-wrap">
              <table className="grid-help-table">
                <thead>
                  <tr>
                    <th className="grid-help-table__header">컬럼</th>
                    <th className="grid-help-table__description">설명</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((column) => (
                    <tr key={column.header}>
                      <td className="grid-help-table__header-cell">
                        {column.header}
                      </td>
                      <td className="grid-help-table__description-cell">
                        <div>{column.description}</div>
                        {column.values && column.values.length > 0 ? (
                          <dl className="grid-help-values">
                            {column.values.map((value) => (
                              <div
                                key={`${column.header}:${value.label}`}
                                className="grid-help-values__row"
                              >
                                <dt>{value.label}</dt>
                                <dd>{value.description}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : null}
                        {column.note ? (
                          <div className="grid-help-note">{column.note}</div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="grid-help-empty">등록된 그리드 도움말이 없습니다.</p>
          )}
        </div>
      </Modal>
    </>
  );
}

function CircleQuestionIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export const GridHelpButton = memo(GridHelpButtonComponent);
