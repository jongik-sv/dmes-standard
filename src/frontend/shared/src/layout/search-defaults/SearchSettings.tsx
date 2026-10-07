"use client";

/**
 * 조회 영역의 「조회 기본값」 설정 아이콘·메뉴·설정 창(설계 2026-10-07-search-defaults §8, 내부 부품 — SearchArea 가 그린다).
 *
 * - 조회 영역 오른쪽 위에 겹쳐 놓는다. 평소에는 흐리고 영역에 마우스·초점이 오면 진해진다(그리드 설정 아이콘과 같은 모습·조작감).
 * - 그리지 않는 경우: 등록된 칸이 없음, `defaults={false}`, pageId 없음, 사용자 ID 없음, 대화 상자(role="dialog") 안.
 *   판정은 마운트 뒤 effect 에서 한다(렌더 중에 전역 사용자를 읽으면 서버 렌더와 어긋난다). 칸 등록(자식 layout effect)이 이 부품보다 앞에 끝나도록
 *   SearchArea 가 조건 칸 뒤에 둔다.
 * - 메뉴: [기본값 설정…] · [지금 조건을 기본값으로] · [내 기본값 초기화…](빨강).
 * - 저장·초기화는 이 영역 칸의 규칙만 바꾼다(같은 화면의 다른 영역 규칙은 남긴다, settings-model 의 saveAreaRules).
 * - 아이콘은 조회 form 안에 있으므로 type="button" 이다. 메뉴·창은 portal 로 그려지고 안에 form·submit 단추가 없어 조회가 일어나지 않는다.
 * - 스타일은 부품이 직접 넣는다(포털이 원격 모듈의 CSS 파일을 싣지 않는다 — Part B §18-3).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActionIcon, Menu } from "@mantine/core";
import { IconAdjustmentsHorizontal, IconDeviceFloppy, IconRestore, IconSettings } from "@tabler/icons-react";

import { MessageModal, Modal } from "../../components/modal";
import { Button } from "../../components/form/Button";
import { DatePicker } from "../../components/form/DatePicker";
import { Input } from "../../components/form/Input";
import { Select } from "../../components/form/Select";
import { peekCurrentUser, subscribeCurrentUser } from "../../portal-shell/current-user";
import type { SearchDefaultsAreaApi } from "./area";
import { readSearchLastValues } from "./last-values";
import { RANGE_PRESETS, type SearchDefaultRule } from "./rule";
import { SEARCH_SETTINGS_LABELS as L } from "./search-settings-labels";
import {
  N_LIMITS,
  SETTINGS_RELATIVE_OPTIONS,
  buildSettingsRows,
  checkRow,
  currentValueRules,
  rowRules,
  saveAreaRules,
  type PairMode,
  type PairRow,
  type RelativePick,
  type SettingsField,
  type SettingsRow,
  type SideState,
  type SingleMode,
  type SingleRow,
} from "./settings-model";
import { getPageSearchDefaults } from "./store";

export const SEARCH_SETTINGS_STYLE_HREF = "cm-search-settings";
const SEARCH_SETTINGS_CSS = `
.search-area:has(> .cm-search-settings-overlay) { position: relative; }
.search-area:has(> .cm-search-settings-overlay) > .search-area__conditions { margin-right: 24px; }
.cm-search-settings-overlay {
  position: absolute; top: 2px; right: 2px; z-index: 2;
  opacity: 0.45; transition: opacity 0.15s ease;
}
.search-area:hover > .cm-search-settings-overlay,
.search-area:focus-within > .cm-search-settings-overlay,
.cm-search-settings-overlay:has([data-expanded]) { opacity: 1; }
.cm-sd-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.cm-sd-table th, .cm-sd-table td { border-bottom: 1px solid var(--color-border, #e5e7eb); padding: 4px 6px; text-align: left; vertical-align: middle; }
.cm-sd-table th { font-weight: 600; white-space: nowrap; }
.cm-sd-field { white-space: nowrap; }
.cm-sd-value { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.cm-sd-value .cm-sd-n { width: 64px; }
.cm-sd-preview { white-space: nowrap; color: var(--color-text-secondary, #6b7280); }
.cm-sd-error { color: var(--color-danger, #dc2626); display: block; }
.cm-sd-warning { color: var(--color-warning, #b45309); display: block; }
.cm-sd-save-error { color: var(--color-danger, #dc2626); margin-top: 8px; }
.cm-sd-empty { color: var(--color-text-secondary, #6b7280); }
`;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface SearchSettingsProps {
  api: SearchDefaultsAreaApi;
  /** SearchArea `defaults`. */
  enabled: boolean;
}

/** 조회 영역 오른쪽 위의 설정 아이콘과 메뉴·확인 창·설정 창. */
export function SearchSettings({ api, enabled }: SearchSettingsProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [userId, setUserId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirm, setConfirm] = useState<"saveCurrent" | "reset" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    setUserId(peekCurrentUser()?.id ?? "");
    return subscribeCurrentUser((u) => setUserId(u?.id ?? ""));
  }, []);

  // 렌더마다 다시 본다 — 조건부 칸이 나타나거나 사라지면 SearchArea 가 다시 그려지고, 칸 등록은 이 effect 보다 먼저 끝난다.
  useLayoutEffect(() => {
    const host = anchorRef.current?.parentElement;
    const inDialog = !!host?.closest?.('[role="dialog"]');
    const next = enabled && !!api.pageId && !inDialog && !!userId && api.listFields().length > 0;
    setVisible((v) => (v === next ? v : next));
  });

  const fields = (): SettingsField[] => api.listFields();

  const runSave = async (next: Array<[string, SearchDefaultRule | null]>) => {
    try {
      await saveAreaRules(userId, api.pageId, fields(), next);
    } catch (e) {
      setFailure(errorText(e));
    }
  };

  const confirmMessage = useMemo(() => {
    if (confirm === "reset") return "이 조회 영역의 내 기본값을 지웁니다. 지금 칸 값은 그대로 둡니다. 계속할까요?";
    if (confirm !== "saveCurrent") return "";
    const hasDate = api.listFields().some((f) => f.valueType === "date");
    return hasDate
      ? "지금 조회 조건을 이 화면의 기본값으로 저장합니다. 날짜 칸은 오늘 날짜로 고정되니, 날마다 바뀌게 하려면 [기본값 설정…]에서 상대 날짜를 고르세요. 계속할까요?"
      : "지금 조회 조건을 이 화면의 기본값으로 저장합니다. 계속할까요?";
  }, [confirm, api]);

  return (
    <>
      <span ref={anchorRef} hidden aria-hidden="true" />
      {visible ? (
        <div className="cm-search-settings-overlay" data-testid="search-settings-overlay">
          <style href={SEARCH_SETTINGS_STYLE_HREF} precedence="default">
            {SEARCH_SETTINGS_CSS}
          </style>
          <Menu position="bottom-end" shadow="md" width={220} withinPortal>
            <Menu.Target>
              <ActionIcon
                type="button"
                variant="subtle"
                color="gray"
                size={24}
                title={L.menu}
                aria-label={L.menu}
                data-testid="search-settings-menu"
              >
                <IconSettings size={16} aria-hidden="true" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown data-testid="search-settings-dropdown">
              <Menu.Item data-testid="search-settings-open" leftSection={<IconAdjustmentsHorizontal size={14} aria-hidden="true" />} onClick={() => setDialogOpen(true)}>
                {L.open}
              </Menu.Item>
              <Menu.Item data-testid="search-settings-save-current" leftSection={<IconDeviceFloppy size={14} aria-hidden="true" />} onClick={() => setConfirm("saveCurrent")}>
                {L.saveCurrent}
              </Menu.Item>
              <Menu.Item data-testid="search-settings-reset" color="red" leftSection={<IconRestore size={14} aria-hidden="true" />} onClick={() => setConfirm("reset")}>
                {L.reset}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      ) : null}
      {visible && confirm ? (
        <MessageModal
          open
          title={confirm === "reset" ? L.reset.replace("…", "") : L.saveCurrent}
          alertType="confirm"
          message={<span data-testid="search-settings-confirm">{confirmMessage}</span>}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            const kind = confirm;
            setConfirm(null);
            if (kind === "reset") void runSave(fields().map((f) => [f.storageKey, null]));
            else {
              const values = api.readValues();
              void runSave(currentValueRules(fields().map((f) => ({ ...f, value: values[f.storageKey] ?? "" }))));
            }
          }}
        />
      ) : null}
      {failure ? <MessageModal open title={L.menu} alertType="error" message={failure} onClose={() => setFailure(null)} /> : null}
      {visible && dialogOpen ? (
        <SearchDefaultsDialog
          api={api}
          userId={userId}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </>
  );
}

interface DialogProps {
  api: SearchDefaultsAreaApi;
  userId: string;
  onClose: () => void;
}

/** 설정 창 — 열 때마다 지금 칸과 저장된 규칙으로 처음부터 시작한다. */
function SearchDefaultsDialog({ api, userId, onClose }: DialogProps) {
  const [fields] = useState(() => api.listFields());
  const [rows, setRows] = useState<SettingsRow[]>(() => buildSettingsRows(fields, getPageSearchDefaults(userId, api.pageId), api.scope));
  const [lastValues] = useState(() => readSearchLastValues(userId, api.pageId));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);
  const checks = rows.map((r) => checkRow(r, lastValues, now));
  const hasError = checks.some((c) => c.error);

  const update = (i: number, next: SettingsRow) => setRows((rs) => rs.map((r, j) => (j === i ? next : r)));

  const handleSave = async () => {
    if (hasError || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveAreaRules(userId, api.pageId, fields, rows.flatMap(rowRules));
      // 저장한 규칙을 지금 칸에 바로 넣는다(조회는 하지 않는다).
      api.applyNow();
      onClose();
    } catch (e) {
      setSaveError(errorText(e));
      setSaving(false);
    }
  };

  const handleResetAll = () =>
    setRows((rs) => rs.map((r) => (r.kind === "single" ? { ...r, mode: "none" as SingleMode } : { ...r, mode: "none" as PairMode })));

  return (
    <>
      <style href={SEARCH_SETTINGS_STYLE_HREF} precedence="default">
        {SEARCH_SETTINGS_CSS}
      </style>
      <Modal
        open
        title={L.dialogTitle}
        size="lg"
        onClose={onClose}
        footer={
          <>
            <Button data-testid="search-defaults-dialog-reset" onClick={handleResetAll} disabled={saving}>
              {L.dialogReset}
            </Button>
            <Button data-testid="search-defaults-dialog-cancel" onClick={onClose} disabled={saving}>
              {L.cancel}
            </Button>
            <Button variant="primary" data-testid="search-defaults-dialog-save" onClick={() => void handleSave()} disabled={saving || hasError}>
              {L.save}
            </Button>
          </>
        }
      >
        <div data-testid="search-defaults-dialog">
          <table className="cm-sd-table">
            <thead>
              <tr>
                <th>{L.columns.field}</th>
                <th>{L.columns.mode}</th>
                <th>{L.columns.value}</th>
                <th>{L.columns.preview}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const key = row.kind === "single" ? row.field.storageKey : row.from.storageKey;
                const c = checks[i];
                return (
                  <tr key={key} data-testid={`sd-row-${key}`}>
                    <td className="cm-sd-field">{row.kind === "single" ? row.field.label : `${row.from.label} (시작 ~ 끝)`}</td>
                    <td>{row.kind === "single" ? <SingleModeSelect row={row} onChange={(r) => update(i, r)} /> : <PairModeSelect row={row} onChange={(r) => update(i, r)} />}</td>
                    <td>{row.kind === "single" ? <SingleValue row={row} onChange={(r) => update(i, r)} /> : <PairValue row={row} onChange={(r) => update(i, r)} />}</td>
                    <td className="cm-sd-preview" data-testid={`sd-preview-${key}`}>
                      {c.preview}
                      {c.error ? <span className="cm-sd-error" data-testid={`sd-error-${key}`}>{c.error}</span> : null}
                      {c.warning ? <span className="cm-sd-warning">{c.warning}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {saveError ? (
            <div className="cm-sd-save-error" role="alert" data-testid="search-defaults-dialog-error">
              저장하지 못했습니다: {saveError}
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

const modeOption = (m: keyof typeof L.modes) => ({ value: m, label: L.modes[m] });

function SingleModeSelect({ row, onChange }: { row: SingleRow; onChange: (r: SingleRow) => void }) {
  const opts = [modeOption("none"), modeOption("fixed"), ...(row.field.valueType === "date" ? [modeOption("relative")] : []), modeOption("last"), ...(row.custom ? [modeOption("custom")] : [])];
  return (
    <Select
      aria-label={`${row.field.label} ${L.columns.mode}`}
      data-testid={`sd-mode-${row.field.storageKey}`}
      value={row.mode}
      options={opts}
      onChange={(v) => onChange({ ...row, mode: v as SingleMode })}
    />
  );
}

function PairModeSelect({ row, onChange }: { row: PairRow; onChange: (r: PairRow) => void }) {
  const opts = [modeOption("none"), modeOption("range"), modeOption("fixed"), modeOption("relative"), modeOption("last"), ...(row.custom ? [modeOption("custom")] : [])];
  return (
    <Select
      aria-label={`${row.from.label} ${L.columns.mode}`}
      data-testid={`sd-mode-${row.from.storageKey}`}
      value={row.mode}
      options={opts}
      onChange={(v) => onChange({ ...row, mode: v as PairMode })}
    />
  );
}

function RelativeEditor({ pick, onChange, testId, label }: { pick: RelativePick; onChange: (p: RelativePick) => void; testId: string; label: string }) {
  const opt = SETTINGS_RELATIVE_OPTIONS.find((o) => o.id === pick.presetId);
  const limits = opt?.needsN ? N_LIMITS[opt.needsN] : null;
  return (
    <>
      <Select
        aria-label={label}
        data-testid={`${testId}-preset`}
        value={pick.presetId}
        options={SETTINGS_RELATIVE_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
        onChange={(v) => {
          const next = SETTINGS_RELATIVE_OPTIONS.find((o) => o.id === v);
          const lim = next?.needsN ? N_LIMITS[next.needsN] : null;
          onChange({ presetId: v as RelativePick["presetId"], n: lim ? Math.min(Math.max(pick.n || 1, lim.min), lim.max) : pick.n });
        }}
      />
      {limits ? (
        <Input
          className="cm-sd-n"
          type="number"
          aria-label={`${label} N`}
          data-testid={`${testId}-n`}
          min={limits.min}
          max={limits.max}
          value={pick.n}
          onChange={(v) => {
            const n = Math.trunc(Number(v));
            if (Number.isFinite(n)) onChange({ ...pick, n: Math.min(Math.max(n, limits.min), limits.max) });
          }}
        />
      ) : null}
    </>
  );
}

function FixedEditor({ field, side, onChange, testId }: { field: SettingsField; side: SideState; onChange: (s: SideState) => void; testId: string }) {
  const set = (v: string) => onChange({ ...side, fixed: v });
  if (field.valueType === "date") return <DatePicker aria-label={field.label} data-testid={testId} value={side.fixed} onChange={set} />;
  if (field.valueType === "select" || field.valueType === "radio") {
    const options = [...(field.options ?? [])];
    if (!options.some((o) => o.value === side.fixed)) options.push({ value: side.fixed, label: `${side.fixed} (선택지에 없음)` });
    return <Select aria-label={field.label} data-testid={testId} value={side.fixed} options={options} onChange={set} />;
  }
  return <Input aria-label={field.label} data-testid={testId} value={side.fixed} onChange={set} />;
}

const customText = (r: unknown) => (r ? JSON.stringify(r) : "-");

function SingleValue({ row, onChange }: { row: SingleRow; onChange: (r: SingleRow) => void }) {
  const k = row.field.storageKey;
  const setSide = (side: SideState) => onChange({ ...row, side });
  if (row.mode === "fixed") return <div className="cm-sd-value"><FixedEditor field={row.field} side={row.side} onChange={setSide} testId={`sd-fixed-${k}`} /></div>;
  if (row.mode === "relative")
    return (
      <div className="cm-sd-value">
        <RelativeEditor pick={row.side.rel} label={row.field.label} testId={`sd-rel-${k}`} onChange={(rel) => setSide({ ...row.side, rel })} />
      </div>
    );
  if (row.mode === "custom") return <span className="cm-sd-empty">{customText(row.custom)}</span>;
  return <span className="cm-sd-empty">-</span>;
}

function PairValue({ row, onChange }: { row: PairRow; onChange: (r: PairRow) => void }) {
  const k = row.from.storageKey;
  if (row.mode === "range")
    return (
      <div className="cm-sd-value">
        <Select
          aria-label={`${row.from.label} ${L.modes.range}`}
          data-testid={`sd-range-${k}`}
          value={row.rangeId}
          options={RANGE_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
          onChange={(v) => onChange({ ...row, rangeId: v })}
        />
      </div>
    );
  if (row.mode === "fixed")
    return (
      <div className="cm-sd-value">
        <FixedEditor field={row.from} side={row.fromSide} onChange={(s) => onChange({ ...row, fromSide: s })} testId={`sd-fixed-${k}`} />
        <span>~</span>
        <FixedEditor field={row.to} side={row.toSide} onChange={(s) => onChange({ ...row, toSide: s })} testId={`sd-fixed-${row.to.storageKey}`} />
      </div>
    );
  if (row.mode === "relative")
    return (
      <div className="cm-sd-value">
        <RelativeEditor pick={row.fromSide.rel} label={`${row.from.label} 시작`} testId={`sd-rel-${k}`} onChange={(rel) => onChange({ ...row, fromSide: { ...row.fromSide, rel } })} />
        <span>~</span>
        <RelativeEditor pick={row.toSide.rel} label={`${row.from.label} 끝`} testId={`sd-rel-${row.to.storageKey}`} onChange={(rel) => onChange({ ...row, toSide: { ...row.toSide, rel } })} />
      </div>
    );
  if (row.mode === "custom") return <span className="cm-sd-empty">{`${customText(row.custom?.from)} ~ ${customText(row.custom?.to)}`}</span>;
  return <span className="cm-sd-empty">-</span>;
}
