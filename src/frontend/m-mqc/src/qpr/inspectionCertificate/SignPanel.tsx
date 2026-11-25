"use client";

/**
 * 5 서명·스탬프 — 서명·도장 이미지 등록함. 파일을 올려 두기만 하고, 어느 증명서에 찍을지는 예외 규칙(예: 증명서 날짜 ≥ 251229 → 서명 이미지 = …)이 정한다.
 * 올린 파일은 PNG·JPG 1MB 이하, data URL 로 서버에 저장한다.
 */
import { useRef, type CSSProperties } from "react";

import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Badge, Button, Select } from "@dk-oasis/shared/form";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { condText } from "./engine/resolve";
import { loadPaperAssets } from "./paperAssets";
import { todayDot, type MtcStore } from "./store";
import { cellBadge, DetailTable, Field, Lead, Row, Stack } from "@/common/ui";

const IMG_COLUMNS: GridColumn[] = [
  { key: "name", header: "파일", width: 190, minWidth: 150, align: "left" },
  { key: "remark", header: "설명", width: 170, align: "left" },
  {
    key: "nRule",
    header: "규칙",
    width: 72,
    align: "center",
    render: (v) =>
      Number(v)
        ? cellBadge(`규칙 ${String(v)}건`, "primary")
        : cellBadge("규칙 없음"),
  },
];
const THUMB: CSSProperties = {
  maxHeight: 64,
  maxWidth: 220,
  background: "var(--color-bg)",
  border: "1px solid var(--color-border-light)",
  borderRadius: 4,
  padding: 3,
  verticalAlign: "middle",
};
const HIDDEN: CSSProperties = { display: "none" };
const MAX_BYTES = 1024 * 1024;

export function SignPanel({ store }: { store: MtcStore; version: number }) {
  const { showMessage } = useMessage();
  const fileRef = useRef<HTMLInputElement>(null);
  const d = store.data!;
  const ui = store.ui;
  const x = d.imgs.find((y) => y.name === ui.imgSel);
  const rows = (kind: string) =>
    d.imgs
      .filter((y) => y.kind === kind)
      .slice()
      .reverse()
      .map((y) => ({
        name: y.name,
        remark: (y.remark || "") + (y.data ? "" : " · 파일 없음"),
        nRule: store.imgRules(y.name).length,
      }));
  const used = x ? store.imgRules(x.name) : [];
  const canDel =
    !!x && !store.isBaseImg(x.name) && !used.length && !store.imgInSnap(x.name);
  const added = (n: string) =>
    showMessage({
      message: `${n} 을(를) 등록했습니다. 증명서에 찍히게 하려면 예외 규칙을 만드세요.`,
      alertType: "success",
      toast: true,
    });

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg)$/.test(f.type)) {
      showMessage({
        message: "PNG·JPG 파일만 올릴 수 있습니다.",
        alertType: "warning",
      });
      return;
    }
    if (f.size > MAX_BYTES) {
      showMessage({
        message: "1MB 이하 파일만 올릴 수 있습니다.",
        alertType: "warning",
      });
      return;
    }
    const rd = new FileReader();
    rd.onload = () =>
      added(
        store.addImg(
          f.name,
          ui.imgKind,
          String(rd.result),
          `업로드 ${todayDot()}`,
        ),
      );
    rd.readAsDataURL(f);
  };

  const sample = () =>
    void loadPaperAssets().then((a) => {
      const dt = todayDot().replace(/\./g, "");
      added(
        store.addImg(
          `Z_MTC_SIGN_${dt}.png`,
          "서명",
          a.imgs["sign_sample.png"],
          "예시 그림 (시연용 새 서명)",
        ),
      );
    });

  return (
    <Stack>
      <Lead>
        여기는 파일만 올려 두는 곳입니다. 어느 증명서에 어떤 이미지를 찍을지는
        예외 규칙이 정합니다(예: 증명서 날짜 ≥ 251229 → 서명 이미지 =
        Z_MTC_SIGN_20251229). 인사발령도, 고객별 도장도 같은 방식입니다.
      </Lead>
      <CardFrame title="새 이미지 올리기">
        <Row>
          <Select
            aria-label="구분"
            value={ui.imgKind}
            options={["서명", "도장"]}
            onChange={(v) => store.setUi({ imgKind: v as "서명" | "도장" })}
          />
          <Button onClick={() => fileRef.current?.click()}>파일 선택</Button>
          <Button onClick={sample}>예시 파일로 등록 (시연용)</Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            style={HIDDEN}
            aria-label="이미지 파일"
            onChange={(e) => {
              onFile(e.currentTarget.files?.[0]);
              e.currentTarget.value = "";
            }}
          />
        </Row>
        <MutedText>PNG·JPG, 1MB 이하.</MutedText>
      </CardFrame>

      <CardFrame title="선택한 이미지">
        {x ? (
          <>
            <DetailTable>
              <Field label="이미지">
                {x.data ? (
                  <img src={x.data} alt={x.name} style={THUMB} />
                ) : (
                  <MutedText>파일 없음 — 찍히면 빈칸</MutedText>
                )}
              </Field>
              <Field label="파일">{x.name}</Field>
              <Field label="구분">{x.kind}</Field>
              <Field label="설명">{x.remark}</Field>
              <Field label="쓰는 규칙">
                {used.length ? (
                  <>
                    {used.map((r) => (
                      <Row key={r.id}>
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            wordBreak: "keep-all",
                            overflowWrap: "anywhere",
                          }}
                        >
                          {r.code} {r.name} · {condText(r)}
                        </span>
                        <Button
                          size="sm"
                          onClick={() =>
                            store.setUi({
                              tab: "rule",
                              rSel: r.id,
                              rFilter: "전체",
                            })
                          }
                        >
                          규칙 보기
                        </Button>
                      </Row>
                    ))}
                  </>
                ) : (
                  <MutedText>
                    없음 — 등록만 되어 있고 아직 찍히지 않습니다
                  </MutedText>
                )}
              </Field>
            </DetailTable>
            <Row>
              <Button
                variant="primary"
                onClick={() => {
                  store.imgMakeRule();
                  showMessage({
                    message:
                      "규칙 초안을 만들었습니다. 날짜를 확인하고 [적용] 하세요.",
                    alertType: "success",
                    toast: true,
                  });
                }}
              >
                이 이미지로 규칙 만들기
              </Button>
              {!store.isBaseImg(x.name) ? (
                <Button
                  variant="danger"
                  disabled={!canDel}
                  title={
                    canDel
                      ? undefined
                      : "규칙이나 발행된 증명서가 쓰는 이미지는 지울 수 없습니다"
                  }
                  onClick={() =>
                    showMessage({
                      title: "확인",
                      message: `${x.name} 을(를) 삭제하시겠습니까?`,
                      alertType: "confirm",
                      onConfirm: () => store.delImg(),
                    })
                  }
                >
                  삭제
                </Button>
              ) : (
                <Badge label="기본 이미지" />
              )}
            </Row>
          </>
        ) : (
          <MutedText>이미지를 고르세요.</MutedText>
        )}
      </CardFrame>

      {(["서명", "도장"] as const).map((k) => (
        <AgDataGrid
          key={k}
          gridId={k === "서명" ? "imgs-sign" : "imgs-stamp"}
          title={k}
          rowKey="name"
          columns={IMG_COLUMNS}
          data={rows(k)}
          columnSizing="fit"
          height="auto"
          highlightedRowKey={ui.imgSel}
          onRowClick={(r) => store.setUi({ imgSel: String(r.name) })}
        />
      ))}
    </Stack>
  );
}
