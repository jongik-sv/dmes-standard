package com.dongkuk.dmes.mcm.widget.collect;

import com.dongkuk.dmes.mcm.widget.ext.ExchangeRatePoint;
import com.dongkuk.dmes.mcm.widget.ext.ExchangeRateProvider;
import com.dongkuk.dmes.mcm.widget.ext.FrankfurterProvider;
import com.dongkuk.dmes.mcm.widget.ext.KoreaEximProvider;
import com.dongkuk.dmes.mcm.widget.ext.WidgetExtException;
import com.dongkuk.dmes.mcm.widget.ext.WidgetExtProperties;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 내장 환율 원천 — 기준 통화 KRW 에 대한 각 통화의 값을 항목 키=통화 코드로 저장한다(스펙 2026-10-05 정시 수집 §2).
 * 값은 수집 시각 기준 7일 안({@value #LOOKBACK_DAYS}일 전~오늘)에서 <b>가장 최근 날짜</b>의 것이다 — 주말·휴일·고시 전에는 직전 영업일 값이다.
 * 7일 안에 값이 없는 통화는 건너뛰고, 모두 없으면 호출자가 실패로 기록한다.
 * {@code widget/ext} 의 제공자 빈을 <b>읽기만</b> 한다 — 제공자 선택 규칙은 {@code ExchangeService.provider()} 와 같다(provider=koreaexim 이고
 * 키가 있을 때만 한국수출입은행, 그 밖은 Frankfurter). 구간 한 번으로 받는 제공자(Frankfurter)는 7일 구간을 한 번에 묻고, 날짜마다 따로 부르는
 * 제공자(한국수출입은행)는 값이 없는 통화만 오늘부터 하루씩 거슬러 올라가며 묻는다(고시된 날을 찾으면 멈춘다 — 호출 수를 줄이려고).
 * {@code dmes.widget.ext.enabled=false} 면 외부 호출 없이 실패로 기록한다.
 */
@Component
class ExchangeCollectSource implements CollectSource<CollectConfig.ExchangeSource> {

    static final String BASE = "KRW";
    /** 값을 찾아볼 기간(수집 시각 기준 며칠 전까지). */
    static final int LOOKBACK_DAYS = 7;

    private final WidgetExtProperties properties;
    private final ExchangeRateProvider frankfurter;
    private final ExchangeRateProvider koreaExim;

    @Autowired
    ExchangeCollectSource(WidgetExtProperties properties, FrankfurterProvider frankfurter, KoreaEximProvider koreaExim) {
        this(properties, (ExchangeRateProvider) frankfurter, (ExchangeRateProvider) koreaExim);
    }

    ExchangeCollectSource(WidgetExtProperties properties, ExchangeRateProvider frankfurter, ExchangeRateProvider koreaExim) {
        this.properties = properties;
        this.frankfurter = frankfurter;
        this.koreaExim = koreaExim;
    }

    @Override
    public List<CollectItem> collect(CollectConfig.ExchangeSource source, LocalDate today) {
        if (!properties.isEnabled()) throw new CollectException("외부 정보 설정(dmes.widget.ext.enabled)이 꺼져 있어 환율을 수집하지 않습니다.");
        Map<String, ExchangeRatePoint> latest = new LinkedHashMap<>();
        LocalDate from = today.minusDays(LOOKBACK_DAYS);
        try {
            ExchangeRateProvider provider = provider();
            if (provider.callsPerDay()) {
                List<String> missing = new ArrayList<>(source.currencies());
                for (LocalDate day = today; !day.isBefore(from) && !missing.isEmpty(); day = day.minusDays(1)) {
                    keepLatest(latest, provider.fetch(BASE, List.copyOf(missing), day, day), missing, from, today);
                    missing.removeAll(latest.keySet());
                }
            } else {
                keepLatest(latest, provider.fetch(BASE, source.currencies(), from, today), source.currencies(), from, today);
            }
        } catch (WidgetExtException e) {
            throw new CollectException(e.getMessage()); // 제공자 예외는 주소를 담지 않도록 만들어져 있다
        }
        List<CollectItem> items = new ArrayList<>();
        for (String cur : source.currencies()) {
            ExchangeRatePoint p = latest.get(cur);
            if (p == null) continue; // 7일 안에 값이 없다
            CollectItem item = CollectItem.of(cur, p.rate());
            if (item != null) items.add(item);
        }
        return items;
    }

    /** 통화마다 [from, today] 안에서 가장 최근 날짜의 점을 남긴다(같은 날짜가 둘이면 앞의 것). */
    private static void keepLatest(Map<String, ExchangeRatePoint> latest, List<ExchangeRatePoint> points, Collection<String> wanted,
                                   LocalDate from, LocalDate today) {
        if (points == null) return;
        for (ExchangeRatePoint p : points) {
            if (p == null || p.cur() == null || p.rate() == null || p.date() == null || !wanted.contains(p.cur())) continue;
            if (p.date().isBefore(from) || p.date().isAfter(today)) continue;
            ExchangeRatePoint prev = latest.get(p.cur());
            if (prev == null || p.date().isAfter(prev.date())) latest.put(p.cur(), p);
        }
    }

    private ExchangeRateProvider provider() {
        WidgetExtProperties.Exchange ex = properties.getExchange();
        String wanted = ex.getProvider() == null ? "" : ex.getProvider().strip();
        boolean koreaEximWanted = KoreaEximProvider.ID.equalsIgnoreCase(wanted);
        boolean hasKey = ex.getKoreaeximKey() != null && !ex.getKoreaeximKey().isBlank();
        return koreaEximWanted && hasKey ? koreaExim : frankfurter;
    }
}
