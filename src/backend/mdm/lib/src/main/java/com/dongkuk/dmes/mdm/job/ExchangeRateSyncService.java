package com.dongkuk.dmes.mdm.job;

import com.dongkuk.dmes.mcm.job.agent.JobContext;
import com.dongkuk.dmes.mcm.widget.ext.ExchangeRatePoint;
import com.dongkuk.dmes.mcm.widget.ext.ExchangeRateProvider;
import com.dongkuk.dmes.mcm.widget.ext.FrankfurterProvider;
import com.dongkuk.dmes.mcm.widget.ext.KoreaEximProvider;
import com.dongkuk.dmes.mcm.widget.ext.WidgetExtException;
import com.dongkuk.dmes.mcm.widget.ext.WidgetExtPartialException;
import com.dongkuk.dmes.mcm.widget.ext.WidgetExtProperties;
import com.dongkuk.dmes.mdm.common.segment.DataItemSaveCore;
import com.dongkuk.dmes.mdm.common.segment.DataItemValue;
import com.dongkuk.dmes.mdm.common.segment.DataSavePath;
import com.dongkuk.dmes.mdm.common.segment.UpsertResult;
import com.dongkuk.dmes.mdm.common.segment.UpsertRow;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentAction;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 예약 작업 {@code mdm.exchangeRateSync} 의 본체: 외부 환율을 받아 마루 데이터 {@code FX_RATE} 에 upsert 한다
 * (docs/superpowers/specs/2026-10-09-mdm-fx-master-design.md D3, §6 R2·R7·R9~R11).
 *
 * <p>모양(설계 §7): 기준일 한 행이 키({@code CODE=yyyyMMdd}, NAME={@code yyyy-MM-dd})이고, {@code FX_RATE} 정의의
 * {@code ATTRnn_NAME} 라벨이 통화 코드이며 그 칼럼 값이 1 통화 단위당 원화 환율이다. 통화→칼럼 대응은 정의에서 읽는다(하드코딩 없음).
 * 기준통화·출처는 항목 DESCRIPTION 에 남긴다.
 *
 * <p>순서: ① 외부 호출이 꺼져 있으면 0건 ② {@code CUR} 에서 열린 행 중 환율 수집이 Y 이고 {@code FX_RATE} 칼럼이 있는 통화 읽기
 * ③ {@code FX_RATE} 열린 항목이 하나도 없으면 90일 백필, 있으면 {@code lookbackDays} ④ 제공자 호출(구간당 한 번이고 제한 시간이
 * 짧아, OASIS 실행 트랜잭션 안에서 도는 것을 감수한다) ⑤ 날짜별로 기존 마지막 행을 읽어 받은 칼럼만 덮어쓴 {@link UpsertRow} 만들기
 * (같은 날 일부 통화만 받아도 나머지 칼럼은 보존) ⑥ {@link DataItemSaveCore#upsert} 를 새 트랜잭션으로 먼저 커밋 ⑦ 제공자가 일부만
 * 줬으면 커밋한 뒤에 예외를 던진다(받은 값이 롤백되지 않게).
 *
 * <p>값은 소수 8자리 고정 문자열로 저장한다(저장 때 {@code sameAs} 비교가 흔들리지 않게). 예외 메시지에는
 * 요청 주소나 인증키를 싣지 않는다.
 */
public class ExchangeRateSyncService {

    private static final Logger log = LoggerFactory.getLogger(ExchangeRateSyncService.class);

    public static final String CUR = "CUR";
    public static final String FX_RATE = "FX_RATE";
    /** {@code FX_RATE} 의 출처 시스템(TB_MDM_SYSTEM 의 기존 코드). */
    public static final String CALLER_SYSTEM = "MDM";
    public static final String BASE_CURRENCY = "KRW";
    public static final int DEFAULT_LOOKBACK_DAYS = 5;
    /** lookbackDays 상한. 수출입은행은 날짜마다 한 번씩 부르므로 호출 수를 묶어 둔다. */
    public static final int MAX_LOOKBACK_DAYS = 90;
    /** FX_RATE 가 비어 있을 때 처음 한 번 채우는 기간(일). */
    public static final int BACKFILL_DAYS = 90;
    public static final int RATE_SCALE = 8;

    private static final String JOB = "[mdm.exchangeRateSync] ";
    private static final DateTimeFormatter YMD = DateTimeFormatter.BASIC_ISO_DATE;
    private static final Pattern CUR_CODE = Pattern.compile("^[A-Z]{3}$");
    private static final int ATTR_COUNT = DataItemValue.ATTR_COUNT;
    private static final int MAX_ISSUES_IN_MESSAGE = 5;

    /** 열린 선분만 읽는다(VALID_TO 가 열린 끝). 칼럼에 함수를 씌우지 않고 DB 시각 함수도 쓰지 않는다. */
    private static final String CURRENCIES_SQL = """
            SELECT A.CODE
            FROM   TB_MDM_DATA_ITEM A
            WHERE  A.MARU_DATA_ID = ?
            AND    A.VALID_TO = TIMESTAMP '9999-12-31 00:00:00'
            AND    A.ATTR04 = 'Y'
            ORDER BY A.SEQ, A.CODE
            """;
    private static final String DEFINITION_SQL = """
            SELECT COUNT(*)
            FROM   TB_MDM_DATA A
            WHERE  A.MARU_DATA_ID = ?
            """;
    private static final String ANY_ITEM_SQL = """
            SELECT COUNT(*)
            FROM   TB_MDM_DATA_ITEM A
            WHERE  A.MARU_DATA_ID = ?
            AND    A.VALID_TO = TIMESTAMP '9999-12-31 00:00:00'
            AND    ROWNUM <= 1
            """;
    /** 통화→칼럼 대응의 근거: FX_RATE 정의의 추가 컬럼 라벨. */
    private static final String LABELS_SQL = """
            SELECT A.ATTR01_NAME
                 , A.ATTR02_NAME
                 , A.ATTR03_NAME
                 , A.ATTR04_NAME
                 , A.ATTR05_NAME
                 , A.ATTR06_NAME
                 , A.ATTR07_NAME
                 , A.ATTR08_NAME
                 , A.ATTR09_NAME
                 , A.ATTR10_NAME
            FROM   TB_MDM_DATA A
            WHERE  A.MARU_DATA_ID = ?
            """;
    /**
     * 기준일 범위의 키별 마지막 행(열린 행이든 닫힌 행이든, 기본 키 범위). 같은 날 다른 통화 칼럼을 보존하려고 읽는다 —
     * 닫힌 날짜 키를 upsert 가 다시 열 때도 받지 않은 칼럼이 지워지지 않게 한다.
     */
    private static final String EXISTING_SQL = """
            SELECT A.CODE
                 , A.ALTER_NAME
                 , A.SEQ
                 , A.ATTR01
                 , A.ATTR02
                 , A.ATTR03
                 , A.ATTR04
                 , A.ATTR05
                 , A.ATTR06
                 , A.ATTR07
                 , A.ATTR08
                 , A.ATTR09
                 , A.ATTR10
            FROM   TB_MDM_DATA_ITEM A
            WHERE  A.MARU_DATA_ID = ?
            AND    A.CODE BETWEEN ? AND ?
            AND    A.VALID_FROM = (SELECT MAX(M.VALID_FROM)
                                   FROM   TB_MDM_DATA_ITEM M
                                   WHERE  M.MARU_DATA_ID = A.MARU_DATA_ID
                                   AND    M.CODE = A.CODE)
            """;

    private final JdbcTemplate jdbc;
    private final DataItemSaveCore saveCore;
    private final TransactionTemplate newTx;
    private final Clock clock;
    private final WidgetExtProperties properties;
    private final ExchangeRateProvider frankfurter;
    private final ExchangeRateProvider koreaExim;

    public ExchangeRateSyncService(JdbcTemplate jdbc, DataItemSaveCore saveCore, PlatformTransactionManager transactionManager,
                                   Clock clock, WidgetExtProperties properties, ExchangeRateProvider frankfurter,
                                   ExchangeRateProvider koreaExim) {
        this.jdbc = jdbc;
        this.saveCore = saveCore;
        this.newTx = new TransactionTemplate(transactionManager);
        this.newTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.clock = clock;
        this.properties = properties;
        this.frankfurter = frankfurter;
        this.koreaExim = koreaExim;
    }

    /** @return 이번에 INSERT·UPDATE·REOPEN 된 날짜 행 수(변하지 않은 행 제외). 새 값이 없으면 0. 실패는 예외로. */
    public int run(JobContext ctx) {
        if (!properties.isEnabled()) {
            log.info(JOB + "dmes.widget.ext.enabled=false 라 외부 환율을 받지 않습니다");
            return 0;
        }
        Map<String, Object> vars = ctx == null || ctx.vars() == null ? Map.of() : ctx.vars();

        requireFxMaster();
        List<String> columns = columnCurrencies();
        List<String> symbols = collectSymbols(columns);
        if (symbols.isEmpty()) {
            throw new IllegalStateException("환율을 수집할 통화가 없습니다. 통화(CUR)에서 환율 수집이 Y 이고 환율(" + FX_RATE
                    + ") 정의의 추가 컬럼 라벨에 있는 열린 항목을 확인하세요");
        }

        int days = hasFxItems() ? lookbackDays(vars) : BACKFILL_DAYS;
        ExchangeRateProvider provider = provider(vars);
        LocalDate to = LocalDate.now(clock);
        LocalDate from = to.minusDays(days);
        log.info(JOB + "제공자={} 통화={}개 기간={}~{}", provider.id(), symbols.size(), from, to);

        List<ExchangeRatePoint> points;
        String partialMessage = null;
        try {
            points = provider.fetch(BASE_CURRENCY, symbols, from, to);
        } catch (WidgetExtPartialException e) {
            points = e.partial();
            partialMessage = e.getMessage();
        } catch (WidgetExtException e) {
            throw new IllegalStateException("환율 제공자(" + provider.id() + ") 호출에 실패했습니다: " + e.getMessage());
        } catch (RuntimeException e) {
            // 원인 예외를 싣지 않는다 — 요청 주소(인증키 포함)가 메시지에 들어 있을 수 있다.
            throw new IllegalStateException("환율 제공자(" + provider.id() + ") 호출에 실패했습니다: " + e.getClass().getSimpleName());
        }

        List<UpsertRow> rows = toRows(points, columns, symbols, provider.id(), existingByCode(points));
        int changed = rows.isEmpty() ? 0 : save(rows);
        log.info(JOB + "받은 {}일 중 {}일을 마스터에 반영했습니다", rows.size(), changed);

        if (partialMessage != null) {
            // 받은 값은 이미 커밋했다. 실패로 남겨 재시도 규칙을 타게 한다.
            throw new IllegalStateException("환율 제공자(" + provider.id() + ")가 일부만 응답했습니다: " + partialMessage
                    + " (받은 " + rows.size() + "일 중 " + changed + "일 반영)");
        }
        return changed;
    }

    // ── 입력 읽기 ──────────────────────────────────────────────────────────

    /** FX_RATE 정의의 추가 컬럼 라벨(인덱스 0 = ATTR01). 라벨이 없는 칼럼은 null. */
    private List<String> columnCurrencies() {
        List<String> labels = jdbc.query(LABELS_SQL, rs -> {
            List<String> out = new ArrayList<>(ATTR_COUNT);
            if (rs.next()) {
                for (int i = 1; i <= ATTR_COUNT; i++) {
                    String v = rs.getString(i);
                    out.add(v == null || v.isBlank() ? null : v.trim().toUpperCase(Locale.ROOT));
                }
            }
            return out;
        }, FX_RATE);
        return labels == null ? List.of() : labels;
    }

    /** CUR 에서 열린 행 중 환율 수집이 Y 이고 FX_RATE 칼럼이 있는 통화 코드(KRW·형식이 다른 코드 제외). */
    private List<String> collectSymbols(List<String> columns) {
        List<String> out = new ArrayList<>();
        for (String code : jdbc.queryForList(CURRENCIES_SQL, String.class, CUR)) {
            if (code == null || !CUR_CODE.matcher(code).matches() || BASE_CURRENCY.equals(code) || out.contains(code)) {
                continue;
            }
            if (columns.contains(code)) {
                out.add(code);
            } else {
                log.warn(JOB + "통화 {} 는 환율 수집이 Y 지만 {} 정의의 추가 컬럼 라벨에 없어 건너뜁니다", code, FX_RATE);
            }
        }
        return out;
    }

    /** 받은 점의 기준일 범위에서 키별 마지막 행을 읽는다. 키는 CODE(yyyyMMdd). */
    private Map<String, ExistingRow> existingByCode(Collection<ExchangeRatePoint> points) {
        LocalDate min = null;
        LocalDate max = null;
        for (ExchangeRatePoint p : points) {
            if (p == null || p.date() == null) {
                continue;
            }
            min = min == null || p.date().isBefore(min) ? p.date() : min;
            max = max == null || p.date().isAfter(max) ? p.date() : max;
        }
        if (min == null) {
            return Map.of();
        }
        Map<String, ExistingRow> out = new TreeMap<>();
        jdbc.query(EXISTING_SQL, rs -> {
            List<String> attrs = new ArrayList<>(ATTR_COUNT);
            for (int i = 0; i < ATTR_COUNT; i++) {
                attrs.add(rs.getString(4 + i));
            }
            String alterName = rs.getString(2);
            int seq = rs.getInt(3);
            Integer seqOrNull = rs.wasNull() ? null : seq;
            out.put(rs.getString(1), new ExistingRow(alterName, seqOrNull, attrs));
        }, FX_RATE, min.format(YMD), max.format(YMD));
        return out;
    }

    /** 같은 날 행의 기존 값(보존할 칼럼). */
    record ExistingRow(String alterName, Integer seq, List<String> attrs) {
    }

    private void requireFxMaster() {
        Integer n = jdbc.queryForObject(DEFINITION_SQL, Integer.class, FX_RATE);
        if (n == null || n == 0) {
            throw new IllegalStateException("환율 마스터(" + FX_RATE + ")가 등록되어 있지 않습니다. mdm Flyway V3__fx_master_seed·V4__fx_rate_by_date 를 적용하세요");
        }
    }

    private boolean hasFxItems() {
        Integer n = jdbc.queryForObject(ANY_ITEM_SQL, Integer.class, FX_RATE);
        return n != null && n > 0;
    }

    private ExchangeRateProvider provider(Map<String, Object> vars) {
        Object requested = vars.get("provider");
        String wanted = requested == null || requested.toString().isBlank() ? properties.getExchange().getProvider() : requested.toString();
        return KoreaEximProvider.ID.equals(chooseProviderId(wanted, properties.getExchange().getKoreaeximKey())) ? koreaExim : frankfurter;
    }

    // ── 순수 함수(단위 시험 대상) ───────────────────────────────────────────

    /** ExchangeService 와 같은 규칙: koreaexim 을 원하고 인증키가 있을 때만 koreaexim, 아니면 frankfurter. */
    static String chooseProviderId(String wanted, String koreaeximKey) {
        boolean koreaEximWanted = wanted != null && KoreaEximProvider.ID.equalsIgnoreCase(wanted.trim());
        boolean hasKey = koreaeximKey != null && !koreaeximKey.isBlank();
        return koreaEximWanted && hasKey ? KoreaEximProvider.ID : FrankfurterProvider.ID;
    }

    /** 조회 기간(일). 숫자·숫자 문자열을 받고, 비었거나 1 미만·읽을 수 없으면 기본값, 너무 크면 상한. */
    static int lookbackDays(Map<String, Object> vars) {
        Object v = vars.get("lookbackDays");
        int n = DEFAULT_LOOKBACK_DAYS;
        if (v instanceof Number num) {
            n = num.intValue();
        } else if (v instanceof String s && !s.isBlank()) {
            try {
                n = new BigDecimal(s.trim()).intValue();
            } catch (NumberFormatException e) {
                n = DEFAULT_LOOKBACK_DAYS;
            }
        }
        if (n < 1) {
            return DEFAULT_LOOKBACK_DAYS;
        }
        return Math.min(n, MAX_LOOKBACK_DAYS);
    }

    /**
     * 제공자가 준 점을 날짜별 upsert 행으로 바꾼다. 요청하지 않은 통화·값이 없거나 0 이하인 점은 버리고, 같은 날짜·통화는 뒤의 것을
     * 쓴다. 기존 열린 행이 있으면 그 칼럼을 그대로 두고 받은 통화 칼럼만 덮어쓴다. 키(날짜) 순서로 정렬해 돌려준다(한 번의 upsert 에
     * 같은 키가 둘이면 CHK6 으로 거절되므로 날짜당 한 행이다).
     *
     * @param columns 추가 컬럼 라벨(인덱스 0 = ATTR01, 통화 코드 또는 null)
     */
    static List<UpsertRow> toRows(Collection<ExchangeRatePoint> points, List<String> columns, Collection<String> symbols,
                                  String providerId, Map<String, ExistingRow> existing) {
        Map<String, Map<Integer, BigDecimal>> byDate = new TreeMap<>();
        Map<String, LocalDate> dates = new TreeMap<>();
        for (ExchangeRatePoint p : points) {
            if (p == null || p.date() == null || p.cur() == null || p.rate() == null) {
                continue;
            }
            String cur = p.cur().trim().toUpperCase(Locale.ROOT);
            int column = columns.indexOf(cur);
            if (column < 0 || !symbols.contains(cur)) {
                continue;
            }
            BigDecimal rate = p.rate().setScale(RATE_SCALE, RoundingMode.HALF_UP);
            if (rate.signum() <= 0) {
                continue;
            }
            String ymd = p.date().format(YMD);
            byDate.computeIfAbsent(ymd, k -> new TreeMap<>()).put(column, rate);
            dates.put(ymd, p.date());
        }
        List<UpsertRow> out = new ArrayList<>(byDate.size());
        for (Map.Entry<String, Map<Integer, BigDecimal>> e : byDate.entrySet()) {
            ExistingRow old = existing == null ? null : existing.get(e.getKey());
            List<String> attrs = new ArrayList<>(old == null ? Collections.nCopies(ATTR_COUNT, (String) null) : old.attrs());
            e.getValue().forEach((column, rate) -> attrs.set(column, rate.toPlainString()));
            String description = "기준통화 " + BASE_CURRENCY + " · 출처 " + providerId;
            DataItemValue value = new DataItemValue(dates.get(e.getKey()).toString(), old == null ? null : old.alterName(),
                    old == null ? null : old.seq(), description, null, attrs);
            out.add(new UpsertRow(e.getKey(), value));
        }
        return out;
    }

    // ── 저장 ────────────────────────────────────────────────────────────────

    /**
     * 새 트랜잭션에서 upsert 하고 먼저 커밋한다. 이 작업은 OASIS 실행 트랜잭션 안에서 도는데, 뒤에서 예외를 던져도 받은 값이
     * 롤백되지 않게 하려는 것이다.
     */
    private int save(List<UpsertRow> rows) {
        UpsertResult result = newTx.execute(status -> saveCore.upsert(FX_RATE, DataSavePath.API, CALLER_SYSTEM, rows, false));
        if (result == null || !result.written()) {
            throw new IllegalStateException("환율 마스터 저장이 거절되었습니다: " + describe(result == null ? List.of() : result.issues()));
        }
        return (int) result.actions().stream().filter(a -> a != MdmTemporalSegmentAction.NONE).count();
    }

    private static String describe(List<MdmCheckIssue> issues) {
        if (issues.isEmpty()) {
            return "사유 없음";
        }
        StringBuilder sb = new StringBuilder();
        int shown = Math.min(issues.size(), MAX_ISSUES_IN_MESSAGE);
        for (int i = 0; i < shown; i++) {
            MdmCheckIssue issue = issues.get(i);
            sb.append(i == 0 ? "" : ", ").append(issue.code()).append(' ').append(issue.message());
            if (issue.itemKey() != null) {
                sb.append('(').append(issue.itemKey()).append(')');
            }
        }
        if (issues.size() > shown) {
            sb.append(" 외 ").append(issues.size() - shown).append("건");
        }
        return sb.toString();
    }
}
