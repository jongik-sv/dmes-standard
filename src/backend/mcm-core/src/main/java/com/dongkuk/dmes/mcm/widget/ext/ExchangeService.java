package com.dongkuk.dmes.mcm.widget.ext;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.widget.ext.entity.ExchangeRate;
import com.dongkuk.dmes.mcm.widget.ext.repository.ExchangeRateRepository;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 환율 조회 — 스펙 §8.1. DB({@code TB_MCM_EXCHANGE_RATE})에 쌓인 {@code [오늘-days, 오늘]} 값을 읽고, 빠진 영업일(월~금)이
 * 있으면 첫 빈 날 ~ 마지막 빈 날 구간만 제공자에 물어 upsert 한 뒤 돌려준다.
 * <ul>
 *   <li>같은 날 같은 통화 묶음(기준·통화·기간)은 하루 한 번만 시도한다(휴일처럼 늘 비는 날 때문에 매번 부르지 않게).</li>
 *   <li>제공자 실패면 DB 값만 + {@code stale: true}. 같은 날 다시 불러도 시도하지 않고 stale 을 유지한다.</li>
 *   <li>받기는 했는데 저장(upsert)이 실패하면 받은 값은 이번 응답에만 쓰고, 시도 기록을 지워 다음 호출이 다시 받게 한다.</li>
 *   <li>제공자가 내주지 않는 통화(다른 통화 값은 왔는데 그 통화만 한 번도 없음 — 예: Frankfurter 의 VND)는
 *       {@value #UNSUPPORTED_DAYS}일 동안 빈 날 판정에서 뺀다. 그 통화 때문에 날마다 기간 전체를 다시 받지 않게.</li>
 *   <li>{@code dmes.widget.ext.enabled=false} 면 외부 호출 없이 DB 값만(없으면 빈 결과 + {@code disabled: true}).</li>
 * </ul>
 * 시도 기록·미지원 통화 기록은 각각 {@value #MAX_ATTEMPTS}개까지(가장 오래 안 쓴 것부터 버린다) — 아무 통화·기간 조합으로
 * 메모리를 채우지 못하게. 두 기록은 한 잠금으로만 만진다(접근 순서 맵은 get 도 구조를 바꾼다).
 * 날짜는 응답에서 {@code yyyy-MM-dd}, 값은 JSON 숫자(double)로 준다.
 */
@Service("widgetExchangeService")
public class ExchangeService {

    static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    static final String BASE_KRW = "KRW";
    static final int DEFAULT_DAYS = 30;
    static final int MAX_DAYS = 90;
    static final int MAX_SYMBOLS = 10;
    static final int MAX_ATTEMPTS = 1000;
    static final int UNSUPPORTED_DAYS = 7;

    private static final Logger log = LoggerFactory.getLogger(ExchangeService.class);
    private static final Pattern CUR = Pattern.compile("^[A-Z]{3}$");
    private static final DateTimeFormatter YMD = DateTimeFormatter.BASIC_ISO_DATE;

    /** 오늘 시도했는지와 실패했는지(통화 묶음 키별, 오늘 것만 남긴다). */
    private record Attempt(LocalDate date, boolean failed) {}

    private final WidgetExtProperties properties;
    private final ExchangeRateRepository repository;
    private final ExchangeRateWriter writer;
    private final ExchangeRateProvider frankfurter;
    private final ExchangeRateProvider koreaExim;
    private final Clock clock;
    private final Object lock = new Object();
    /** 통화 묶음 키(기준|통화|기간) → 오늘 시도. */
    private final Map<String, Attempt> attempts = lru(MAX_ATTEMPTS);
    /** 제공자|통화 → 그 제공자가 이 통화를 내주지 않는다고 마지막으로 확인한 날. */
    private final Map<String, LocalDate> unsupported = lru(MAX_ATTEMPTS);

    @Autowired
    public ExchangeService(WidgetExtProperties properties, ExchangeRateRepository repository, ExchangeRateWriter writer,
                           FrankfurterProvider frankfurter, KoreaEximProvider koreaExim) {
        this(properties, repository, writer, frankfurter, koreaExim, Clock.system(ZONE));
    }

    ExchangeService(WidgetExtProperties properties, ExchangeRateRepository repository, ExchangeRateWriter writer,
                    ExchangeRateProvider frankfurter, ExchangeRateProvider koreaExim, Clock clock) {
        this.properties = properties;
        this.repository = repository;
        this.writer = writer;
        this.frankfurter = frankfurter;
        this.koreaExim = koreaExim;
        this.clock = clock;
    }

    /** {@code { latest: [{cur, rate, diff, date}], history: [{date, cur, rate}] }} (+ {@code stale}·{@code disabled}). */
    public Map<String, Object> exchange(String base, Object symbols, Integer days) {
        String b = base == null || base.isBlank() ? BASE_KRW : base.trim().toUpperCase(Locale.ROOT);
        if (!BASE_KRW.equals(b)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "기준 통화는 KRW 만 지원합니다.");
        }
        List<String> syms = parseSymbols(symbols, b);
        int d = days == null ? DEFAULT_DAYS : days;
        if (d < 1 || d > MAX_DAYS) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "기간은 1~" + MAX_DAYS + "일 사이여야 합니다.");
        }
        LocalDate today = LocalDate.now(clock);
        LocalDate from = today.minusDays(d);

        // (일자, 통화) → 값. DB 값 위에 새로 받은 값을 덮는다.
        Map<LocalDate, Map<String, ExchangeRatePoint>> byDate = new TreeMap<>();
        for (ExchangeRate r : repository.findByBaseCurAndQuoteCurInAndRateDateBetweenOrderByRateDateAsc(
                b, syms, from.format(YMD), today.format(YMD))) {
            LocalDate date = parseYmd(r.getRateDate());
            if (date == null || r.getRate() == null) continue;
            byDate.computeIfAbsent(date, k -> new LinkedHashMap<>())
                    .put(r.getQuoteCur(), new ExchangeRatePoint(date, r.getQuoteCur(), r.getRate()));
        }

        boolean stale = false;
        if (properties.isEnabled()) {
            ExchangeRateProvider provider = provider();
            List<LocalDate> missing = missingBusinessDays(from, today, checkable(provider.id(), syms, today), byDate);
            if (!missing.isEmpty()) {
                stale = fill(provider, b, syms, d, today, missing.get(0), missing.get(missing.size() - 1), from, byDate);
            }
        }

        Map<String, Object> result = toResult(syms, byDate);
        if (stale) result.put("stale", true);
        if (!properties.isEnabled() && byDate.isEmpty()) result.put("disabled", true);
        return result;
    }

    /** 오늘 처음이면 제공자에 묻고 upsert·합치기. 돌려주는 값 = stale 여부. */
    private boolean fill(ExchangeRateProvider provider, String base, List<String> syms, int days, LocalDate today,
                         LocalDate missFrom, LocalDate missTo, LocalDate from,
                         Map<LocalDate, Map<String, ExchangeRatePoint>> byDate) {
        String key = base + "|" + String.join(",", syms.stream().sorted().toList()) + "|" + days;
        Attempt mine = new Attempt(today, false);
        synchronized (lock) {
            Attempt old = attempts.get(key);
            if (old != null && old.date().equals(today)) {
                return old.failed(); // 오늘 이미 시도했다
            }
            attempts.values().removeIf(a -> !a.date().equals(today));
            attempts.put(key, mine);
        }

        List<ExchangeRatePoint> fetched;
        try {
            fetched = provider.fetch(base, syms, missFrom, missTo);
        } catch (RuntimeException e) {
            // 원인 예외(주소·인증키가 든 메시지)는 남기지 않는다.
            log.warn("[widgetExt] 환율 제공자({}) 호출 실패 — DB 값만 돌려준다: {}", provider.id(), e.getMessage());
            synchronized (lock) {
                attempts.put(key, new Attempt(today, true));
            }
            return true;
        }
        if (fetched == null || fetched.isEmpty()) return false;
        remember(provider.id(), syms, fetched, today);
        try {
            writer.upsert(base, provider.id(), fetched);
        } catch (RuntimeException e) {
            // 예: 다른 묶음이 같은 행을 동시에 넣어 PK 충돌. 다음 호출이 다시 받아 저장하게 시도 기록을 지운다.
            log.warn("[widgetExt] 환율 저장 실패 — 받은 값은 이번 응답에만 쓰고 다음 호출에서 다시 받는다: {}", e.getMessage());
            synchronized (lock) {
                attempts.remove(key, mine);
            }
        }
        Set<String> wanted = Set.copyOf(syms);
        for (ExchangeRatePoint p : fetched) {
            if (p == null || p.date() == null || p.rate() == null || !wanted.contains(p.cur())) continue;
            if (p.date().isBefore(from) || p.date().isAfter(today)) continue;
            byDate.computeIfAbsent(p.date(), k -> new LinkedHashMap<>()).put(p.cur(), p);
        }
        return false;
    }

    /** provider=koreaexim 이고 키가 있을 때만 한국수출입은행, 그 밖은 Frankfurter. */
    private ExchangeRateProvider provider() {
        WidgetExtProperties.Exchange ex = properties.getExchange();
        boolean koreaEximWanted = KoreaEximProvider.ID.equalsIgnoreCase(trimToEmpty(ex.getProvider()));
        boolean hasKey = ex.getKoreaeximKey() != null && !ex.getKoreaeximKey().isBlank();
        return koreaEximWanted && hasKey ? koreaExim : frankfurter;
    }

    /**
     * 받은 값에 한 번도 나오지 않은 통화를 이 제공자의 미지원 통화로 적고, 나온 통화는 지운다.
     * 묻은 통화 중 하나라도 값이 왔을 때만 판단한다(아무것도 안 왔으면 아직 고시 전·휴일일 수 있다).
     */
    private void remember(String providerId, List<String> syms, List<ExchangeRatePoint> fetched, LocalDate today) {
        Set<String> seen = new HashSet<>();
        for (ExchangeRatePoint p : fetched) {
            if (p != null && p.rate() != null && syms.contains(p.cur())) seen.add(p.cur());
        }
        if (seen.isEmpty()) return;
        synchronized (lock) {
            for (String s : syms) {
                if (seen.contains(s)) unsupported.remove(providerId + "|" + s);
                else unsupported.put(providerId + "|" + s, today);
            }
        }
    }

    /** 빈 날 판정에 쓸 통화 — 최근 {@value #UNSUPPORTED_DAYS}일 안에 이 제공자의 미지원으로 확인된 통화는 뺀다. */
    private List<String> checkable(String providerId, List<String> syms, LocalDate today) {
        List<String> out = new ArrayList<>();
        synchronized (lock) {
            for (String s : syms) {
                LocalDate marked = unsupported.get(providerId + "|" + s);
                if (marked == null || !marked.plusDays(UNSUPPORTED_DAYS).isAfter(today)) out.add(s);
            }
        }
        return out;
    }

    /** 가장 오래 안 쓴 항목부터 버리는 맵(접근 순서). 늘 {@link #lock} 안에서만 만진다. */
    private static <V> Map<String, V> lru(int max) {
        return new LinkedHashMap<>(64, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, V> eldest) {
                return size() > max;
            }
        };
    }

    /** [from, today] 의 월~금 중 묻는 통화 하나라도 값이 없는 날. 볼 통화가 없으면 빈 날도 없다. */
    private static List<LocalDate> missingBusinessDays(LocalDate from, LocalDate today, List<String> syms,
                                                       Map<LocalDate, Map<String, ExchangeRatePoint>> byDate) {
        List<LocalDate> out = new ArrayList<>();
        if (syms.isEmpty()) return out;
        for (LocalDate day = from; !day.isAfter(today); day = day.plusDays(1)) {
            if (day.getDayOfWeek() == DayOfWeek.SATURDAY || day.getDayOfWeek() == DayOfWeek.SUNDAY) continue;
            Map<String, ExchangeRatePoint> have = byDate.get(day);
            if (have == null || !have.keySet().containsAll(syms)) out.add(day);
        }
        return out;
    }

    private static Map<String, Object> toResult(List<String> syms, Map<LocalDate, Map<String, ExchangeRatePoint>> byDate) {
        List<Map<String, Object>> history = new ArrayList<>();
        Map<String, List<ExchangeRatePoint>> perCur = new LinkedHashMap<>();
        for (String s : syms) perCur.put(s, new ArrayList<>());
        for (Map<String, ExchangeRatePoint> day : byDate.values()) { // 날짜 오름차순(TreeMap)
            for (String s : syms) {
                ExchangeRatePoint p = day.get(s);
                if (p == null) continue;
                perCur.get(s).add(p);
                Map<String, Object> h = new LinkedHashMap<>();
                h.put("date", p.date().toString());
                h.put("cur", p.cur());
                h.put("rate", p.rate().doubleValue());
                history.add(h);
            }
        }
        List<Map<String, Object>> latest = new ArrayList<>();
        for (Map.Entry<String, List<ExchangeRatePoint>> e : perCur.entrySet()) {
            List<ExchangeRatePoint> points = e.getValue();
            if (points.isEmpty()) continue;
            points.sort(Comparator.comparing(ExchangeRatePoint::date));
            ExchangeRatePoint last = points.get(points.size() - 1);
            ExchangeRatePoint prev = points.size() > 1 ? points.get(points.size() - 2) : null;
            Map<String, Object> l = new LinkedHashMap<>();
            l.put("cur", e.getKey());
            l.put("rate", last.rate().doubleValue());
            l.put("diff", prev == null ? null : last.rate().subtract(prev.rate()).doubleValue());
            l.put("date", last.date().toString());
            latest.add(l);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("latest", latest);
        result.put("history", history);
        return result;
    }

    /**
     * 쉼표 문자열({@code "USD,EUR"}) 또는 grids 행 목록({@code [{cur:"USD"}]} — cur 가 없으면 행의 첫 값).
     * 앞뒤 공백을 지우고 대문자로 바꾼 뒤 영문 3자리만, 중복은 한 번, 기준 통화 제외, 1~10개.
     */
    static List<String> parseSymbols(Object raw, String base) {
        List<String> tokens = new ArrayList<>();
        if (raw instanceof String s) {
            for (String t : s.split(",")) tokens.add(t);
        } else if (raw instanceof Collection<?> rows) {
            for (Object row : rows) {
                if (row instanceof Map<?, ?> m) {
                    Object v = m.containsKey("cur") ? m.get("cur") : m.values().stream().findFirst().orElse(null);
                    if (v != null) tokens.add(String.valueOf(v));
                } else if (row != null) {
                    tokens.add(String.valueOf(row));
                }
            }
        } else if (raw != null) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "대상 통화 형식이 올바르지 않습니다.");
        }
        Set<String> out = new LinkedHashSet<>();
        for (String t : tokens) {
            String cur = t.trim().toUpperCase(Locale.ROOT);
            if (cur.isEmpty()) continue;
            if (!CUR.matcher(cur).matches()) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, "통화 코드는 영문 3자리여야 합니다: " + cur);
            }
            if (cur.equals(base)) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, "기준 통화(" + base + ")는 대상 통화로 고를 수 없습니다.");
            }
            out.add(cur);
        }
        if (out.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "대상 통화를 하나 이상 고르세요.");
        }
        if (out.size() > MAX_SYMBOLS) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "대상 통화는 " + MAX_SYMBOLS + "개까지 고를 수 있습니다.");
        }
        return List.copyOf(out);
    }

    /** 시험용 — 지금 남아 있는 시도 기록 수. */
    int attemptsSize() {
        synchronized (lock) {
            return attempts.size();
        }
    }

    private static LocalDate parseYmd(String ymd) {
        try {
            return ymd == null ? null : LocalDate.parse(ymd.trim(), YMD);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static String trimToEmpty(String s) {
        return s == null ? "" : s.trim();
    }
}
