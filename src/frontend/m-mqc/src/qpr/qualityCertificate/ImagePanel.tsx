"use client";

/**
 * 4 이미지·서명 — 그림 자산 교체(새 버전 등록), 머리말 로고·인증마크 자리, 서명자와 서명(글자·이미지 올리기·직접 서명).
 * 그림·서명은 덮어쓰지 않고 새 버전으로 올라간다(이미 발행된 보증서는 그때 그림을 유지한다는 뜻). 그림은 본문 안 data URL 로 저장한다.
 */
import { useRef, useState, type CSSProperties } from "react";

import { Badge, Button, Checkbox, Select } from "@dk-oasis/shared/form";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import { Modal } from "@dk-oasis/shared/modal";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { cleanSignature, readFileAsDataUrl, shrinkImage } from "@/common/image";
import { errorMessage } from "@/common/oasis";
import { RangeField } from "@/common/RangeField";
import { SignaturePad } from "@/common/SignaturePad";
import { Hint, Lead, Row, Stack } from "@/common/ui";

import { AKEYS, ASSETS, SIGNERS, signerOf } from "./engine/data";
import { usedText } from "./engine/doc";
import type { WtyStore } from "./store";

const TOP: CSSProperties = { display: "grid", gridTemplateColumns: "110px 1fr", gap: "var(--spacing-sm)", alignItems: "center" };
const THUMB: CSSProperties = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-border-light)",
  borderRadius: 4,
  padding: 5,
  minHeight: 52,
  display: "grid",
  placeItems: "center",
};
const IMG: CSSProperties = { maxWidth: "100%", height: "auto", display: "block" };
const SIGTXT: CSSProperties = { fontStyle: "italic", fontSize: 19, fontFamily: "serif", color: "var(--color-text)" };
const HIDDEN: CSSProperties = { display: "none" };
const WARN: CSSProperties = { color: "var(--color-warning)", fontSize: "var(--font-size-xs)", lineHeight: 1.5 };
const MAX_BYTES = 2 * 1024 * 1024;

export function ImagePanel({ store }: { store: WtyStore; version: number }) {
  const { showMessage } = useMessage();
  const assetFile = useRef<HTMLInputElement>(null);
  const sigFile = useRef<HTMLInputElement>(null);
  const [upKey, setUpKey] = useState(AKEYS[0]);
  const [padOpen, setPadOpen] = useState(false);
  const d = store.doc!;
  const lock = store.locked;
  const txt = usedText(d);
  const s = signerOf(d.signer);
  const sig = d.sigImg?.[s.id];
  const sv = d.sigVer?.[s.id] || 1;
  const fail = (e: unknown) => showMessage({ title: "오류", message: errorMessage(e, "그림을 읽지 못했습니다. PNG·JPG 파일로 다시 시도하세요."), alertType: "error" });

  /** 파일 검사 → data URL. */
  const pick = async (f: File | undefined) => {
    if (!f) return null;
    if (!/^image\/(png|jpeg)$/.test(f.type)) {
      showMessage({ message: "PNG·JPG 파일만 올릴 수 있습니다.", alertType: "warning" });
      return null;
    }
    if (f.size > MAX_BYTES) {
      showMessage({ message: "2MB 이하 파일만 올릴 수 있습니다.", alertType: "warning" });
      return null;
    }
    return readFileAsDataUrl(f);
  };
  const setAsset = (k: string, url: string | null, msg: string) =>
    store.edit(msg, (x) => {
      x.assetImg[k] = url;
      x.assetVer[k] = (x.assetVer[k] || 1) + 1;
    });
  const applySig = (url: string | null, msg: string) =>
    store.edit(msg, (x) => {
      x.sigImg[x.signer] = url;
      x.sigVer[x.signer] = (x.sigVer[x.signer] || 1) + 1;
    });

  return (
    <Stack>
      <Lead>이미지는 글자와 달리 줄어들지 않습니다. 교체는 덮어쓰기가 아니라 새 버전 등록입니다.</Lead>

      {AKEYS.map((k) => {
        const a = ASSETS[k];
        const v = d.assetVer[k] || 1;
        const used = txt.includes(`"${k}"`);
        return (
          <CardFrame
            key={k}
            title={a.nm}
            right={
              <Row>
                <Badge tone="primary" mono label={`v${v}`} />
                {used ? <Badge tone="success" label="사용 중" /> : null}
              </Row>
            }
          >
            <div style={TOP}>
              <div style={THUMB}>
                {d.assetImg[k] ? <img src={d.assetImg[k]!} alt="" style={IMG} /> : <div style={{ width: "100%" }} dangerouslySetInnerHTML={{ __html: a.svg }} />}
              </div>
              <Stack>
                <MutedText>{k}</MutedText>
                <Row>
                  <Button
                    size="sm"
                    disabled={lock}
                    onClick={() => {
                      setUpKey(k);
                      assetFile.current?.click();
                    }}
                  >
                    그림 교체
                  </Button>
                  {d.assetImg[k] ? (
                    <Button size="sm" disabled={lock} onClick={() => setAsset(k, null, `${a.nm} 기본 그림으로`)}>
                      기본 그림으로
                    </Button>
                  ) : null}
                </Row>
              </Stack>
            </div>
            {v > 1 ? (
              <div style={WARN}>
                v{v}로 교체되었습니다. 덮어쓴 것이 아니라 새 자산으로 등록되므로, 이미 발행된 보증서는 v{v - 1} 그림을 유지합니다.
              </div>
            ) : null}
          </CardFrame>
        );
      })}
      <input
        ref={assetFile}
        type="file"
        accept="image/png,image/jpeg"
        style={HIDDEN}
        aria-label="그림 파일"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          void pick(f)
            .then(async (url) => {
              if (url) setAsset(upKey, await shrinkImage(url, 640), `${ASSETS[upKey].nm} 그림 교체`);
            })
            .catch(fail);
        }}
      />

      <CardFrame title="머리말 이미지 자리">
        <Stack>
          <Row>
            <Checkbox label="로고 표시" checked={d.showLogo} disabled={lock} onChange={(v) => store.edit("머리말 수정", (x) => (x.showLogo = v))} />
            <Checkbox label="인증마크 표시" checked={d.showMark} disabled={lock} onChange={(v) => store.edit("머리말 수정", (x) => (x.showMark = v))} />
          </Row>
          <Row>
            <MutedText>자리 위치</MutedText>
            <Select
              aria-label="자리 위치"
              value={d.headerSide}
              disabled={lock}
              options={[
                { value: "right", label: "머리말 오른쪽" },
                { value: "left", label: "머리말 왼쪽" },
              ]}
              onChange={(v) => store.edit("머리말 수정", (x) => (x.headerSide = v === "left" ? "left" : "right"))}
            />
          </Row>
          <RangeField label="로고 크기" unit="px" min={12} max={28} value={d.logoSize} disabled={lock} onChange={(v) => store.edit("머리말 수정", (x) => (x.logoSize = v))} />
        </Stack>
      </CardFrame>

      <CardFrame
        title="서명자"
        right={
          <Row>
            <Badge tone="primary" mono label={`v${sv}`} />
            <Badge tone={sig ? "success" : "neutral"} label={sig ? "그림 서명" : "글자 서명"} />
          </Row>
        }
      >
        <Stack>
          <Select
            aria-label="서명자"
            value={d.signer}
            disabled={lock}
            options={SIGNERS.map((x) => ({ value: x.id, label: `${x.ko} ${x.tk} (${x.from}~)` }))}
            onChange={(v) => store.edit("서명자 변경", (x) => (x.signer = v))}
          />
          <div style={TOP}>
            <div style={THUMB}>{sig ? <img src={sig} alt="" style={IMG} /> : <span style={SIGTXT}>{d.lang === "ko" ? s.ko : s.en}</span>}</div>
            <Stack>
              <b>
                {s.ko} {s.tk}
              </b>
              <Row>
                <Button size="sm" disabled={lock} onClick={() => sigFile.current?.click()}>
                  이미지 올리기
                </Button>
                <Button size="sm" disabled={lock} onClick={() => setPadOpen(true)}>
                  직접 서명
                </Button>
                {sig ? (
                  <Button size="sm" disabled={lock} onClick={() => applySig(null, "서명을 글자로")}>
                    글자로
                  </Button>
                ) : null}
              </Row>
            </Stack>
          </div>
          {sv > 1 ? (
            <div style={WARN}>
              v{sv}로 등록되었습니다. 덮어쓴 것이 아니라 새 버전이므로, 이미 발행된 보증서는 v{sv - 1} 서명을 그대로 유지합니다.
            </div>
          ) : null}
          <RangeField label="서명 크기" unit="px" min={24} max={86} step={2} value={d.sigH || 44} disabled={lock} onChange={(v) => store.edit("서명 크기 수정", (x) => (x.sigH = v))} />
          <Hint>발행 시점의 서명자 버전이 이력에 함께 기록됩니다. 스캔한 서명은 흰 배경을 지우고 여백을 잘라 넣습니다.</Hint>
        </Stack>
      </CardFrame>
      <input
        ref={sigFile}
        type="file"
        accept="image/png,image/jpeg"
        style={HIDDEN}
        aria-label="서명 이미지 파일"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          void pick(f)
            .then(async (url) => {
              if (url) applySig(await cleanSignature(url), "서명 이미지 올리기");
            })
            .catch(fail);
        }}
      />

      {padOpen ? (
        <Modal open size="lg" title={`직접 서명 — ${s.ko} ${s.tk}`} onClose={() => setPadOpen(false)} closeOnClickOutside={false}>
          <Stack>
            <MutedText>아래 칸에 마우스로 끌어서 서명하세요. 태블릿·터치 화면이면 손가락이나 펜으로도 됩니다.</MutedText>
            <SignaturePad
              onEmpty={() => showMessage({ message: "서명이 비어 있습니다. 칸 안에 서명하세요.", alertType: "warning" })}
              onApply={(url) =>
                void cleanSignature(url)
                  .then((u) => {
                    applySig(u, "직접 서명");
                    setPadOpen(false);
                  })
                  .catch(fail)
              }
            />
            <Hint>적용하면 여백을 잘라내고 투명 배경 그림으로 등록합니다. 기존 서명을 덮어쓰지 않고 새 버전으로 올라갑니다.</Hint>
          </Stack>
        </Modal>
      ) : null}
    </Stack>
  );
}
