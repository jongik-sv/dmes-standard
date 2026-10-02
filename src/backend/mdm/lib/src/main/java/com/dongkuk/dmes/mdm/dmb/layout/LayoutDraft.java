package com.dongkuk.dmes.mdm.dmb.layout;

import java.util.List;

/**
 * 검사를 통과한 전문 초안(TSK-05-03 design.md §2 — 불변 I19). save·validate·execute 가 같은 초안을 본다 — 저장이 쓰는 것과 검증·
 * 렌더가 보는 것이 같다. 헤더 구성은 EAI 표준 헤더를 끼운 뒤의 순서다.
 *
 * <p>D-144 3단계: 본문 오프셋은 본문 시작 기준 상대값({@code bodyOffsets}), {@code ownLength} 는 본문 길이다. {@code headers} 는
 * 판정 시각 T 에 고른 헤더 버전 부품이며, 총 길이 = {@code headers} 길이 합 + {@code ownLength}.
 *
 * @param layoutId 저장된 전문이면 그 id, 새 전문이면 null
 */
public record LayoutDraft(Long layoutId, String layoutName, String eaiCode, String sndSystem, String rcvSystem, List<Long> headerIds,
                          List<ConstRow> consts, List<LayoutItemDraft> items, List<Integer> itemLengths, List<Integer> bodyOffsets,
                          int ownLength, List<LayoutSnapshotAssembler.HeaderPart> headers) {

    /** 헤더 상수 재정의 한 건(같은 대상은 마지막 값). 저장 대상은 헤더 항목 물리명이다 — 화면은 {@code headerSeq} 로 주고받는다. */
    public record ConstRow(long headerLayoutId, int headerSeq, String headerColumnPhys, String value) {
    }
}
