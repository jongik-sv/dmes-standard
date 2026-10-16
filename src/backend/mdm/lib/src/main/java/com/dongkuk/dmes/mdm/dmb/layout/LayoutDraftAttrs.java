package com.dongkuk.dmes.mdm.dmb.layout;

/**
 * 전문 DRAFT 검사·조립({@link LayoutDraftBuilder#build})이 읽는 전문 머리 값(코어, BE 리팩토링 2회차 C5). 화면 저장 요청이나 저장된 버전
 * 행({@link LayoutDraftBuilder#buildStored})에서 만든다 — 코어가 화면 DTO 를 알지 않게 한다.
 *
 * @param layoutId 저장된 대상 전문(새 전문이면 null)
 */
public record LayoutDraftAttrs(Long layoutId, String layoutName, String eaiCode, String sndSystem, String rcvSystem) {
}
