"use client";

/**
 * 룰 찾기 팝업 — 키워드로 룰을 찾아 하나 고른다. 확정 버전이 없는 룰(releasedVer == null)은 후보에서 뺀다.
 * 이미 세트에 있는 룰은 "사용 중" 배지를 달지만 고를 수는 있다(다른 갈래에 같은 룰을 둘 수 있다).
 * 늦은 응답은 요청 순번으로 버린다(Local-Rules §11). 오류는 문장으로만 보인다(§13).
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { Button, Input } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { badgeStyle } from "@/shell";

import { searchRules } from "../api";
import type { RuleIo } from "../types";

export interface RuleSearchModalProps {
  opened: boolean;
  usedRuleIds: ReadonlySet<string>;
  onClose: () => void;
  onPick: (io: RuleIo) => void;
}

const ERROR_TEXT = "룰을 찾지 못했다. 잠시 뒤 다시 찾는다";
const mutedStyle: CSSProperties = { color: "var(--color-text-muted)" };

export function RuleSearchModal({ opened, usedRuleIds, onClose, onPick }: RuleSearchModalProps) {
  const [keyword, setKeyword] = useState("");
  const [cands, setCands] = useState<RuleIo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (opened) {
      setKeyword("");
      setCands(null);
      setError(null);
    }
    seq.current += 1; // 열고 닫을 때 진행 중이던 응답은 버린다.
  }, [opened]);

  const find = async () => {
    const mine = ++seq.current;
    setError(null);
    try {
      const res = await searchRules(keyword);
      if (mine !== seq.current) return;
      setCands((res.rules ?? []).filter((r) => r.releasedVer != null));
    } catch {
      if (mine !== seq.current) return;
      setCands(null);
      setError(ERROR_TEXT);
    }
  };

  return (
    <Modal open={opened} title="룰 찾기" size="md" onClose={onClose} footer={<Button onClick={onClose}>닫기</Button>}>
      <div style={{ display: "flex", gap: "var(--spacing-xs)", alignItems: "center" }}>
        <Input
          data-testid="flow-rule-search-keyword"
          value={keyword}
          placeholder="룰 ID·룰명 앞부분"
          onChange={setKeyword}
          onKeyDown={(e) => {
            if (e.key === "Enter") void find();
          }}
          style={{ flex: 1 }}
        />
        <Button data-testid="flow-rule-search-find" onClick={() => void find()}>
          찾기
        </Button>
      </div>
      {error && (
        <p data-testid="flow-rule-search-error" role="status" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
      {cands && (
        <ul className="rsf-cands" data-testid="flow-rule-cands">
          {cands.length === 0 ? (
            <li style={mutedStyle}>확정된 룰이 없다. 룰을 먼저 확정한다</li>
          ) : (
            cands.map((r) => (
              <li key={r.ruleId}>
                <button type="button" className="rsf-cand" data-testid={`flow-rule-cand-${r.ruleId}`} onClick={() => onPick(r)}>
                  <span className="rsf-cand-id">{r.ruleId}</span>
                  <span className="rsf-cand-name">{r.ruleName ?? "(이름 없음)"}</span>
                  <span style={badgeStyle("neutral")}>{r.status ?? "-"}</span>
                  <span style={mutedStyle}>{`v${r.releasedVer}`}</span>
                  {usedRuleIds.has(r.ruleId) && <span style={badgeStyle("warning")}>사용 중</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </Modal>
  );
}
