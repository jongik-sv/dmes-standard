package com.dongkuk.dmes.mdm.entity;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

/**
 * 엔티티 업무 일시의 초 절삭(규칙표 #16). 칼럼은 Oracle {@code TIMESTAMP(6)} 이라 소수 초가 그대로 저장된다 — {@code VALID_FROM}
 * 같은 PK 구성 요소·선분 이음({@code VALID_TO = 다음 VALID_FROM})이 네이티브 경로({@code MdmTemporalBinder})와 어긋나지 않게
 * 엔티티 생성자·세터·{@code @IdClass} 생성자에서 같은 규칙으로 자른다. SQLite 시절에는 일시 변환기가 쓰기 때 잘랐다.
 */
final class MdmEntityTimes {

    private MdmEntityTimes() {
    }

    static LocalDateTime seconds(LocalDateTime v) {
        return v == null ? null : v.truncatedTo(ChronoUnit.SECONDS);
    }
}
