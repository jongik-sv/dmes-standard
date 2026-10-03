package com.dongkuk.dmes.mcm.widget.ext;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserQuota;
import com.dongkuk.dmes.mcm.widget.ext.entity.ExchangeRate;
import com.dongkuk.dmes.mcm.widget.ext.repository.ExchangeRateRepository;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
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
import java.util.TreeSet;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 환율 조회 — 스펙 §8.1. DB({@code TB_MCM_EXCHANGE_RATE})에 쌓인 {@code [오늘-days, 오늘]} 값을 읽고, 빠진 영업일(월~금)이
 * 있으면 제공자에 물어 upsert 한 뒤 돌려준다.
 * <ul>
 *   <li><b>허용 목록</b>: 요청(통화 묶음·기간)은 사용 중인 환율 위젯 정의 하나의 범위 안이어야 한다({@link ExchangeAllowList}).</li>
 *   <li><b>시도 기록</b>은 (제공자, 통화, 날짜) 단위다 — 통화 조합·기간을 바꿔 불러도 이미 물어본 날짜를 다시 묻지 않는다.
 *       DB 에 있는 날짜는 묻지 않는다. 제공자가 답했는데 지난 날짜 값이 없으면(휴일) 그날은 끝까지, 오늘 값이 없으면(고시 전)
 *       {@code retry-after-fail-sec}(기본 10분) 뒤에 다시 묻는다. 호출 실패·일부만 받음도 같은 시간 동안 다시 묻지 않고, 그동안
 *       응답에 {@code stale: true} 를 붙인다.</li>
 *   <li>물을 날짜는 잠금 안에서 먼저 「진행 중」으로 적는다 — 동시에 온 요청이 같은 날짜를 함께 묻지 않는다.</li>
 *   <li><b>속도 제한</b>: 외부 호출을 일으키는 요청만 사용자별로 센다({@code user-fetch-limit}회 / {@code user-fetch-window-sec}초,
 *       기본 10회/10분). 넘으면 「환율 조회 요청이 너무 잦습니다」 로 거절한다. DB 값만으로 답하는 요청은 세지 않는다.</li>
 *   <li>날짜마다 부르는 제공자(한국수출입은행)는 빈 날의 이어진 구간만 나눠 부른다. 구간 한 번으로 받는 제공자(Frankfurter)는
 *       첫 빈 날 ~ 마지막 빈 날 한 번.</li>
 *   <li>받기는 했는데 저장(upsert)이 실패하면 받은 값은 이번 응답에만 쓰고, 진행 중 기록을 지워 다음 호출이 다시 받게 한다.</li>
 *   <li>제공자가 내주지 않는 통화(다른 통화 값은 왔는데 그 통화만 한 번도 없음 — 예: Frankfurter 의 VND)는
 *       {@value #UNSUPPORTED_DAYS}일 동안 빈 날 판정에서 뺀다.</li>
 *   <li>{@code dmes.widget.ext.enabled=false} 면 외부 호출 없이 DB 값만(없으면 빈 결과 + {@code disabled: true}).</li>
 * </ul>
 * 기록(시도·실패·미지원)은 각각 {@value #MAX_ATTEMPTS}개(제공자|통화)까지, 속도 제한은 사용자 {@value #MAX_QUOTA_USERS}명까지 —
 * 가장 오래 안 쓴 것부터 버린다. 기록은 한 잠금으로만 만진다(접근 순서 맵은 get 도 구조를 바꾼다). 모든 기록은 메모리라
 * 인스턴스마다 따로이고 재기동하면 비워진다(다중 인스턴스 공유는 범위 밖).
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
    static final int MAX_QUOTA_USERS = 10_000;
    static final int UNSUPPORTED_DAYS = 7;
    static final int DEFAULT_USER_FETCH_LIMIT = 10;
    static final int DEFAULT_USER_FETCH_WINDOW_SEC = 600;
    static final int DEFAULT_RETRY_AFTER_FAIL_SEC = 600;
    static final String MSG_TOO_MANY = "환율 조회 요청이 너무 잦습니다. 잠시 뒤 다시 시도하세요.";

    private static final Logger log = LoggerFactory.getLogger(ExchangeService.class);
    private static final Pattern CUR = Pattern.compile("^[A-Z]{3}$");
    private static final DateTimeFormatter YMD = DateTimeFormatter.BASIC_ISO_DATE;

    /** 이번 요청이 묻기로 잡은 날짜(오름차순)와 그 (통화, 날짜) 진행 중 기록. */
    private record Claim(TreeSet<LocalDate> dates, Map<String, Set<LocalDate>> pairs) {}

    private final WidgetExtProperties properties;
    private final ExchangeRateRepository repository;
    private final ExchangeRateWriter writer;
    private final ExchangeRateProvider frankfurter;
    private final ExchangeRateProvider koreaExim;
    private final ExchangeAllowList allowList;
    private final Clock clock;
    private final Object lock = new Object();
    /** 제공자|통화 → (날짜 → 이 시각 전에는 그 날짜를 다시 묻지 않는다). */
    private final Map<String, Map<LocalDate, Instant>> settled = lru(MAX_ATTEMPTS);
    /** 제공자|통화 → 최근 호출 실패로 stale 을 붙이는 끝 시각. */
    private final Map<String, Instant> failedUntil = lru(MAX_ATTEMPTS);
    /** 제공자|통화 → 그 제공자가 이 통화를 내주지 않는다고 마지막으로 확인한 날. */
    private final Map<String, LocalDate> unsupported = lru(MAX_ATTEMPTS);
    /** 사용자 → 외부 호출을 일으킨 요청 수(구간별). */
    private final WidgetUserQuota fetchQuota = new WidgetUserQuota(MAX_QUOTA_USERS);

    @Autowired
    public ExchangeService(WidgetExtProperties properties, ExchangeRateRepository repository, ExchangeRateWriter writer,
                           FrankfurterProvider frankfurter, KoreaEximProvider koreaExim, ExchangeAllowList allowList) {
        this(properties, repository, writer, frankfurter, koreaExim, allowList, Clock.system(ZONE));
    }

    ExchangeService(WidgetExtProperties properties, ExchangeRateRepository repository, ExchangeRateWriter writer,
                    ExchangeRateProvider frankfurter, ExchangeRateProvider koreaExim, ExchangeAllowList allowList,
                    Clock clock) {
        this.properties = properties;
        this.repository = repository;
        this.writer = writer;
        this.frankfurter = frankfurter;
        this.koreaExim = koreaExim;
        this.allowList = allowList;
        this.clock = clock;
    }

    /**
     * {@code { latest: [{cur, rate, diff, date}], history: [{date, cur, rate}] }} (+ {@code stale}·{@code disabled}).
     *
     * @param userId 인증 사용자(속도 제한 단위) — 호출자가 인증 컨텍스트에서 얻는다
     */
    public Map<String, Object> exchange(String base, Object symbols, Integer days, String userId) {
        String b = base == null || base.isBlank() ? BASE_KRW : base.trim().toUpperCase(Locale.ROOT);
        if (!BASE_KRW.equals(b)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "기준 통화는 KRW 만 지원합니다.");
        }
        List<String> syms = parseSymbols(symbols, b);
        int d = days == null ? DEFAULT_DAYS : days;
        if (d < 1 || d > MAX_DAYS) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "기간은 1~" + MAX_DAYS + "일 사이여야 합니다.");
        }
        allowList.require(syms, d);
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
            Instant now = clock.instant();
            List<String> check = checkable(provider.id(), syms, today);
            Claim claim = claim(provider.id(), check, from, today, byDate, now, userId);
            stale = claim == null
                    ? recentlyFailed(provider.id(), check, from, today, byDate, now)
                    : fill(provider, b, syms, claim, from, today, byDate, now);
        }

        Map<String, Object> result = toResult(syms, byDate);
        if (stale) result.put("stale", true);
        if (!properties.isEnabled() && byDate.isEmpty()) result.put("disabled", true);
        return result;
    }

    /**
     * 빈 날 중 아직 묻지 않은 (통화, 날짜)를 잠금 안에서 「진행 중」으로 적는다. 물을 것이 없으면 null.
     * 물을 것이 있으면 이 사용자의 속도 제한을 먼저 센다(넘으면 아무것도 적지 않고 거절).
     */
    private Claim claim(String providerId, List<String> check, LocalDate from, LocalDate today,
                        Map<LocalDate, Map<String, ExchangeRatePoint>> byDate, Instant now, String userId) {
        synchronized (lock) {
            TreeSet<LocalDate> dates = new TreeSet<>();
            Map<String, Set<LocalDate>> pairs = new LinkedHashMap<>();
            for (String cur : check) {
                for (LocalDate day : missingBusinessDays(from, today, cur, byDate)) {
                    if (isSettled(providerId + "|" + cur, day, now)) continue;
                    dates.add(day);
                    pairs.computeIfAbsent(cur, k -> new TreeSet<>()).add(day);
                }
            }
            if (dates.isEmpty()) return null;
            long window = Math.floorDiv(now.getEpochSecond(), userFetchWindow().toSeconds());
            if (!fetchQuota.tryAcquire(userId, window, userFetchLimit())) {
                log.info("[widgetExt] 환율 외부 호출 속도 제한 — userId={}", userId);
                throw new BusinessException(ErrorCode.BUSINESS_ERROR, MSG_TOO_MANY);
            }
            Instant inFlightUntil = now.plus(retryAfterFail());
            pairs.forEach((cur, days) -> days.forEach(day -> settle(providerId + "|" + cur, day, inFlightUntil, now)));
            return new Claim(dates, pairs);
        }
    }

    /** 제공자에 묻고 upsert·합치기, 시도 기록 정리. 돌려주는 값 = stale 여부. */
    private boolean fill(ExchangeRateProvider provider, String base, List<String> syms, Claim claim,
                         LocalDate from, LocalDate today, Map<LocalDate, Map<String, ExchangeRatePoint>> byDate,
                         Instant now) {
        List<LocalDate[]> ranges = provider.callsPerDay()
                ? runs(claim.dates())
                : List.<LocalDate[]>of(new LocalDate[] {claim.dates().first(), claim.dates().last()});

        List<ExchangeRatePoint> fetched = new ArrayList<>();
        List<LocalDate[]> asked = new ArrayList<>();
        boolean failed = false;
        for (LocalDate[] range : ranges) {
            asked.add(range);
            try {
                List<ExchangeRatePoint> got = provider.fetch(base, syms, range[0], range[1]);
                if (got != null) fetched.addAll(got);
            } catch (WidgetExtPartialException e) {
                // 앞 날짜 값만 받았다 — 받은 값은 살리되, 정상으로 보이지 않게 stale 로 알리고 실패로 기록한다.
                log.warn("[widgetExt] 환율 제공자({}) 일부만 받음 — 받은 값만 쓰고 stale 로 알린다: {}", provider.id(), e.getMessage());
                fetched.addAll(e.partial());
                failed = true;
                break;
            } catch (RuntimeException e) {
                // 원인 예외(주소·인증키가 든 메시지)는 남기지 않는다.
                log.warn("[widgetExt] 환율 제공자({}) 호출 실패 — DB 값만 돌려준다: {}", provider.id(), e.getMessage());
                failed = true;
                break;
            }
        }

        if (!failed && !fetched.isEmpty()) remember(provider.id(), syms, fetched, today);
        boolean saved = true;
        if (!fetched.isEmpty()) {
            try {
                writer.upsert(base, provider.id(), fetched);
            } catch (RuntimeException e) {
                // 예: 다른 요청이 같은 행을 동시에 넣어 PK 충돌. 다음 호출이 다시 받아 저장하게 진행 중 기록을 지운다.
                log.warn("[widgetExt] 환율 저장 실패 — 받은 값은 이번 응답에만 쓰고 다음 호출에서 다시 받는다: {}", e.getMessage());
                saved = false;
            }
        }
        Set<String> wanted = Set.copyOf(syms);
        for (ExchangeRatePoint p : fetched) {
            if (p == null || p.date() == null || p.rate() == null || !wanted.contains(p.cur())) continue;
            if (p.date().isBefore(from) || p.date().isAfter(today)) continue;
            byDate.computeIfAbsent(p.date(), k -> new LinkedHashMap<>()).put(p.cur(), p);
        }

        synchronized (lock) {
            if (!saved) {
                claim.pairs().forEach((cur, days) -> days.forEach(day -> unsettle(provider.id() + "|" + cur, day)));
                return failed;
            }
            Instant retryAt = now.plus(retryAfterFail());
            Instant endOfToday = today.plusDays(1).atStartOfDay(ZONE).toInstant();
            for (LocalDate[] range : asked) {
                for (LocalDate day = range[0]; !day.isAfter(range[1]); day = day.plusDays(1)) {
                    if (isWeekend(day)) continue;
                    for (String cur : syms) {
                        if (has(byDate, day, cur)) continue;
                        // 실패면 짧게, 답했는데 지난 날짜 값이 없으면(휴일) 오늘 끝까지, 오늘 값이 없으면(고시 전) 짧게.
                        Instant until = failed || !day.isBefore(today) ? retryAt : endOfToday;
                        settle(provider.id() + "|" + cur, day, until, now);
                    }
                }
            }
            for (String cur : syms) {
                if (failed) failedUntil.put(provider.id() + "|" + cur, retryAt);
                else failedUntil.remove(provider.id() + "|" + cur);
            }
        }
        return failed;
    }

    /** 최근 호출 실패가 기록된 통화에 아직 빈 날이 있으면 stale(다시 묻기 전까지 DB 값만 돌려주는 중). */
    private boolean recentlyFailed(String providerId, List<String> check, LocalDate from, LocalDate today,
                                   Map<LocalDate, Map<String, ExchangeRatePoint>> byDate, Instant now) {
        synchronized (lock) {
            for (String cur : check) {
                Instant until = failedUntil.get(providerId + "|" + cur);
                if (until != null && now.isBefore(until) && !missingBusinessDays(from, today, cur, byDate).isEmpty()) {
                    return true;
                }
            }
            return false;
        }
    }

    /** provider=koreaexim 이고 키가 있을 때만 한국수출입은행, 그 밖은 Frankfurter. */
    private ExchangeRateProvider provider() {
        WidgetExtProperties.Exchange ex = properties.getExchange();
        boolean koreaEximWanted = KoreaEximProvider.ID.equalsIgnoreCase(trimToEmpty(ex.getProvider()));
        boolean hasKey = ex.getKoreaeximKey() != null && !ex.getKoreaeximKey().isBlank();
        return koreaEximWanted && hasKey ? koreaExim : frankfurter;
    }

    private int userFetchLimit() {
        int v = properties.getExchange().getUserFetchLimit();
        return v > 0 ? v : DEFAULT_USER_FETCH_LIMIT;
    }

    private Duration userFetchWindow() {
        int v = properties.getExchange().getUserFetchWindowSec();
        return Duration.ofSeconds(v > 0 ? v : DEFAULT_USER_FETCH_WINDOW_SEC);
    }

    private Duration retryAfterFail() {
        int v = properties.getExchange().getRetryAfterFailSec();
        return Duration.ofSeconds(v > 0 ? v : DEFAULT_RETRY_AFTER_FAIL_SEC);
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

    // ── 시도 기록(늘 lock 안에서) ─────────────────────────────────────────

    private boolean isSettled(String key, LocalDate day, Instant now) {
        Map<LocalDate, Instant> days = settled.get(key);
        if (days == null) return false;
        Instant until = days.get(day);
        if (until == null) return false;
        if (now.isBefore(until)) return true;
        days.remove(day);
        return false;
    }

    private void settle(String key, LocalDate day, Instant until, Instant now) {
        Map<LocalDate, Instant> days = settled.computeIfAbsent(key, k -> new TreeMap<>());
        days.values().removeIf(u -> !now.isBefore(u)); // 지난 기록은 버린다(통화마다 많아야 기간 일수만큼)
        days.put(day, until);
    }

    private void unsettle(String key, LocalDate day) {
        Map<LocalDate, Instant> days = settled.get(key);
        if (days != null) days.remove(day);
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

    /** [from, today] 의 월~금 중 그 통화 값이 없는 날. */
    private static List<LocalDate> missingBusinessDays(LocalDate from, LocalDate today, String cur,
                                                       Map<LocalDate, Map<String, ExchangeRatePoint>> byDate) {
        List<LocalDate> out = new ArrayList<>();
        for (LocalDate day = from; !day.isAfter(today); day = day.plusDays(1)) {
            if (!isWeekend(day) && !has(byDate, day, cur)) out.add(day);
        }
        return out;
    }

    /** 오름차순 날짜를 이어진 영업일 구간으로 나눈다(사이의 주말은 이어진 것으로 본다 — 제공자가 주말은 부르지 않는다). */
    static List<LocalDate[]> runs(TreeSet<LocalDate> dates) {
        List<LocalDate[]> out = new ArrayList<>();
        LocalDate start = null;
        LocalDate prev = null;
        for (LocalDate day : dates) {
            if (prev != null && day.equals(nextBusinessDay(prev))) {
                prev = day;
                continue;
            }
            if (start != null) out.add(new LocalDate[] {start, prev});
            start = day;
            prev = day;
        }
        if (start != null) out.add(new LocalDate[] {start, prev});
        return out;
    }

    private static LocalDate nextBusinessDay(LocalDate day) {
        LocalDate next = day.plusDays(1);
        while (isWeekend(next)) next = next.plusDays(1);
        return next;
    }

    private static boolean isWeekend(LocalDate day) {
        return day.getDayOfWeek() == DayOfWeek.SATURDAY || day.getDayOfWeek() == DayOfWeek.SUNDAY;
    }

    private static boolean has(Map<LocalDate, Map<String, ExchangeRatePoint>> byDate, LocalDate day, String cur) {
        Map<String, ExchangeRatePoint> have = byDate.get(day);
        return have != null && have.containsKey(cur);
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

    /** 시험용 — 시도 기록을 가진 (제공자|통화) 수. */
    int attemptsSize() {
        synchronized (lock) {
            return settled.size();
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
