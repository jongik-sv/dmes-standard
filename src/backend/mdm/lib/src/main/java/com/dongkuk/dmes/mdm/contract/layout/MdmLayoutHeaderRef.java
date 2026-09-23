package com.dongkuk.dmes.mdm.contract.layout;

import java.util.List;

/**
 * 적층 헤더 한 겹의 스냅샷(TSK-05-01 design.md §6.1, D4). {@code headerLayoutId}는 대리키(예: 100)이고
 * {@code headerLayoutName}은 사람이 읽는 라벨("L100 GLUE 공통 헤더")이다 — 둘을 혼동하지 않는다(html 은
 * "L100"을 라벨로만 쓴다, F12).
 *
 * <p>{@code offset}은 이 헤더가 메시지 전체에서 시작하는 절대 위치다(F23, html:551·554 — 첫 헤더는 0,
 * 그다음 헤더는 앞 헤더들의 길이 합). {@code items[*].offset}은 반대로 <b>이 헤더 내부</b> 상대 오프셋이다
 * (html:175 "오프셋은 이 헤더 안에서 0부터 센다") — 본문 {@link MdmLayoutSnapshot#items()}의 절대 오프셋과
 * 기준이 다르므로 직렬화기·파서(TSK-05-03)는 헤더 항목을 다룰 때 반드시 {@code offset + item.offset()}으로
 * 절대 위치를 구해야 한다(계산 자체는 이 Task 밖, 불변 규칙 15).
 */
public record MdmLayoutHeaderRef(
        int seq,
        long headerLayoutId,
        String headerLayoutName,
        int offset,
        int totalLength,
        List<MdmLayoutItemSnapshot> items) {
}
