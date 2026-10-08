package com.dongkuk.dmes.mcm.job.builtin.collect;

import com.dongkuk.dmes.mcm.widget.ext.ExchangeRatePoint;
import com.dongkuk.dmes.mcm.widget.ext.ExchangeRateProvider;
import com.dongkuk.dmes.mcm.widget.ext.FrankfurterProvider;
import com.dongkuk.dmes.mcm.widget.ext.KoreaEximProvider;
import com.dongkuk.dmes.mcm.widget.ext.WidgetExtException;
import com.dongkuk.dmes.mcm.widget.ext.WidgetExtProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 내장 환율 원천 — 기준 통화 KRW 에 대한 각 통화의 값을 항목 키=통화 코드로 저장한다(스펙 2026-10-05 정시 수집 §2).
 * 값은 수집 시각 기준 7일 안({@value #LOOKBACK_DAYS}일 전~오늘)에서 <b>가장 최근 날짜</b>의 것이다 — 주말·휴일·고시 전에는 직전 영업일 값이다.
 * 7일 안에 값이 없는 통화는 건너뛰고, 모두 없으면 호출자가 실패로 기록한다.
 * {@code widget/ext} 의 제공자 빈을 <b>읽기만</b> 한다 — 제공자 선택 규칙은 {@code ExchangeService.provider()} 와 같다(provider=koreaexim 이고
 * 키가 있을 때만 한국수출입은행, 그 밖은 Frankfurter). 구간 한 번으로 받는 제공자(Frankfurter)는 7일 구간을 한 번에 묻고, 날짜마다 따로 부르는
 * 제공자(한국수출입은행)는 값이 없는 통화만 오늘부터 하루씩 거슬러 올라가며 묻는다(고시된 날을 찾으면 멈춘다 — 호출 수를 줄이려고).
 * 같은 (제공자, 통화) 조회 결과는 30분 캐시하고 실패한 조회는 10분 동안 다시 묻지 않는다(여러 정의·회차가 같은 통화를 반복해서 외부에 묻지 않게).
 * {@code dmes.widget.ext.enabled=false} 면 외부 호출 없이 실패로 기록한다.
 */
public class ExchangeCollectSource implements CollectSource<CollectConfig.ExchangeSource> {

    static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    static final String BASE = "KRW";
    /** 값을 찾아볼 기간(수집 시각 기준 며칠 전까지). */
    static final int LOOKBACK_DAYS = 7;

    /** (제공자, 통화) 조회 결과를 쓰는 시간 — 같은 통화를 여러 정의·회차가 반복해서 외부에 묻지 않게. */
    static final Duration CACHE_TTL = Duration.ofMinutes(30);
    /** 조회가 실패한 (제공자, 통화)를 다시 묻지 않는 시간. */
    static final Duration FAIL_BACKOFF = Duration.ofMinutes(10);
    static final int CACHE_MAX_ENTRIES = 500;
    static final String MSG_BACKOFF = "최근 환율 조회가 실패해 잠시 다시 묻지 않습니다.";

    /** point 가 null 이면 「7일 안에 값 없음」(성공) 또는 실패(failed) 의 기록이다. */
    private record Entry(ExchangeRatePoint point, boolean failed, Instant until) {}

    private final WidgetExtProperties properties;
    private final ExchangeRateProvider frankfurter;
    private final ExchangeRateProvider koreaExim;
    private final Clock clock;
    private final Map<String, Entry> cache = new ConcurrentHashMap<>();

    public ExchangeCollectSource(WidgetExtProperties properties, FrankfurterProvider frankfurter, KoreaEximProvider koreaExim) {
        this(properties, (ExchangeRateProvider) frankfurter, (ExchangeRateProvider) koreaExim, Clock.system(ZONE));
    }

    public ExchangeCollectSource(WidgetExtProperties properties, ExchangeRateProvider frankfurter, ExchangeRateProvider koreaExim) {
        this(properties, frankfurter, koreaExim, Clock.system(ZONE));
    }

    public ExchangeCollectSource(WidgetExtProperties properties, ExchangeRateProvider frankfurter, ExchangeRateProvider koreaExim, Clock clock) {
        this.properties = properties;
        this.frankfurter = frankfurter;
        this.koreaExim = koreaExim;
        this.clock = clock;
    }

    /**
     * 통화마다 캐시(30분)를 먼저 보고, 없는 통화만 제공자에 묻는다. 실패한 (제공자, 통화)는 10분 동안 다시 묻지 않는다.
     * 캐시·실패 기록은 제공자별이라(제공자 id|통화) 같은 통화를 여러 정의가 요구해도 외부 호출은 한 번이다.
     */
    @Override
    public List<CollectItem> collect(CollectConfig.ExchangeSource source, LocalDate today) {
        if (!properties.isEnabled()) throw new CollectException("외부 정보 설정(dmes.widget.ext.enabled)이 꺼져 있어 환율을 수집하지 않습니다.");
        ExchangeRateProvider provider = provider();
        Instant now = clock.instant();
        LocalDate from = today.minusDays(LOOKBACK_DAYS);
        Map<String, ExchangeRatePoint> latest = new LinkedHashMap<>();
        List<String> toFetch = new ArrayList<>();
        boolean backoff = false;
        for (String cur : source.currencies()) {
            Entry e = cache.get(provider.id() + "|" + cur);
            if (e == null || !now.isBefore(e.until())) {
                toFetch.add(cur);
            } else if (e.failed()) {
                backoff = true;
            } else if (e.point() != null) {
                keepLatest(latest, List.of(e.point()), List.of(cur), from, today); // 캐시된 값도 이번 7일 창 안인지 다시 본다
            }
        }
        if (!toFetch.isEmpty()) {
            Map<String, ExchangeRatePoint> fetched = new LinkedHashMap<>();
            try {
                fetch(provider, toFetch, from, today, fetched);
            } catch (WidgetExtException ex) {
                for (String cur : toFetch) cache.put(provider.id() + "|" + cur, new Entry(null, true, now.plus(FAIL_BACKOFF)));
                trimCache(now);
                if (latest.isEmpty()) throw new CollectException(ex.getMessage()); // 제공자 예외는 주소를 담지 않도록 만들어져 있다
                fetched.clear(); // 캐시된 통화만 쓴다
                toFetch.clear();
            }
            for (String cur : toFetch) cache.put(provider.id() + "|" + cur, new Entry(fetched.get(cur), false, now.plus(CACHE_TTL)));
            trimCache(now);
            latest.putAll(fetched);
        }
        if (latest.isEmpty() && backoff) throw new CollectException(MSG_BACKOFF);
        List<CollectItem> items = new ArrayList<>();
        for (String cur : source.currencies()) {
            ExchangeRatePoint p = latest.get(cur);
            if (p == null) continue; // 7일 안에 값이 없다
            CollectItem item = CollectItem.of(cur, p.rate());
            if (item != null) items.add(item);
        }
        return items;
    }

    /** 제공자에 묻는다 — 구간 한 번(Frankfurter) 또는 날짜마다 거슬러(한국수출입은행). 결과는 통화별 가장 최근 점. */
    private static void fetch(ExchangeRateProvider provider, List<String> currencies, LocalDate from, LocalDate today,
                              Map<String, ExchangeRatePoint> out) {
        if (provider.callsPerDay()) {
            List<String> missing = new ArrayList<>(currencies);
            for (LocalDate day = today; !day.isBefore(from) && !missing.isEmpty(); day = day.minusDays(1)) {
                keepLatest(out, provider.fetch(BASE, List.copyOf(missing), day, day), missing, from, today);
                missing.removeAll(out.keySet());
            }
        } else {
            keepLatest(out, provider.fetch(BASE, currencies, from, today), currencies, from, today);
        }
    }

    /** 만료된 항목을 치우고, 그래도 상한을 넘으면 비운다(통화 코드는 정의가 정하므로 무한히 늘 수 없지만 방어). */
    private void trimCache(Instant now) {
        if (cache.size() <= CACHE_MAX_ENTRIES) return;
        cache.entrySet().removeIf(e -> !now.isBefore(e.getValue().until()));
        if (cache.size() > CACHE_MAX_ENTRIES) cache.clear();
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
