"use client";

/**
 * 4 예외 규칙 — 현행 서식서버 소스에 하드코딩된 예외 처리를 「조건 → 결과」 규칙으로 화면에서 관리한다. 고객 요청도 조건에 「고객」을 넣어 여기서 만든다.
 * 고치면 초안(미리보기에만 보임) → [적용] 해야 발행에 쓰인다. 같은 대상에 함께 걸릴 수 있는 규칙과 예시 증명서 시뮬레이션을 함께 보인다.
 */
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Badge, Button, Input, Select, Textarea } from "@dk-oasis/shared/form";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { CUSTS, FORMNAME, KINDS, RF, RT, kindOf } from "./engine/constants";
import { condText, condVal, ctxOf, fmtD, hasCust, matchRule, prioOf, resText, rivals, validYmd } from "./engine/resolve";
import type { MtcStore } from "./store";
import { cellBadge, DetailTable, Field, Grow, Lead, Row, Stack } from "./ui";

const FILTERS = ["전체", ...Object.keys(KINDS), "고객"];

const LIST_COLUMNS: GridColumn[] = [
  { key: "code", header: "코드", width: 92, align: "left" },
  { key: "name", header: "규칙", width: 220, minWidth: 160, align: "left" },
  { key: "prio", header: "우선", width: 48, align: "center" },
  { key: "hit", header: "예시", width: 52, align: "center" },
  { key: "state", header: "상태", width: 60, align: "center", render: (v) => (v === "초안" ? cellBadge("초안", "danger") : v === "사용" ? cellBadge("사용", "primary") : cellBadge("꺼짐")) },
];
const RIVAL_COLUMNS: GridColumn[] = [
  { key: "rule", header: "규칙", width: 220, minWidth: 160, align: "left" },
  { key: "prio", header: "우선", width: 48, align: "center" },
  { key: "win", header: "둘 다 걸리면", width: 150, align: "left", render: (v, r) => <>{v ? cellBadge("이 규칙이 이김", "success") : cellBadge("이 규칙이 밀림")} {r.tie ? cellBadge("⚠ 우선순위를 다르게", "warning") : null}</> },
];
const SIM_COLUMNS: GridColumn[] = [
  { key: "mtc", header: "증명서", width: 140, align: "left" },
  { key: "who", header: "고객 · 양식", width: 170, align: "left" },
  { key: "res", header: "결과", width: 160, minWidth: 120, align: "left", render: (v, r) => (r.ok ? cellBadge("✓ 적용", "success") : <MutedText>✗ {String(v)}</MutedText>) },
];

export function RulePanel({ store }: { store: MtcStore; version: number }) {
  const { showMessage } = useMessage();
  const d = store.data!;
  const ui = store.ui;
  const st = store.st();
  const ids = Object.keys(d.certs);
  const list = d.rules
    .filter((r) => ui.rFilter === "전체" || (ui.rFilter === "고객" ? hasCust(r.draft || r) : kindOf((r.draft || r).tgt) === ui.rFilter))
    .map((r) => {
      const v = r.draft || r;
      return {
        id: r.id,
        code: r.code,
        name: `${v.name} — ${condText(v)} → ${resText(v)}`,
        prio: prioOf(v),
        hit: `${ids.filter((id) => matchRule(v, ctxOf(st, id)).ok).length}건`,
        state: r.draft ? "초안" : r.st === "ACTIVE" ? "사용" : "꺼짐",
      };
    });
  const r = store.rule();
  const v = r ? r.draft || r : null;
  const t = v ? RT[v.tgt] : null;

  return (
    <Stack>
      <Lead>국가·품명·언어·도금·고객 같은 조건에 따라 값·칸 이름·표시를 바꾸는 처리입니다. 지금은 서식서버 소스에 들어 있어 바꾸려면 개발·배포가 필요합니다(현행 하드코딩 111건 중 예시 {d.rules.length}건).</Lead>
      <Row>
        <Select aria-label="규칙 구분" value={ui.rFilter} options={FILTERS} onChange={(x) => store.setUi({ rFilter: x })} />
        <Button onClick={() => store.ruleAdd()}>+ 새 규칙</Button>
      </Row>
      <AgDataGrid
        gridId="rules"
        title="예외 규칙"
        count={list.length}
        rowKey="id"
        columns={LIST_COLUMNS}
        data={list}
        columnSizing="fit"
        height={300}
        highlightedRowKey={ui.rSel}
        onRowClick={(x) => store.setUi({ rSel: String(x.id) })}
      />

      {r && v && t ? (
        <CardFrame title={`규칙 내용 — ${r.code} ${v.name}`} right={r.draft ? <Badge tone="danger" label="초안" /> : r.st === "ACTIVE" ? <Badge tone="primary" label="사용" /> : <Badge label="꺼짐" />}>
          <Stack>
            <Lead>
              현행: {r.where} 에 하드코딩 (이관 목록 {r.code}). To-Be: 이 화면에서 조건·결과를 고치고 [적용] — 소스 수정·배포 없음.
            </Lead>
            <DetailTable>
              <Field label="규칙 이름">
                <Input value={v.name} onChange={(x) => store.setRuleField("name", x)} aria-label="규칙 이름" />
              </Field>
              <Field label="조건" hint="모두 맞아야 적용합니다. 조건이 없으면 모든 증명서에 적용합니다.">
                {v.cond.map(([f, op, val], i) => (
                  <Row key={i}>
                    <Select aria-label="조건 항목" value={f} options={Object.entries(RF).map(([k, x]) => ({ value: k, label: x.n }))} onChange={(x) => store.setCond(i, 0, x)} />
                    <Select aria-label="비교" value={op} options={RF[f]?.date ? ["≥", "<"] : ["=", "≠"]} onChange={(x) => store.setCond(i, 1, x)} />
                    <Grow>
                      {RF[f]?.date ? (
                        <Input
                          aria-label="날짜"
                          maxLength={6}
                          value={val}
                          placeholder="YYMMDD"
                          error={validYmd(val) ? undefined : "실제 날짜가 아닙니다"}
                          title={validYmd(val) ? fmtD(val) : undefined}
                          onChange={(x) => store.setCond(i, 2, x)}
                        />
                      ) : (
                        <Select aria-label="값" value={val} options={Object.entries(RF[f]?.o ?? {}).map(([k, n]) => ({ value: k, label: n }))} onChange={(x) => store.setCond(i, 2, x)} />
                      )}
                    </Grow>
                    <Button size="sm" title="조건 지우기" onClick={() => store.delCond(i)}>
                      ✕
                    </Button>
                  </Row>
                ))}
                <Button size="sm" onClick={() => store.addCond()}>
                  + 조건
                </Button>
              </Field>
              <Field
                label="우선순위"
                hint={v.tgt === "remarkLine" ? "REMARK 줄은 걸린 규칙이 모두 들어갑니다. 우선순위가 작은 규칙 줄이 위로 갑니다." : "숫자가 작을수록 먼저입니다(같은 대상에 규칙이 여러 개 걸리면 작은 숫자가 이깁니다)."}
              >
                <Input type="number" min={1} max={99} value={prioOf(v)} onChange={(x) => store.setRuleField("prio", x)} aria-label="우선순위" />
              </Field>
              <Field label="결과 종류">
                <Select aria-label="결과 종류" value={kindOf(v.tgt)} options={Object.entries(KINDS).map(([k, n]) => ({ value: k, label: n }))} onChange={(x) => store.setTarget({ kind: x })} />
              </Field>
              <Field label="대상">
                <Select
                  aria-label="대상"
                  value={v.tgt}
                  options={Object.entries(RT)
                    .filter(([k]) => kindOf(k) === kindOf(v.tgt))
                    .map(([k, x]) => ({ value: k, label: x.n }))}
                  onChange={(x) => store.setTarget({ tgt: x })}
                />
              </Field>
              <Field label="결과" hint={t.hint}>
                {t.vis ? (
                  <Select aria-label="결과" value={v.val} options={[{ value: "hide", label: "숨기기" }, { value: "show", label: "보이기" }]} onChange={(x) => store.setRuleField("val", x)} />
                ) : t.opts ? (
                  <Select aria-label="결과" value={v.val} options={Object.entries(t.opts).map(([k, n]) => ({ value: k, label: n }))} onChange={(x) => store.setRuleField("val", x)} />
                ) : t.img ? (
                  <>
                    <Select
                      aria-label="결과"
                      value={v.val}
                      options={d.imgs.filter((x) => x.kind === t.img).map((x) => x.name)}
                      onChange={(x) => store.setRuleField("val", x)}
                    />
                    {store.imgSrc(v.val) ? <img src={store.imgSrc(v.val)} alt={v.val} style={{ maxHeight: 48, marginTop: 6, background: "var(--color-bg)", border: "1px solid var(--color-border-light)", padding: 3 }} /> : null}
                  </>
                ) : (
                  <Textarea rows={Math.max(1, v.val.split("\n").length)} value={v.val} onChange={(x) => store.setRuleField("val", x)} aria-label="결과" />
                )}
              </Field>
            </DetailTable>
            <Row>
              {r.draft ? (
                <>
                  <Button
                    variant="primary"
                    disabled={!(t.vis || v.val)}
                    onClick={() => {
                      store.ruleApply();
                      showMessage({ message: "적용했습니다. 새로 발행되는 건부터 반영되고, 기존 건은 재발행하면 반영됩니다.", alertType: "success", toast: true });
                    }}
                  >
                    적용
                  </Button>
                  <Button onClick={() => store.ruleDiscard()}>초안 버리기</Button>
                </>
              ) : r.st === "ACTIVE" ? (
                <Button onClick={() => store.ruleOnOff(false)}>사용 안 함</Button>
              ) : (
                <Button onClick={() => store.ruleOnOff(true)}>사용</Button>
              )}
              {r.id.startsWith("U") ? (
                <Button
                  variant="danger"
                  onClick={() => showMessage({ title: "확인", message: `「${v.name}」 규칙을 삭제하시겠습니까?`, alertType: "confirm", onConfirm: () => store.ruleDelete() })}
                >
                  삭제
                </Button>
              ) : null}
            </Row>
          </Stack>
        </CardFrame>
      ) : (
        <MutedText>규칙을 고르세요.</MutedText>
      )}

      {r ? (
        <AgDataGrid
          gridId="rivals"
          title="같은 대상에 함께 걸릴 수 있는 규칙"
          rowKey="id"
          columns={RIVAL_COLUMNS}
          data={rivals(d.rules, r.id).map((x) => ({ id: x.o.id, rule: `${x.o.code} ${x.o.name} — ${condText(x.o)} → ${resText(x.o)} (${x.why})`, prio: prioOf(x.o), win: x.win, tie: x.tie }))}
          columnSizing="fit"
          height="auto"
          onRowClick={(x) => store.setUi({ rSel: String(x.id), rFilter: "전체" })}
        />
      ) : null}
      {v ? (
        <AgDataGrid
          gridId="rule-sim"
          title={`시뮬레이션 — 예시 증명서 ${ids.length}건`}
          rowKey="id"
          columns={SIM_COLUMNS}
          data={ids.map((id) => {
            const ctx = ctxOf(st, id);
            const m = matchRule(v, ctx);
            return {
              id,
              mtc: d.certs[id].head.mtc,
              who: `${CUSTS[d.certs[id].cust]?.name ?? d.certs[id].cust} · ${FORMNAME[ctx.form as keyof typeof FORMNAME]}`,
              ok: m.ok,
              res: m.fails.map(([f]) => `${RF[f]?.n ?? f}: ${condVal(f, ctx[f])}`).join(", "),
            };
          })}
          columnSizing="fit"
          height="auto"
        />
      ) : null}
      <Lead>
        판정 기준 값:{" "}
        {ids
          .map((id) => `${d.certs[id].head.mtc.slice(-3)} = ${Object.entries(d.certs[id].at).map(([f, x]) => `${RF[f]?.n ?? f} ${RF[f]?.o[x] || x}`).join(", ")}`)
          .join(" / ")}
      </Lead>
    </Stack>
  );
}
