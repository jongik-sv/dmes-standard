package com.dongkuk.dmes.mdm.common.metarev;

import java.util.Collection;
import java.util.Set;

/**
 * 컬럼 사전 → 전문 LAYOUT 키 펼침 SPI(검토 I1, Ruling P3-28 — spec 2026-10-02-mdm-meta-cache-design §3.3, ADR-0007 D2). 메타 피드의
 * 전문 합성은 항목의 타입(NUM/CHAR)·단위·소수 자릿수를 그때의 컬럼 사전(컬럼 → 유효 도메인)에서 읽으므로, 컬럼·도메인이 바뀌면 그 물리명을 쓰는
 * RELEASED 전문의 피드 값도 확정 없이 바뀐다. 기록기({@link MetaRevisionRecorder})는 이 SPI 로 LAYOUT 키를 더한다.
 *
 * <p>03 레이아웃({@code dmb.layout})이 구현한다 — 공통 기록기가 화면 패키지를 직접 알지 않게 한다(검토 M2 와 같은 역의존을 늘리지 않는다).
 */
public interface LayoutColumnUsers {

    /**
     * 이 물리명들(저장된 글자 그대로)을 항목으로 쓰는 RELEASED 레이아웃 버전(지난·현재·예정 — 피드는 RELEASED 전체를 준다)의 레이아웃 ID.
     * 헤더면 헤더 자신과 그 헤더를 쌓은 전문까지. DRAFT·이행 전 스냅샷 버전(LEGACY)은 피드 값이 사전과 무관해 빼도 된다. 비면 빈 집합.
     */
    Set<Long> layoutIdsUsing(Collection<String> physNames);
}
