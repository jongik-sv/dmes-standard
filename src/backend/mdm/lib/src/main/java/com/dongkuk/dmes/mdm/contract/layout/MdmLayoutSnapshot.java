package com.dongkuk.dmes.mdm.contract.layout;

import java.util.List;

/**
 * 레이아웃(전문) 스냅샷(TSK-05-01 design.md §6.1) — 배포된 한 버전의 레이아웃 정의를 자기완결적으로
 * 담는다. {@code layoutKind}를 담지 않는다 — 스냅샷은 항상 MESSAGE 레이아웃 기준이다. {@code encoding}·
 * {@code padRule}은 EAI 소유(F22, D5)라 최상위에만 있다.
 *
 * <p>{@code headers}가 빈 리스트면 헤더 없는 전문, 원소 1개면 md 단일-헤더 동작(N=1), 2개 이상이면 D4
 * 적층이다(불변 규칙 1). {@code items}는 본문 항목이며 {@code offset}은 메시지 전체 절대값이다(F23).
 */
public record MdmLayoutSnapshot(
        long layoutId,
        String layoutName,
        String eaiCode,
        String sndSystem,
        String rcvSystem,
        String encoding,
        String padRule,
        long layoutVersion,
        int totalLength,
        List<MdmLayoutHeaderRef> headers,
        List<MdmLayoutItemSnapshot> items) {
}
