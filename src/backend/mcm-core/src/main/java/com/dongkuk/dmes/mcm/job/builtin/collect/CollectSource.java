package com.dongkuk.dmes.mcm.job.builtin.collect;

import java.time.LocalDate;
import java.util.List;

/**
 * COLLECT 작업 원천 하나. 실패는 {@link CollectException} 이고 메시지는 실행 기록 MSG 에 그대로 적히므로
 * 주소·인증값·DB 메시지를 담지 않는다.
 */
public interface CollectSource<S extends CollectConfig.Source> {

    /** 이 원천의 한 회차 값(빈 목록이면 호출자가 실패로 기록한다). today 는 서울 기준 오늘. */
    List<CollectItem> collect(S source, LocalDate today);
}
