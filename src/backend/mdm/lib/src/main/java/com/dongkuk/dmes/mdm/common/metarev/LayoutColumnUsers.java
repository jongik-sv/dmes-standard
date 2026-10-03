package com.dongkuk.dmes.mdm.common.metarev;

import java.util.Collection;
import java.util.Set;

/**
 * 컬럼 사전 → 전문 LAYOUT 키 펼침 SPI(검토 I1, Ruling P3-28 — spec 2026-10-02-mdm-meta-cache-design §3.3, ADR-0007 D2). 기록기
 * ({@link MetaRevisionRecorder})는 이 SPI 로 LAYOUT 키를 더한다.
 *
 * <p>D-151 뒤의 의미: 확정이 항목의 타입(NUM/CHAR 의 근거 DATA_TYPE)·단위·소수 자릿수를 그 버전 항목 행에 고정 표시와 함께 쓰므로(값이
 * 없던 칸은 "값 없음" 으로 고정), 컬럼·도메인이 바뀌어도 확정한 버전의 피드 값은 바뀌지 않는다. V22 가 기존 확정 버전을 이행 시점 값으로
 * 채웠다. 그래도 펼침은 그대로 둔다 — 값이 바뀌지 않는 키까지 거는 무해한 캐시 무효화이고, 확정 경로를 거치지 않아 고정 표시가 없는
 * RELEASED(로컬 샘플·e2e 고정 데이터)는 지금 사전을 읽기 때문이다.
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
