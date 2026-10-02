package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDay;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 일자 단위 집계 교체 — 그 일자 행 삭제 후 삽입을 한 트랜잭션으로 묶는다. OASIS 진입점이 아니라 @Transactional 을
 * 써도 된다(6-B-1 은 camunda:class 빈만 대상). 롤업이 자기 호출이 아닌 이 빈을 거쳐야 프록시가 걸린다.
 */
@Component
public class ScreenUsageDayWriter {

    private final ScreenUsageDayRepository dayRepository;

    public ScreenUsageDayWriter(ScreenUsageDayRepository dayRepository) {
        this.dayRepository = dayRepository;
    }

    @Transactional
    public void replaceDay(String usageDt, List<ScreenUsageDay> rows) {
        dayRepository.deleteByUsageDt(usageDt);
        dayRepository.saveAll(rows);
    }
}
