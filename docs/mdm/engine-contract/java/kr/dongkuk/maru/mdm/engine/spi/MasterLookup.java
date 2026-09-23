package kr.dongkuk.maru.mdm.engine.spi;

import java.time.LocalDateTime;
import java.util.Optional;

/**
 * 마루 데이터 조회 — {@code MASTER}·{@code MASTER_AT} 의 마루 데이터 대상(05-master-data.md:363-400, 06:461).
 * 판정 규칙(① 데이터 닫힘 ② 항목 선분 ③ 카테고리 선분 ④ 소속, 최초 행 소급)은 구현체가 05 「판정 참고 구현」
 * 대로 한다. 로컬 사본만 읽는다.
 *
 * <p>{@code baseDt} 는 KST 벽시계 초 단위. {@code MASTER} 면 평가 시각, {@code MASTER_AT} 면 넷째 인자다.
 */
public interface MasterLookup {

    /** 항목이 {@code baseDt} 에 유효한가. 마루 데이터·카테고리가 없거나 key 가 null 이면 false(05:374·393). */
    boolean isValid(String maruDataId, String cateId, String key, LocalDateTime baseDt);

    /**
     * 추가 컬럼 값. 유효하지 않거나 값이 없으면 빈 값(엔진이 NULL 로 돌린다, 05:369·394).
     *
     * @param attrNo 1-10 ({@code "attr01"}-{@code "attr10"})
     */
    Optional<String> attr(String maruDataId, String cateId, String key, LocalDateTime baseDt, int attrNo);

    /** 마루 데이터를 쓰지 않는 호출자용 — 늘 false·빈 값. */
    MasterLookup NONE = new MasterLookup() {
        @Override
        public boolean isValid(String maruDataId, String cateId, String key, LocalDateTime baseDt) {
            return false;
        }

        @Override
        public Optional<String> attr(String maruDataId, String cateId, String key, LocalDateTime baseDt, int attrNo) {
            return Optional.empty();
        }
    };
}
