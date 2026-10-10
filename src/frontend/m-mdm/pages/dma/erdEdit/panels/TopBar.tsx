"use client";

/**
 * 위 막대(스펙 2.2·4.4) — 모델 고르기·등록, 버전·rev, 접속자, 논리·물리 전환(F3), 보기 프리셋, 첫 가져오기, 띠(연결 끊김·읽기 전용), 메시지 줄.
 * 길이가 바뀌는 상태 글은 단추 줄이 아니라 아래 띠·메시지 줄에 둔다(Local-Rules §38).
 */
import { useState } from "react";

import { Button, Input } from "@dk-oasis/shared/form";

import { VersionStatusBadge, type MdmVersionStatus } from "@/shell";

import type { RegInput } from "../api";
import type { ErdMode, ErdPreset } from "../canvas/erd-flow";
import type { ErdStreamStatus } from "../state/useErdStream";
import type { ErdModelRow, ErdPresence, ErdState } from "../types";

export const PRESETS: readonly { value: ErdPreset; label: string }[] = [
  { value: "basic", label: "기본" },
  { value: "overview", label: "E-R 개요" },
  { value: "both", label: "논리+물리 동시" },
];

export const nextMode = (m: ErdMode): ErdMode => (m === "logical" ? "physical" : "logical");

/** 읽기 전용 이유 — state/permissions.ts 로 옮겼다(S2-20). 단계 1 경로를 남긴다. */
export { readOnlyReason } from "../state/permissions";

/** 접속자 동그라미 글자 — 내 세션은 "나", 사람은 사용자 ID, LLM 은 세션 이름. */
export function avatarLabel(p: ErdPresence, mySession: string): string {
  if (p.session === mySession) return "나";
  return p.source === "UI" ? p.userId : p.session;
}

export interface TopBarProps {
  models: ErdModelRow[];
  modelId: string | null;
  onModelChange(modelId: string): void;
  state: ErdState | null;
  mySession: string;
  mode: ErdMode;
  onModeChange(mode: ErdMode): void;
  preset: ErdPreset;
  onPresetChange(preset: ErdPreset): void;
  streamStatus: ErdStreamStatus;
  readOnly: string | null;
  message: string | null;
  /** 메시지 줄 색(ctx.notify 의 tone). */
  messageTone?: "info" | "warn" | "error";
  canReg: boolean;
  canImport: boolean;
  /** 읽기 전용·연결 끊김·처리 중 — 쓰기 단추를 막는다. */
  locked: boolean;
  /** 등록이 끝나면 true, 실패하면 false — 실패하면 입력을 그대로 둔다. */
  onRegister(input: RegInput): Promise<boolean>;
  onImport(): void;
}

const EMPTY_REG: RegInput = { modelId: "", moduleId: "", schemaName: "", modelName: "" };
const REG_FIELDS: readonly { key: keyof RegInput; label: string }[] = [
  { key: "modelId", label: "모델 ID" },
  { key: "moduleId", label: "모듈" },
  { key: "schemaName", label: "스키마" },
  { key: "modelName", label: "모델 이름" },
];

export function TopBar(p: TopBarProps) {
  const [reg, setReg] = useState<RegInput | null>(null);
  const [regPending, setRegPending] = useState(false); // 등록 요청 중에만 켜는 등록 단추 전용 상태(R5)
  const s = p.state;
  const empty = !!s && Object.keys(s.model.tables).length === 0;
  return (
    <div className="erd-bar" data-testid="erd-bar">
      <div className="erd-bar__row">
        <span className="erd-bar__label">모델</span>
        {p.models.map((m) => (
          <Button
            key={m.modelId}
            size="sm"
            variant={m.modelId === p.modelId ? "primary" : "default"}
            data-testid={`erd-model-${m.modelId}`}
            title={`${m.moduleId} · ${m.schemaName}`}
            onClick={() => p.onModelChange(m.modelId)}
          >
            {m.modelName}
          </Button>
        ))}
        {p.canReg && (
          <Button size="sm" data-testid="erd-reg-open" onClick={() => setReg(reg ? null : EMPTY_REG)}>
            모델 등록
          </Button>
        )}
        {s && (
          <>
            <span className="erd-bar__meta" data-testid="erd-ver">
              {s.ver}
            </span>
            <VersionStatusBadge status={s.status as MdmVersionStatus} />
            <span className="erd-bar__meta" data-testid="erd-rev">
              rev {s.rev}
            </span>
            <span className="erd-bar__people" data-testid="erd-presence" title="접속자">
              {s.presence.map((x) => (
                <span key={x.session} className="erd-avatar" data-source={x.source === "UI" ? "ui" : "llm"} title={`${x.userId} · ${x.session}`}>
                  {avatarLabel(x, p.mySession)}
                </span>
              ))}
            </span>
          </>
        )}
        <span className="erd-bar__spacer" />
        <span className="erd-bar__group" role="group" aria-label="논리·물리 전환 (F3)">
          <Button size="sm" variant={p.mode === "logical" ? "primary" : "default"} aria-pressed={p.mode === "logical"}
            data-testid="erd-mode-logical" title="논리 모드 (F3)" onClick={() => p.onModeChange("logical")}>
            논리
          </Button>
          <Button size="sm" variant={p.mode === "physical" ? "primary" : "default"} aria-pressed={p.mode === "physical"}
            data-testid="erd-mode-physical" title="물리 모드 (F3)" onClick={() => p.onModeChange("physical")}>
            물리
          </Button>
        </span>
        <span className="erd-bar__group" role="group" aria-label="보기 프리셋">
          {PRESETS.map((x) => (
            <Button key={x.value} size="sm" variant={p.preset === x.value ? "primary" : "default"} aria-pressed={p.preset === x.value}
              data-testid={`erd-preset-${x.value}`} onClick={() => p.onPresetChange(x.value)}>
              {x.label}
            </Button>
          ))}
        </span>
        {empty && p.canImport && (
          <Button size="sm" variant="primary" data-testid="erd-import" disabled={p.locked} onClick={p.onImport}>
            DB 가져오기
          </Button>
        )}
      </div>
      {reg && (
        <div className="erd-bar__row" data-testid="erd-reg-form">
          {REG_FIELDS.map((f) => (
            <Input key={f.key} data-testid={`erd-reg-${f.key}`} aria-label={f.label} placeholder={f.label} value={reg[f.key]}
              onChange={(v) => setReg((r) => ({ ...(r ?? EMPTY_REG), [f.key]: v }))} />
          ))}
          <Button size="sm" variant="primary" data-testid="erd-reg-submit" disabled={regPending}
            onClick={async () => {
              setRegPending(true);
              try {
                if (await p.onRegister(reg)) setReg(null);
              } finally {
                setRegPending(false);
              }
            }}>
            등록
          </Button>
          <Button size="sm" onClick={() => setReg(null)}>
            취소
          </Button>
        </div>
      )}
      {p.streamStatus === "lost" && (
        <div className="erd-banner" data-kind="lost" role="alert" data-testid="erd-banner-lost">
          연결이 끊겼습니다. 다시 연결하는 중이며, 연결될 때까지 확정·기각·가져오기를 멈춥니다.
        </div>
      )}
      {p.readOnly && (
        <div className="erd-banner" data-kind="readonly" data-testid="erd-banner-readonly">
          {p.readOnly}
        </div>
      )}
      <div className="erd-message" role="status" data-testid="erd-message" data-tone={p.messageTone ?? "info"}>
        {p.message ?? ""}
      </div>
    </div>
  );
}
