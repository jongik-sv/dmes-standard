/** [새 작업] 유형 고르기 팝업 — 위젯관리의 유형 고르기처럼 아이콘·이름·한 줄 설명 카드 목록. 코드 작업은 목록에 없다. */
import { Button } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import type { JobKind } from "../../data/job-scheduler-mock";
import { JOB_KIND_INFO, NEW_JOB_KINDS } from "./job-kinds";

export interface KindPickerModalProps {
  open: boolean;
  onClose: () => void;
  onPick: (kind: JobKind) => void;
}

export function KindPickerModal({ open, onClose, onPick }: KindPickerModalProps) {
  return (
    <Modal
      open={open}
      title="새 작업 · 유형 고르기"
      size="md"
      onClose={onClose}
      footer={<Button onClick={onClose}>취소</Button>}
    >
      <p className="job-type-picker__lead">만들 작업의 실행 유형을 고르세요. 코드 작업은 개발자가 코드로만 등록합니다.</p>
      <div className="job-type-picker" role="list">
        {NEW_JOB_KINDS.map((kind) => {
          const info = JOB_KIND_INFO[kind];
          return (
            <button
              key={kind}
              type="button"
              role="listitem"
              className="job-type-card"
              data-testid={`job-type-${kind}`}
              onClick={() => onPick(kind)}
            >
              <span className="job-type-card__icon">{info.icon}</span>
              <span className="job-type-card__text">
                <strong>{info.label}</strong>
                <span>{info.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
