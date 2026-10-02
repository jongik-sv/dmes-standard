package com.dongkuk.dmes.mdm.contract.layout;

import java.time.LocalDateTime;

/**
 * 시각 T 의 전문 스냅샷 — 그 시각에 유효한 전문 RELEASED 버전과, 그 버전이 쌓은 헤더마다 그 시각에 유효한 RELEASED 버전을
 * 합성한다(D-144 K1). {@link MdmLayoutSerializer}·{@link MdmLayoutParser} 는 이 결과를 받는 순수 함수로 남는다 — T 는 여기에 넘긴다.
 * 판정 시각에 RELEASED 전문·헤더가 없으면 예외다(헤더 길이 0 으로 합성하지 않는다).
 */
public interface MdmLayoutSnapshotResolver {

    /**
     * @param asOf 판정 시각 T — null 불가. 구현은 null 을 "지금" 으로 대신하지 않는다(기본값은 호출자가 정한다 — 화면 문자열이면
     *             {@code LayoutTimes.asOf}, 확정이면 빈 적용 시작 시각을 먼저 업무 오류로 거부한다)
     */
    MdmLayoutSnapshot at(long layoutId, LocalDateTime asOf);
}
