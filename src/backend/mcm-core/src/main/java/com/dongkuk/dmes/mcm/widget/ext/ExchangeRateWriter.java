package com.dongkuk.dmes.mcm.widget.ext;

import com.dongkuk.dmes.mcm.widget.ext.entity.ExchangeRate;
import com.dongkuk.dmes.mcm.widget.ext.entity.ExchangeRateId;
import com.dongkuk.dmes.mcm.widget.ext.repository.ExchangeRateRepository;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 환율 upsert 의 트랜잭션 경계(서비스 빈에는 {@code @Transactional} 을 두지 않는다 — A 의 SecWidgetTabWriter 방식).
 * 있는 행은 찾아서 고쳐 감사 컬럼(C_AT 등)을 보존한다.
 *
 * @deprecated 환율 위젯은 MDM 환율 마스터(FX_RATE)를 읽는다({@link FxMasterReader}). 옛 표 TB_MCM_EXCHANGE_RATE 는
 *     정리 결정 전까지 보존하므로 이 클래스는 지우지 않지만, 위젯 경로에서는 더 이상 부르지 않는다.
 */
@Deprecated
@Component("exchangeRateWriter")
public class ExchangeRateWriter {

    private static final DateTimeFormatter YMD = DateTimeFormatter.BASIC_ISO_DATE;

    private final ExchangeRateRepository repository;

    @Autowired
    public ExchangeRateWriter(ExchangeRateRepository repository) {
        this.repository = repository;
    }

    /** 같은 (일자, 기준, 대상) 행이 있으면 값·출처를 고치고 없으면 넣는다. 한 번에 같은 키가 둘이면 뒤 값. 넣거나 고친 행 수. */
    @Transactional
    public int upsert(String base, String source, List<ExchangeRatePoint> points) {
        Map<ExchangeRateId, ExchangeRatePoint> byId = new LinkedHashMap<>();
        for (ExchangeRatePoint p : points == null ? List.<ExchangeRatePoint>of() : points) {
            if (p == null || p.date() == null || p.cur() == null || p.rate() == null) continue;
            byId.put(new ExchangeRateId(p.date().format(YMD), base, p.cur()), p);
        }
        List<ExchangeRate> rows = new ArrayList<>();
        for (Map.Entry<ExchangeRateId, ExchangeRatePoint> e : byId.entrySet()) {
            ExchangeRateId id = e.getKey();
            ExchangeRate row = repository.findById(id).orElseGet(ExchangeRate::new);
            row.setRateDate(id.getRateDate());
            row.setBaseCur(id.getBaseCur());
            row.setQuoteCur(id.getQuoteCur());
            row.setRate(e.getValue().rate());
            row.setSource(source);
            rows.add(row);
        }
        repository.saveAll(rows);
        return rows.size();
    }
}
