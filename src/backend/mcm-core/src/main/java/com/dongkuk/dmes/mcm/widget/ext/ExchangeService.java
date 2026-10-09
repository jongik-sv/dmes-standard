package com.dongkuk.dmes.mcm.widget.ext;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 환율 조회 — MDM 환율 마스터(마스터 {@code FX_RATE})의 {@code [오늘-days, 오늘]} 값을 읽어 위젯 응답으로 조립한다
 * (설계 2026-10-09-mdm-fx-master §2 D4·§6). 마스터 값은 mdm 예약 작업 {@code mdm.exchangeRateSync} 가 채우며, 이 서비스는
 * 외부 제공자를 부르지 않고 아무것도 쓰지 않는다({@link FxMasterReader} 가 읽기 전용 한 쿼리로 읽는다).
 * <ul>
 *   <li><b>허용 목록</b>: 요청(통화 묶음·기간)은 사용 중인 환율 위젯 정의 하나의 범위 안이어야 한다({@link ExchangeAllowList}).</li>
 *   <li>값이 하나도 없으면 {@code empty: true}(+ 빈 {@code latest}·{@code history}). 단 {@code dmes.widget.ext.enabled=false} 이면
 *       옛 동작대로 {@code disabled: true} 로 답한다(값이 있으면 둘 다 붙이지 않고 값만 돌려준다).</li>
 *   <li>가장 최근 기준일이 오늘 기준 {@value #STALE_DAYS}일을 넘게 지났으면 {@code stale: true} — 위젯이 「갱신 실패」 를 보인다.</li>
 *   <li>마스터 표를 못 읽는 사이트는 값이 없는 것과 같다(경고 로그는 {@link FxMasterReader} 가 한 번 남긴다).</li>
 * </ul>
 * 날짜는 응답에서 {@code yyyy-MM-dd}, 값은 JSON 숫자(double)로 준다.
 */
@Service("widgetExchangeService")
public class ExchangeService {

    static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    static final String BASE_KRW = "KRW";
    static final int DEFAULT_DAYS = 30;
    static final int MAX_DAYS = 90;
    static final int MAX_SYMBOLS = 10;
    /** 가장 최근 기준일이 이만큼(일)을 넘게 지났으면 낡음 — 연휴(최장 약 열흘)에 오탐하지 않는 값. */
    static final int STALE_DAYS = 10;

    private static final Pattern CUR = Pattern.compile("^[A-Z]{3}$");

    private final WidgetExtProperties properties;
    private final FxMasterReader reader;
    private final ExchangeAllowList allowList;
    private final Clock clock;

    @Autowired
    public ExchangeService(WidgetExtProperties properties, FxMasterReader reader, ExchangeAllowList allowList) {
        this(properties, reader, allowList, Clock.system(ZONE));
    }

    ExchangeService(WidgetExtProperties properties, FxMasterReader reader, ExchangeAllowList allowList, Clock clock) {
        this.properties = properties;
        this.reader = reader;
        this.allowList = allowList;
        this.clock = clock;
    }

    /**
     * {@code { latest: [{cur, rate, diff, date}], history: [{date, cur, rate}] }} (+ {@code stale}·{@code empty}·{@code disabled}).
     *
     * @param userId 인증 사용자 — 이전 외부 호출 속도 제한의 단위였고, 지금은 쓰이지 않는다(호출 계약 유지용)
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

        // (일자, 통화) → 값
        TreeMap<LocalDate, Map<String, ExchangeRatePoint>> byDate = new TreeMap<>();
        for (ExchangeRatePoint p : reader.read(b, syms, from, today)) {
            byDate.computeIfAbsent(p.date(), k -> new LinkedHashMap<>()).put(p.cur(), p);
        }

        Map<String, Object> result = toResult(syms, byDate);
        if (byDate.isEmpty()) {
            result.put(properties.isEnabled() ? "empty" : "disabled", true);
        } else if (ChronoUnit.DAYS.between(byDate.lastKey(), today) > STALE_DAYS) {
            result.put("stale", true);
        }
        return result;
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
}
