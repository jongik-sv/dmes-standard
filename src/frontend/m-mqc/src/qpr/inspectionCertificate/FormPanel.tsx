"use client";

/**
 * 2 양식 편집 — 양식 3종의 기본 모양(문구 6개, 표 칸 순서·보이기·이름, 등록된 칸 추가). 고치면 초안 → [승인 요청] → [승인] → 적용본 v+1.
 * 초안은 미리보기(빨간 띠)에만 쓰이고 발행에는 쓰이지 않는다.
 */
import { useState } from "react";

import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import {
  Badge,
  Button,
  Checkbox,
  Input,
  SegmentedControl,
  Select,
  Textarea,
} from "@dk-oasis/shared/form";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import { Modal } from "@dk-oasis/shared/modal";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { errorMessage } from "@/common/oasis";

import { EXTRA, FORM_KEYS, FORMNAME, isExtra } from "./engine/constants";
import { formDiff } from "./engine/diff";
import type { FormKey } from "./engine/types";
import type { MtcStore } from "./store";
import {
  cellBadge,
  DetailTable,
  Field,
  Hint,
  Lead,
  oneLine,
  Row,
  Stack,
} from "@/common/ui";

const COL_COLUMNS: GridColumn[] = [
  {
    key: "drag",
    header: "",
    width: 34,
    rowDrag: true,
    sortable: false,
    tooltip: false,
  },
  { key: "no", header: "순서", width: 46, align: "center" },
  {
    key: "on",
    header: "보이기",
    width: 64,
    align: "center",
    render: (v) => (v ? cellBadge("보임", "success") : cellBadge("숨김")),
  },
  {
    key: "label",
    header: "머리글 이름",
    width: 220,
    minWidth: 140,
    align: "left",
  },
  {
    key: "mark",
    header: "구분",
    width: 80,
    align: "center",
    render: (v) =>
      v
        ? cellBadge(String(v), String(v) === "바뀜" ? "warning" : "primary")
        : "",
  },
];

const SIMPLE_COLUMNS: GridColumn[] = [
  { key: "name", header: "바뀐 곳", width: 100, align: "left" },
];
const HIST_COLUMNS: GridColumn[] = [
  {
    key: "v",
    header: "버전",
    width: 56,
    align: "center",
    render: (v) => `v${String(v)}`,
  },
  { key: "at", header: "날짜", width: 96, align: "center" },
  { key: "memo", header: "내용", width: 240, minWidth: 160, align: "left" },
];

const TEXTS: [key: string, label: string, rows: (fk: FormKey) => number][] = [
  ["title", "제목", (fk) => (fk === "ko" ? 2 : 0)],
  ["statement", "하단 증명 문구", () => 3],
  ["signLabel", "서명자 표기", (fk) => (fk === "ko" ? 2 : 0)],
  ["legend", "범례", (fk) => (fk === "ko" ? 0 : 4)],
  ["maker", "하단 제조자 문구", () => 0],
  ["docno", "문서번호", () => 0],
];

export function FormPanel({ store }: { store: MtcStore; version: number }) {
  const { showMessage } = useMessage();
  const [addSel, setAddSel] = useState("");
  const [reqOpen, setReqOpen] = useState(false);
  const fk = store.ui.formSel;
  const fs = store.data!.forms[fk];
  const F = fs.draft || fs.applied;
  const diff = fs.draft ? formDiff(fs.applied, fs.draft) : [];
  const chg = new Set(diff.map((x) => x.key));
  const lock = fs.pending;
  const ci = Math.min(store.ui.colSel, F.cols.length - 1);
  const cur = F.cols[ci];
  const avail = EXTRA.filter((x) => !F.cols.some((c) => c.k === x.k));
  const colRows = F.cols.map((c, i) => ({
    k: c.k,
    no: i + 1,
    on: c.on,
    label: oneLine(F.labels[c.k]),
    mark: chg.has("col." + c.k) ? "바뀜" : isExtra(c.k) ? "추가한 칸" : "",
  }));

  const state = fs.pending ? (
    <Badge tone="warning" label="승인 대기" />
  ) : fs.draft ? (
    <Badge tone="danger" label={`초안 — 변경 ${diff.length}건`} />
  ) : (
    <Badge tone="success" label="적용본" />
  );

  const approve = () =>
    void store
      .formApprove()
      .then((v) =>
        showMessage({
          message: `v${v} 를 적용했습니다. 새로 발행되는 건부터 반영되고, 기존 건은 재발행하면 반영됩니다.`,
          alertType: "success",
          toast: true,
        }),
      )
      .catch((e: unknown) =>
        showMessage({
          title: "오류",
          message: errorMessage(e),
          alertType: "error",
        }),
      );

  return (
    <Stack>
      <SegmentedControl
        fullWidth
        ariaLabel="편집할 양식"
        value={fk}
        options={FORM_KEYS.map((k) => ({
          value: k,
          label: `${FORMNAME[k]}${store.data!.forms[k].draft ? " •" : ""}`,
        }))}
        onChange={(v) => store.setUi({ formSel: v as FormKey, colSel: 0 })}
      />
      <Row>
        적용본 <b>v{fs.applied.ver}</b> {state}
      </Row>
      <Lead>
        여기서 고치면 이 양식을 쓰는 모든 증명서의 기본 모양이 바뀝니다.
        조건·고객별 처리는 예외 규칙, 한 건만은 단건 수정에서 고칩니다.
      </Lead>
      {lock ? (
        <Badge
          tone="warning"
          label="승인 대기 중에는 고칠 수 없습니다. 더 고치려면 [요청 취소] 를 누르세요."
        />
      ) : null}

      <CardFrame title="문구">
        <DetailTable>
          {TEXTS.map(([k, label, rows]) => (
            <Field
              key={k}
              label={
                chg.has(k) ? (
                  <>
                    {label} <Badge tone="warning" label="바뀜" />
                  </>
                ) : (
                  label
                )
              }
            >
              {rows(fk) ? (
                <Textarea
                  rows={rows(fk)}
                  value={String(F[k] ?? "")}
                  disabled={lock}
                  onChange={(v) => store.setFormText(k, v)}
                  aria-label={label}
                />
              ) : (
                <Input
                  value={String(F[k] ?? "")}
                  disabled={lock}
                  onChange={(v) => store.setFormText(k, v)}
                  aria-label={label}
                />
              )}
            </Field>
          ))}
        </DetailTable>
      </CardFrame>

      <AgDataGrid
        gridId="form-cols"
        title={`표 칸 구성 (${F.cols.filter((c) => c.on).length}/${F.cols.length} 보임)`}
        rowKey="k"
        columns={COL_COLUMNS}
        data={colRows}
        columnSizing="fit"
        height={320}
        highlightedRowKey={cur?.k ?? null}
        onRowClick={(r) => store.setUi({ colSel: Number(r.no) - 1 })}
        onRowOrderChange={
          lock ? undefined : (keys) => store.reorderCols(keys.map(String))
        }
      />
      <Row>
        <Button
          size="sm"
          disabled={lock || ci <= 0}
          onClick={() => store.moveCol(ci, ci - 1)}
        >
          위로
        </Button>
        <Button
          size="sm"
          disabled={lock || ci >= F.cols.length - 1}
          onClick={() => store.moveCol(ci, ci + 1)}
        >
          아래로
        </Button>
        <Button
          size="sm"
          disabled={lock || !cur || !isExtra(cur.k)}
          onClick={() => store.delCol(ci)}
        >
          칸 빼기
        </Button>
      </Row>
      {cur ? (
        <DetailTable>
          <Field
            label="선택한 칸"
            hint="줄바꿈으로 머리글을 여러 줄로 씁니다. 도금량 칸 이름은 예외 규칙이 도금 종류에 맞게 바꿉니다. COIL 칸은 숨길 수 없습니다."
          >
            <Row>
              <Checkbox
                label="보이기"
                checked={cur.on}
                disabled={lock || cur.k === "coil"}
                onChange={(v) => store.setColOn(ci, v)}
              />
              <MutedText>{ci + 1}번째 칸</MutedText>
            </Row>
            <Textarea
              rows={Math.min(3, (F.labels[cur.k] ?? "").split("\n").length)}
              value={F.labels[cur.k] ?? ""}
              disabled={lock}
              onChange={(v) => store.setColLabel(ci, v)}
              aria-label="칸 이름"
            />
          </Field>
        </DetailTable>
      ) : null}

      <CardFrame title="칸 추가">
        <Lead>
          개발자가 미리 등록해 둔 칸(데이터 연결·머리 구조 정의가 끝난 칸)만
          넣을 수 있습니다. 같은 묶음 옆에 붙고, 다른 칸은 표 폭에 맞게 비율대로
          좁아집니다. 칸 값은 예시입니다.
        </Lead>
        <Row>
          <Select
            aria-label="추가할 칸"
            value={addSel}
            disabled={lock || !avail.length}
            placeholder={
              avail.length ? "칸 고르기" : "등록된 칸을 모두 넣었습니다"
            }
            options={avail.map((x) => ({
              value: x.k,
              label: `${x.n} · ${x.g}`,
            }))}
            onChange={setAddSel}
          />
          <Button
            disabled={lock || !addSel}
            onClick={() => {
              store.addCol(addSel);
              setAddSel("");
            }}
          >
            칸 추가
          </Button>
          <Button onClick={() => setReqOpen(true)}>
            목록에 없는 칸이 필요하면?
          </Button>
        </Row>
      </CardFrame>

      <Row>
        {fs.pending ? (
          <>
            <Button variant="primary" onClick={approve}>
              승인 (팀장)
            </Button>
            <Button onClick={() => store.formUnrequest()}>요청 취소</Button>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              disabled={!fs.draft || !diff.length}
              onClick={() => {
                store.formRequest();
                showMessage({
                  message:
                    "승인 요청했습니다. 팀장 역할로 [승인] 을 눌러 보세요.",
                  alertType: "success",
                  toast: true,
                });
              }}
            >
              승인 요청
            </Button>
            <Button
              variant="danger"
              disabled={!fs.draft}
              onClick={() =>
                showMessage({
                  title: "확인",
                  message:
                    "초안을 버리시겠습니까? 고친 내용이 모두 사라집니다.",
                  alertType: "confirm",
                  onConfirm: () => store.formDiscard(),
                })
              }
            >
              초안 버리기
            </Button>
          </>
        )}
      </Row>
      {diff.length ? (
        <AgDataGrid
          gridId="form-diff"
          title="바뀐 곳"
          count={diff.length}
          rowKey="i"
          columns={SIMPLE_COLUMNS}
          data={diff.map((x, i) => ({ i, name: x.name }))}
          columnSizing="fit"
          height="auto"
        />
      ) : null}
      <AgDataGrid
        gridId="form-hist"
        title="버전 이력"
        rowKey="v"
        columns={HIST_COLUMNS}
        data={fs.hist as unknown as Record<string, unknown>[]}
        columnSizing="fit"
        height="auto"
      />

      {reqOpen ? (
        <Modal
          open
          size="md"
          title="목록에 없는 칸 — 개발 요청"
          onClose={() => setReqOpen(false)}
          footer={
            <Button variant="primary" onClick={() => setReqOpen(false)}>
              닫기
            </Button>
          }
        >
          <Stack>
            <Lead>
              값이 아직 시스템에 없는 항목이라 화면에서 바로 넣을 수 없습니다.
              아래 순서로 한 번 등록하면 그다음부터는 「칸 추가」 목록에
              나타납니다.
            </Lead>
            <DetailTable>
              <Field label="현업">
                항목 이름·단위·자릿수, 들어갈 자리(어느 묶음 옆), 쓸 양식을
                요청합니다.
              </Field>
              <Field label="개발">
                ① MES 인터페이스에서 값 받기(QULT300/310 컬럼) ② 증명서 조회 SQL
                에 추가 ③ 칸 정의 등록(키, 머리글, 폭, 숫자 형식)
              </Field>
              <Field label="현업">
                칸 추가 목록에서 골라 넣기 → 승인 요청 → 승인
              </Field>
            </DetailTable>
            <Hint>
              양식 PDF 다시 만들기·서식서버 배포는 필요 없습니다. 새 묶음을
              만들거나 머리 단 수·선 모양을 바꾸는 것은 양식 정의
              변경(개발)입니다.
            </Hint>
          </Stack>
        </Modal>
      ) : null}
    </Stack>
  );
}
