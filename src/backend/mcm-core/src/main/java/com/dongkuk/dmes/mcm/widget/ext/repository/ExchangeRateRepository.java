package com.dongkuk.dmes.mcm.widget.ext.repository;

import com.dongkuk.dmes.mcm.widget.ext.entity.ExchangeRate;
import com.dongkuk.dmes.mcm.widget.ext.entity.ExchangeRateId;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 옛 환율 표({@code TB_MCM_EXCHANGE_RATE}) 저장소.
 *
 * @deprecated 환율 위젯은 MDM 환율 마스터(FX_RATE)를 읽는다. 옛 표 TB_MCM_EXCHANGE_RATE 는 정리 결정 전까지 보존한다.
 */
@Deprecated
public interface ExchangeRateRepository extends JpaRepository<ExchangeRate, ExchangeRateId> {

    /** 기준 통화·대상 통화들의 [fromDate, toDate] 값(yyyyMMdd 문자열 비교), 날짜 오름차순. */
    List<ExchangeRate> findByBaseCurAndQuoteCurInAndRateDateBetweenOrderByRateDateAsc(
            String baseCur, Collection<String> quoteCurs, String fromDate, String toDate);
}
