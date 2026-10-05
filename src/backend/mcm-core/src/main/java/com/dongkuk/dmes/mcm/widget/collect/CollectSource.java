package com.dongkuk.dmes.mcm.widget.collect;

import java.time.LocalDate;
import java.util.List;

/**
 * 정시 수집 원천 하나 — 스펙 2026-10-05 정시 수집 §2·§4. 실패는 {@link CollectException} 이고 메시지는 RUN 행에 그대로 적히므로
 * 주소·인증값·DB 메시지를 담지 않는다.
 */
interface CollectSource<S extends CollectConfig.Source> {

    /** 이 원천의 한 회차 값(빈 목록이면 호출자가 실패로 기록한다). today 는 서울 기준 오늘. */
    List<CollectItem> collect(S source, LocalDate today);
}
