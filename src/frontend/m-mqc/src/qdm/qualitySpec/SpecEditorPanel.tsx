"use client";

/**
 * 신규 등록 / 수정 탭 — 왼쪽 입력(텍스트 입력 | 간편 입력), 오른쪽 「등록 전 확인」(줄마다 해석 결과·채번 미리보기·오류/경고).
 * 입력 state 는 이 컴포넌트 안에만 둔다(화면 루트 재렌더 없음, 성능 가이드 R12). 신규 입력은 브라우저에 초안으로 자동 저장한다.
 * 저장은 서버가 같은 규칙으로 다시 해석해 검사한다(여기 미리보기는 안내용).
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";

import { ContentBody, ContentPanel, DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Badge, Button, Input, SegmentedControl, Select, Textarea } from "@dk-oasis/shared/form";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";

import { TermChip } from "./badges";
import {
  QUICK_TEMPLATES,
  guidedToLine,
  lineMapped,
  lineToGuided,
  parseText,
  previewSpecNos,
  summarizeLine,
  toTerm,
  type GuidedForm,
  type GuidedRow,
  type ParsedLine,
} from "./dsl";
import { GUIDED_OPS, type AttrKind, type AttrView, type CustomerView, type ProductView, type SpecView } from "./types";

const DRAFT_KEY = "qspec-draft-v2";
const PLACEHOLDER = "고객사 = 320104, 품명 = L, 원재료 두께 0.8 | 원재료 재질 = H36\n고객사 = 110197, 품명 = L, BOM = 'A60041' | 통과공정 = 1P-33-83-A3";
const MODE_OPTIONS = [
  { value: "text", label: "텍스트 입력" },
  { value: "guided", label: "간편 입력" },
];

function readDraft(): string {
  try {
    return typeof window === "undefined" ? "" : (window.localStorage.getItem(DRAFT_KEY) ?? "");
  } catch {
    return "";
  }
}

function writeDraft(text: string) {
  try {
    if (typeof window === "undefined") return;
    if (text) window.localStorage.setItem(DRAFT_KEY, text);
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // 브라우저 저장소를 못 쓰면 초안 저장만 건너뛴다.
  }
}

export interface SpecEditorPanelProps {
  dict: AttrView[];
  customers: CustomerView[];
  products: ProductView[];
  existingSpecNos: string[];
  /** 수정 대상 — 없으면 신규 등록 */
  editTarget: SpecView | null;
  busy: boolean;
  canSave: boolean;
  canConfirm: boolean;
  /** 저장 — 성공하면 true(입력을 비운다). */
  onSave: (text: string, confirm: boolean) => Promise<boolean>;
  onCancelEdit: () => void;
  /** 「코드 사전에 추가」 — 사전 탭으로 이름·구분을 채워 넘긴다. */
  onQuickAdd: (name: string, kind: AttrKind) => void;
}

export const SpecEditorPanel = memo(function SpecEditorPanel(props: SpecEditorPanelProps) {
  const { dict, customers, products, existingSpecNos, editTarget, busy, canSave, canConfirm, onSave, onCancelEdit, onQuickAdd } = props;
  const editing = editTarget !== null;
  const [mode, setMode] = useState<"text" | "guided">("text");
  const [text, setText] = useState<string>(() => (editTarget ? editTarget.rawText : readDraft()));
  const [guided, setGuided] = useState<GuidedForm | null>(null);
  const [guidedNote, setGuidedNote] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const caretRef = useRef<number | null>(null);

  useEffect(() => {
    if (!editing) writeDraft(text);
  }, [editing, text]);

  const lines = useMemo(() => parseText(text, dict), [text, dict]);
  const specNos = useMemo(() => (editTarget ? lines.map(() => editTarget.specNo) : previewSpecNos(lines, existingSpecNos)), [lines, editTarget, existingSpecNos]);
  const editErrors = useMemo(() => {
    if (!editTarget) return [];
    const errs: string[] = [];
    if (lines.length > 1) errs.push("수정은 한 줄만 입력할 수 있습니다");
    const l = lines[0];
    if (l && ((l.cus && l.cus !== editTarget.cusCd) || (l.prd && l.prd !== editTarget.prdNmCd))) errs.push("고객사·품명은 바꿀 수 없습니다 (사양번호 기준)");
    return errs;
  }, [lines, editTarget]);
  const summaries = lines.map(summarizeLine);
  const errLines = summaries.filter((s) => s.flag === "err").length;
  const warnLines = summaries.filter((s) => s.flag === "warn").length;
  const okLines = summaries.filter((s) => s.flag === "ok").length;
  const canSubmit = lines.length > 0 && errLines === 0 && editErrors.length === 0;
  const confirmReady = canSubmit && lines.every((l) => lineMapped(l) && l.results.length > 0);

  const activeDict = useMemo(() => dict.filter((a) => a.useYn !== "N"), [dict]);
  const condAttrs = useMemo(() => activeDict.filter((a) => a.kind !== "RESULT" && a.attrCd !== "CUS_CD" && a.attrCd !== "PRD_NM_CD"), [activeDict]);
  const resultAttrs = useMemo(() => activeDict.filter((a) => a.kind !== "COND"), [activeDict]);

  const changeText = (next: string) => {
    setText(next);
  };

  const insertItem = (name: string) => {
    const pos = caretRef.current ?? text.length;
    const before = text.slice(0, pos);
    const after = text.slice(pos);
    const lineBefore = before.slice(before.lastIndexOf("\n") + 1);
    const needsComma = lineBefore.trim() !== "" && !/[,|]\s*$/.test(lineBefore);
    const insert = `${needsComma ? ", " : lineBefore === "" || /\s$/.test(lineBefore) ? "" : " "}${name} = `;
    const next = before + insert + after;
    caretRef.current = pos + insert.length;
    setText(next);
  };

  const switchMode = (next: string) => {
    if (next === "guided") {
      const g = lineToGuided(text, dict);
      if (g) {
        setGuided(g);
        setGuidedNote(null);
      } else {
        setGuided({ cusCd: editTarget?.cusCd ?? customers[0]?.cusCd ?? "", prdNmCd: editTarget?.prdNmCd ?? products[0]?.prdNmCd ?? "", conds: [], results: [{ attrCd: resultAttrs[0]?.attrCd ?? "", op: "=", val: "" }] });
        setGuidedNote(text.trim() ? "현재 텍스트는 간편 입력으로 되돌릴 수 없습니다(여러 줄이거나 사전에 없는 항목). 간편 입력을 고치면 텍스트를 새로 씁니다." : null);
      }
    }
    setMode(next as "text" | "guided");
  };

  const updateGuided = (patch: (g: GuidedForm) => GuidedForm) => {
    if (!guided) return;
    const next = patch(guided);
    setGuided(next);
    setText(guidedToLine(next, dict));
  };

  const applyTemplate = (key: string) => {
    const t = QUICK_TEMPLATES.find((q) => q.key === key);
    if (!t) return;
    updateGuided((g) => ({ ...g, conds: t.conds.map((r) => ({ ...r })), results: t.results.map((r) => ({ ...r })) }));
  };

  const clear = () => {
    if (editing) {
      onCancelEdit();
      return;
    }
    setText("");
    setGuided(null);
    setMode("text");
  };

  const submit = async (confirm: boolean) => {
    const ok = await onSave(text, confirm);
    if (ok && !editing) {
      setText("");
      setGuided(null);
      setMode("text");
    }
  };

  const n = lines.length;
  const saveLabel = editing ? "수정안 저장" : `작성중 저장 (${n}건)`;
  const confirmLabel = editing ? "저장 후 재확정" : `저장 후 확정 (${n}건)`;
  const revNote = editTarget
    ? editTarget.status === "DRAFT"
      ? `✎ ${editTarget.specNo} Rev.${editTarget.rev} 수정 중 — 작성중 사양이라 Rev 와 상태를 그대로 둡니다.`
      : `✎ ${editTarget.specNo} Rev.${editTarget.rev} 수정 중 — 저장 시 Rev.${editTarget.rev + 1}로 개정되고 상태가 작성중으로 돌아갑니다. (재확정·재전송 필요)`
    : null;

  return (
    <ContentBody root resizable storageKey="mqc.qdm.qualitySpec.editor">
      <ContentPanel scrollY>
        {revNote ? (
          <div>
            <Badge tone="warning" label={revNote} />
          </div>
        ) : null}
        <SegmentedControl ariaLabel="입력 방식" value={mode} onChange={switchMode} options={MODE_OPTIONS} disabled={busy} />

        {mode === "text" ? (
          <CardFrame
            title="텍스트 입력 — 한 줄에 사양 하나"
            right={
              <Button onClick={() => setShowHelp((v) => !v)} aria-expanded={showHelp}>
                문법 도움말
              </Button>
            }
          >
            {showHelp ? (
              <>
                <div>
                  <MutedText>조건 = 값, … | 설계결과 = 값, … — 줄마다 사양 하나를 씁니다.</MutedText>
                </div>
                <div>
                  <MutedText>범위는 0.5~0.8, 부등호는 ≥ 20 또는 &gt;=20 으로 씁니다. 값에 쉼표가 있으면 따옴표로 감쌉니다.</MutedText>
                </div>
                <div>
                  <MutedText>사양번호는 고객사-품명+순번으로 자동 채번합니다(예: 320104-L04). 고객사·품명은 조건에 꼭 넣습니다.</MutedText>
                </div>
              </>
            ) : null}
            <Textarea
              aria-label="품질사양 텍스트"
              value={text}
              onChange={changeText}
              rows={8}
              placeholder={PLACEHOLDER}
              disabled={busy}
              onSelect={(e) => {
                caretRef.current = e.currentTarget.selectionStart;
              }}
            />
            <div>
              <MutedText>조건 항목</MutedText>{" "}
              {activeDict
                .filter((a) => a.kind !== "RESULT")
                .map((a) => (
                  <Button key={`c-${a.attrCd}`} title={a.attrCd} onClick={() => insertItem(a.attrNm)} disabled={busy}>
                    {a.attrNm}
                  </Button>
                ))}
            </div>
            <div>
              <MutedText>설계결과 항목</MutedText>{" "}
              {resultAttrs.map((a) => (
                <Button key={`r-${a.attrCd}`} variant="primary" title={a.attrCd} onClick={() => insertItem(a.attrNm)} disabled={busy}>
                  {a.attrNm}
                </Button>
              ))}
            </div>
          </CardFrame>
        ) : (
          <GuidedEditor
            form={guided}
            note={guidedNote}
            customers={customers}
            products={products}
            condAttrs={condAttrs}
            resultAttrs={resultAttrs}
            busy={busy}
            onTemplate={applyTemplate}
            onChange={updateGuided}
          />
        )}

        <div>
          <Button onClick={clear} disabled={busy}>
            {editing ? "수정 취소" : "비우기"}
          </Button>{" "}
          <Button onClick={() => void submit(false)} disabled={busy || !canSave || !canSubmit}>
            {saveLabel}
          </Button>{" "}
          <Button
            variant="primary"
            onClick={() => void submit(true)}
            disabled={busy || !canSave || !canConfirm || !confirmReady}
            title={canSubmit && !confirmReady ? "모든 항목이 코드 사전에 매핑되고 설계결과가 1개 이상이어야 확정할 수 있습니다" : undefined}
          >
            {confirmLabel}
          </Button>
        </div>
      </ContentPanel>

      <ContentPanel width="45%" scrollY>
        <CardFrame title="등록 전 확인" right={editing ? null : <Badge tone="neutral" label="자동 저장" />}>
          <MutedText>{n === 0 ? "입력한 사양이 없습니다." : `${n}건 · 정상 ${okLines} · 오류 ${errLines} · 경고 ${warnLines}`}</MutedText>
          {editErrors.map((m) => (
            <div key={m}>
              <Badge tone="danger" label="오류" /> {m}
            </div>
          ))}
        </CardFrame>
        {lines.map((line, i) => (
          <PreviewCard
            key={`${i}-${line.raw}`}
            line={line}
            specNo={specNos[i]}
            revText={editTarget ? (editTarget.status === "DRAFT" ? `Rev.${editTarget.rev}` : `Rev.${editTarget.rev} → ${editTarget.rev + 1}`) : "자동 채번"}
            onQuickAdd={onQuickAdd}
          />
        ))}
      </ContentPanel>
    </ContentBody>
  );
});

function PreviewCard({ line, specNo, revText, onQuickAdd }: { line: ParsedLine; specNo: string | null; revText: string; onQuickAdd: (name: string, kind: AttrKind) => void }) {
  const s = summarizeLine(line);
  const flag =
    s.flag === "err" ? <Badge tone="danger" label="오류" /> : s.flag === "warn" ? <Badge tone="warning" label={`경고 ${s.warnCount}`} /> : <Badge tone="success" label="정상" />;
  return (
    <CardFrame title={`${specNo ?? "(채번 불가)"} · ${revText}`} right={flag}>
      <div>
        <Badge tone="neutral" label="IF" />{" "}
        {line.conds.map((t, i) => (
          <TermChip key={`if-${i}`} term={toTerm(t, "IF", i + 1)} side="IF" />
        ))}
      </div>
      <div>
        <Badge tone="primary" label="THEN" />{" "}
        {line.results.map((t, i) => (
          <TermChip key={`then-${i}`} term={toTerm(t, "THEN", i + 1)} side="THEN" />
        ))}
      </div>
      {line.issues.map((issue, i) => (
        <div key={i}>
          <Badge tone={issue.level === "err" ? "danger" : "warning"} label={issue.level === "err" ? "오류" : "경고"} /> {issue.msg}{" "}
          {issue.quickAdd && issue.name ? <Button onClick={() => onQuickAdd(issue.name!, issue.kindGuess ?? "COND")}>코드 사전에 추가</Button> : null}
        </div>
      ))}
    </CardFrame>
  );
}

interface GuidedEditorProps {
  form: GuidedForm | null;
  note: string | null;
  customers: CustomerView[];
  products: ProductView[];
  condAttrs: AttrView[];
  resultAttrs: AttrView[];
  busy: boolean;
  onTemplate: (key: string) => void;
  onChange: (patch: (g: GuidedForm) => GuidedForm) => void;
}

function GuidedEditor({ form, note, customers, products, condAttrs, resultAttrs, busy, onTemplate, onChange }: GuidedEditorProps) {
  if (!form) return null;
  const cusOptions = customers.map((c) => ({ value: c.cusCd, label: `${c.cusCd} ${c.cusNm}` }));
  const prdOptions = products.map((p) => ({ value: p.prdNmCd, label: p.label }));
  const toOptions = (attrs: AttrView[]) => attrs.map((a) => ({ value: a.attrCd, label: a.unit ? `${a.attrNm} (${a.unit})` : a.attrNm }));
  const setRow = (side: "conds" | "results", idx: number, patch: Partial<GuidedRow>) =>
    onChange((g) => ({ ...g, [side]: g[side].map((r, i) => (i === idx ? { ...r, ...patch } : r)) }));
  const addRow = (side: "conds" | "results", attrs: AttrView[]) =>
    onChange((g) => ({ ...g, [side]: [...g[side], { attrCd: attrs[0]?.attrCd ?? "", op: "=", val: "" }] }));
  const removeRow = (side: "conds" | "results", idx: number) => onChange((g) => ({ ...g, [side]: g[side].filter((_, i) => i !== idx) }));

  const rows = (side: "conds" | "results", attrs: AttrView[]) => (
    <table style={DETAIL_TABLE_STYLE}>
      <tbody>
        {form[side].map((r, i) => (
          <tr key={i}>
            <th style={DETAIL_LABEL_CELL}>{i + 1}</th>
            <td style={DETAIL_VALUE_CELL}>
              <Select aria-label="항목" value={r.attrCd} options={toOptions(attrs)} onChange={(v) => setRow(side, i, { attrCd: v })} disabled={busy} />
            </td>
            <td style={DETAIL_VALUE_CELL}>
              <Select aria-label="연산자" value={r.op} options={GUIDED_OPS} onChange={(v) => setRow(side, i, { op: v as GuidedRow["op"] })} disabled={busy} />
            </td>
            <td style={DETAIL_VALUE_CELL}>
              <Input aria-label="값" value={r.val} onChange={(v) => setRow(side, i, { val: v })} placeholder="값 (범위는 0.5~0.8)" disabled={busy} />
            </td>
            <td style={DETAIL_VALUE_CELL}>
              <Button aria-label="행 삭제" onClick={() => removeRow(side, i)} disabled={busy || (side === "results" && form.results.length <= 1)}>
                ✕
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <>
      {note ? <MutedText>{note}</MutedText> : null}
      <CardFrame title="빠른 시작">
        {QUICK_TEMPLATES.map((t) => (
          <Button key={t.key} onClick={() => onTemplate(t.key)} disabled={busy}>
            {t.label}
          </Button>
        ))}
      </CardFrame>
      <CardFrame title="1. 적용 대상을 선택하세요 (필수)">
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <tr>
              <th style={DETAIL_LABEL_CELL}>고객사 *</th>
              <td style={DETAIL_VALUE_CELL}>
                <Select aria-label="고객사" value={form.cusCd} options={cusOptions} onChange={(v) => onChange((g) => ({ ...g, cusCd: v }))} disabled={busy} />
              </td>
              <th style={DETAIL_LABEL_CELL}>품명 *</th>
              <td style={DETAIL_VALUE_CELL}>
                <Select aria-label="품명" value={form.prdNmCd} options={prdOptions} onChange={(v) => onChange((g) => ({ ...g, prdNmCd: v }))} disabled={busy} />
              </td>
            </tr>
          </tbody>
        </table>
      </CardFrame>
      <CardFrame
        title="2. 언제 적용할지 조건을 입력하세요 (선택)"
        right={
          <Button onClick={() => addRow("conds", condAttrs)} disabled={busy}>
            + 조건 추가
          </Button>
        }
      >
        {form.conds.length === 0 ? <MutedText>조건이 없으면 고객사·품명이 같은 모든 주문에 적용합니다.</MutedText> : rows("conds", condAttrs)}
      </CardFrame>
      <CardFrame
        title="3. 어떤 값으로 설계할지 입력하세요 (1개 이상)"
        right={
          <Button onClick={() => addRow("results", resultAttrs)} disabled={busy}>
            + 결과 추가
          </Button>
        }
      >
        {rows("results", resultAttrs)}
      </CardFrame>
    </>
  );
}
