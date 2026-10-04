"use client";

/**
 * 세트 구성 지침 카드(TSK-08-06 design §6.4·§6.9). 결과 변수를 넣으면 서버(search target GUIDE)가 거슬러 올라가 제안 순서를 준다.
 * 제안일 뿐 저장하지 않는다. 적용하면 제안 순서의 한 줄 흐름으로 바꾸고(배치 초기화) 응답의 IO 를 맵에 더한다(서버를 다시 부르지 않는다, I21).
 * 분기가 있는 흐름에는 적용하지 않는다(P-D5) — 화면이 `canApply` 를 끈다.
 */
import { useState } from "react";

import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import { Button, Input } from "@dk-oasis/shared/form";
import { badgeStyle } from "@/shell";

import { guide } from "../api";
import type { GuideResult, RuleIo } from "../types";

export interface GuideCardProps {
  canApply: boolean;
  /** 적용 버튼이 꺼진 까닭(툴팁). */
  applyHint?: string;
  onApply: (order: readonly string[], ios: readonly RuleIo[]) => void;
  onError: (e: unknown) => void;
}

export function GuideCard({ canApply, applyHint, onApply, onError }: GuideCardProps) {
  const [resultVar, setResultVar] = useState("");
  const [result, setResult] = useState<GuideResult | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      setResult(await guide(resultVar));
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const order = result?.order ?? [];
  return (
    <CardFrame title="세트 구성 지침" testId="set-guide-card">
      <p style={{ margin: "0 0 var(--spacing-xs)", color: "var(--color-text-secondary)" }}>
        마지막에 나와야 하는 결과 변수를 적으면, 그 변수를 만드는 룰부터 조건 변수를 거슬러 올라가 룰을 모으고 의존 순서를 제안한다. 검사가 아니라 안내다.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-xs)", alignItems: "center" }}>
        <Input
          data-testid="set-guide-var"
          value={resultVar}
          placeholder="결과 변수"
          onChange={setResultVar}
          onKeyDown={(e) => {
            if (e.key === "Enter") void run();
          }}
          style={{ flex: "1 1 160px", minWidth: 0 }}
        />
        <Button data-testid="set-guide-run" disabled={busy || !resultVar.trim()} onClick={() => void run()}>
          찾기
        </Button>
      </div>

      {result?.error && (
        <p data-testid="set-guide-error" role="alert" style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-danger)" }}>
          {result.error}
        </p>
      )}

      {result && !result.error && order.length > 0 && (
        <div data-testid="set-guide-order" style={{ paddingTop: "var(--spacing-sm)" }}>
          <p style={{ margin: "0 0 var(--spacing-xs)" }}>{`제안 순서 · ${order.map((id, i) => `${i + 1}. ${id}`).join(" → ")}`}</p>
          {(result.ambiguous ?? []).length > 0 && (
            <p style={{ margin: "0 0 var(--spacing-xs)" }}>
              <span style={badgeStyle("warning")}>고르기</span> 한 결과 변수를 만드는 룰이 둘 이상이다:{" "}
              {(result.ambiguous ?? []).map((a) => `${a.varName}: ${a.ruleIds.join(", ")}`).join(" / ")}
            </p>
          )}
          <Button
            data-testid="set-guide-apply"
            disabled={!canApply}
            title={canApply ? undefined : applyHint}
            onClick={() => onApply(order, result.rules ?? [])}
          >
            이 순서로 한 줄 흐름 만들기
          </Button>
          <p style={{ margin: "var(--spacing-xs) 0 0" }}>
            <MutedText>의존이 없는 룰끼리의 순서는 사용자가 정한다. 적용하면 지금 흐름과 배치를 이 순서의 한 줄 흐름으로 바꾼다</MutedText>
          </p>
        </div>
      )}
    </CardFrame>
  );
}
