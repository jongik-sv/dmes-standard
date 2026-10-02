package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.entity.DeptInfo;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDay;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import com.dongkuk.dmes.mcm.screenusage.repository.PageLastUsed;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.UsageSum;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenMenuCatalog.MenuInfo;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.stream.Collectors;

/**
 * 화면 사용 통계 탭 쿼리들이 함께 쓰는 헬퍼 (설계 4.5, 계약 C4).
 *
 * <p>출처 분할: 집계 테이블 최대 일자(MAX USAGE_DT)까지는 {@code TB_SEC_SCREEN_USAGE_DAY} 를 JPQL GROUP BY 로,
 * 그 다음 날부터 조회 종료일까지(오늘 포함)는 원본을 같은 키로 Java 합산해 더한다. 두 구간은 겹치지 않아 이중 집계가 없고,
 * 02:00 집계 전(00:00~02:00)에도 어제분이 빠지지 않는다.
 *
 * <p>조건(deptCd·userId·pageId)은 완전 일치다. deptCd '-' 는 집계 '-' 와 원본 NULL 만 거른다.
 * 메뉴에 없는 pageId 는 "(메뉴 없음)", 부서 없음은 deptCd "-" / deptNm "(부서 없음)".
 * 슬라이스(탭 쿼리)는 이 클래스를 고치지 않는다.
 */
@Component
public class ScreenUsageStatSupport {

    static final int DEFAULT_UNUSED_DAYS = 90;
    static final String NO_MENU_NM = "(메뉴 없음)";
    static final String NO_DEPT_NM = "(부서 없음)";

    private final ScreenUsageDayRepository dayRepository;
    private final ScreenUsageLogRepository logRepository;
    private final ScreenMenuCatalog menuCatalog;
    private final SecUserRepository secUserRepository;
    private final DeptInfoRepository deptInfoRepository;
    private final Clock clock;

    @Autowired
    public ScreenUsageStatSupport(ScreenUsageDayRepository dayRepository,
                                  ScreenUsageLogRepository logRepository,
                                  ScreenMenuCatalog menuCatalog,
                                  SecUserRepository secUserRepository,
                                  DeptInfoRepository deptInfoRepository) {
        this(dayRepository, logRepository, menuCatalog, secUserRepository, deptInfoRepository,
                Clock.system(ScreenUsageDates.ZONE));
    }

    ScreenUsageStatSupport(ScreenUsageDayRepository dayRepository,
                           ScreenUsageLogRepository logRepository,
                           ScreenMenuCatalog menuCatalog,
                           SecUserRepository secUserRepository,
                           DeptInfoRepository deptInfoRepository,
                           Clock clock) {
        this.dayRepository = dayRepository;
        this.logRepository = logRepository;
        this.menuCatalog = menuCatalog;
        this.secUserRepository = secUserRepository;
        this.deptInfoRepository = deptInfoRepository;
        this.clock = clock;
    }

    // ───────────────────────────────────────────── 기간·조건

    LocalDate today() {
        return LocalDate.now(clock);
    }

    Map<String, MenuInfo> menus() {
        return menuCatalog.load();
    }

    static Range range(ScreenUsageStatRequest request) {
        return Range.of(request);
    }

    static Filter filter(ScreenUsageStatRequest request) {
        return Filter.of(request);
    }

    static int unusedDays(ScreenUsageStatRequest request) {
        Integer v = request.getUnusedDays();
        return v == null || v <= 0 ? DEFAULT_UNUSED_DAYS : v;
    }

    // ───────────────────────────────────────────── 합산

    /** (화면, 사용자, 부서) 합계 — 집계분 + 미집계 원본분(일자별 행). 같은 키가 양쪽에 있어도 상위 묶음에서 더해진다. */
    List<UsageSum> sums(Range range, Filter filter) {
        Split split = split(range);
        List<UsageSum> out = new ArrayList<>();
        if (split.hasDay()) {
            out.addAll(dayRepository.sumByPageUserDept(
                    ScreenUsageDates.format(split.dayFrom()), ScreenUsageDates.format(split.dayTo()),
                    filter.deptCd(), filter.userId(), filter.pageId()));
        }
        if (split.hasRaw()) {
            for (ScreenUsageDay d : rawDays(split.rawFrom(), split.rawTo(), filter)) {
                out.add(new UsageSum(d.getPageId(), d.getUserId(), d.getDeptCd(),
                        d.getOpenCnt().longValue(), d.getSegCnt().longValue(), d.getDurationMs(), d.getUsageDt()));
            }
        }
        return out;
    }

    /** 원본 [from, to] 일자를 집계 키(일자·화면·사용자·부서)로 합산하고 조건으로 거른다. */
    List<ScreenUsageDay> rawDays(LocalDate from, LocalDate to, Filter filter) {
        List<ScreenUsageLog> logs = logRepository.findStartedBetween(from.atStartOfDay(), to.plusDays(1).atStartOfDay());
        return ScreenUsageAggregator.sumByDayKey(logs).stream().filter(filter::matches).toList();
    }

    /** 조회 기간을 [집계 테이블 구간] + [원본 구간] 으로 겹치지 않게 나눈다. */
    Split split(Range range) {
        String maxDt = dayRepository.findMaxUsageDt();
        if (maxDt == null) {
            return new Split(null, null, range.from(), range.to());
        }
        LocalDate aggregatedTo = ScreenUsageDates.parseDt(maxDt);
        LocalDate dayTo = range.to().isBefore(aggregatedTo) ? range.to() : aggregatedTo;
        LocalDate rawFrom = range.from().isAfter(aggregatedTo) ? range.from() : aggregatedTo.plusDays(1);
        boolean hasDay = !dayTo.isBefore(range.from());
        boolean hasRaw = !rawFrom.isAfter(range.to());
        return new Split(hasDay ? range.from() : null, hasDay ? dayTo : null,
                hasRaw ? rawFrom : null, hasRaw ? range.to() : null);
    }

    /** 키별 묶음 합산. 순서는 처음 나온 순서(LinkedHashMap). */
    static <T extends UsageTotals> Map<String, T> groupBy(List<UsageSum> sums, Function<UsageSum, String> key,
                                                          Supplier<T> factory) {
        Map<String, T> out = new LinkedHashMap<>();
        for (UsageSum s : sums) {
            out.computeIfAbsent(key.apply(s), k -> factory.get()).add(s);
        }
        return out;
    }

    // ───────────────────────────────────────────── 미사용

    /**
     * 미사용 화면 — 표시 메뉴(viewable) 중 오늘 포함 최근 {@code unusedDays} 일 동안 이용 기록(구간 종류 무관)이 없는 화면.
     * lastUsedDt 는 전체 기간 마지막 이용일(없으면 null). 정렬은 메뉴 경로 → pageId.
     */
    List<UnusedScreen> unusedScreens(Map<String, MenuInfo> menus, int unusedDays) {
        LocalDate today = today();
        String windowStart = ScreenUsageDates.format(today.minusDays(unusedDays - 1L)); // 오늘 포함 최근 N일
        Map<String, String> lastUsed = lastUsedByPage(today);
        List<UnusedScreen> out = new ArrayList<>();
        for (MenuInfo menu : menus.values()) {
            if (!menu.viewable()) {
                continue;
            }
            String last = lastUsed.get(menu.pageId());
            if (last != null && last.compareTo(windowStart) >= 0) {
                continue;
            }
            out.add(new UnusedScreen(menu, last));
        }
        out.sort(Comparator.comparing((UnusedScreen u) -> u.menu().menuPath(),
                        Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(u -> u.menu().pageId()));
        return out;
    }

    /** 화면별 마지막 이용일(전체 기간) — 집계분 MAX + 미집계 원본의 시작 일자. 구간 종류와 무관. */
    private Map<String, String> lastUsedByPage(LocalDate today) {
        Map<String, String> last = new HashMap<>();
        for (PageLastUsed p : dayRepository.findLastUsedDtByPage()) {
            last.put(p.pageId(), p.lastUsedDt());
        }
        String maxDt = dayRepository.findMaxUsageDt();
        LocalDate rawFrom;
        if (maxDt != null) {
            rawFrom = ScreenUsageDates.parseDt(maxDt).plusDays(1);
        } else {
            LocalDateTime min = logRepository.findMinStartedAt();
            rawFrom = min == null ? null : min.toLocalDate();
        }
        if (rawFrom != null && !rawFrom.isAfter(today)) {
            for (ScreenUsageLog l : logRepository.findStartedBetween(rawFrom.atStartOfDay(), today.plusDays(1).atStartOfDay())) {
                last.merge(l.getPageId(), ScreenUsageDates.usageDt(l.getStartedAt()),
                        (a, b) -> a.compareTo(b) >= 0 ? a : b);
            }
        }
        return last;
    }

    // ───────────────────────────────────────────── 이름

    Map<String, String> userNames(Set<String> userIds) {
        Map<String, String> out = new HashMap<>();
        if (userIds.isEmpty()) {
            return out;
        }
        for (SecUser u : secUserRepository.findAllById(userIds)) {
            out.put(u.getUserId(), u.getUserNm());
        }
        return out;
    }

    /** 부서코드 → 부서명. '-'(부서 없음)·null 은 조회하지 않는다. */
    Map<String, String> deptNames(Set<String> deptCds) {
        Set<String> codes = deptCds.stream()
                .filter(c -> c != null && !ScreenUsageAggregator.NO_DEPT.equals(c))
                .collect(Collectors.toSet());
        Map<String, String> out = new HashMap<>();
        if (codes.isEmpty()) {
            return out;
        }
        for (DeptInfo d : deptInfoRepository.findAllById(codes)) {
            out.put(d.getDeptCd(), d.getDeptNm());
        }
        return out;
    }

    static String deptName(String deptCd, Map<String, String> names) {
        return ScreenUsageAggregator.NO_DEPT.equals(deptCd) ? NO_DEPT_NM : names.get(deptCd);
    }

    static String menuNm(String pageId, Map<String, MenuInfo> menus) {
        MenuInfo m = menus.get(pageId);
        return m != null ? m.menuNm() : NO_MENU_NM;
    }

    // ───────────────────────────────────────────── 정렬

    static Comparator<Map<String, Object>> longDesc(String key) {
        return Comparator.comparing((Map<String, Object> r) -> (Long) r.get(key)).reversed();
    }

    static Comparator<Map<String, Object>> text(String key) {
        return Comparator.comparing((Map<String, Object> r) -> (String) r.get(key),
                Comparator.nullsLast(Comparator.naturalOrder()));
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    // ───────────────────────────────────────────── 값 객체

    record Range(LocalDate from, LocalDate to) {
        static Range of(ScreenUsageStatRequest r) {
            LocalDate from = parse(r.getFromDt(), "fromDt");
            LocalDate to = parse(r.getToDt(), "toDt");
            if (from.isAfter(to)) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, "조회 시작일(fromDt)이 종료일(toDt)보다 늦습니다.");
            }
            return new Range(from, to);
        }

        private static LocalDate parse(String value, String name) {
            if (value == null || value.isBlank()) {
                throw new BusinessException(ErrorCode.REQUIRED_VALUE, name + " 는 필수입니다.");
            }
            try {
                return ScreenUsageDates.parseDt(value.trim());
            } catch (DateTimeParseException e) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, name + " 는 yyyyMMdd 형식이어야 합니다: " + value);
            }
        }
    }

    record Filter(String deptCd, String userId, String pageId) {
        static Filter of(ScreenUsageStatRequest r) {
            return new Filter(blankToNull(r.getDeptCd()), blankToNull(r.getUserId()), blankToNull(r.getPageId()));
        }

        /** 원본 합산 행 거르기 — 합산 행의 deptCd 는 이미 '-' 로 정규화돼 있어 '-' 조건이 원본 NULL 을 잡는다. */
        boolean matches(ScreenUsageDay d) {
            return (deptCd == null || deptCd.equals(d.getDeptCd()))
                    && (userId == null || userId.equals(d.getUserId()))
                    && (pageId == null || pageId.equals(d.getPageId()));
        }
    }

    record Split(LocalDate dayFrom, LocalDate dayTo, LocalDate rawFrom, LocalDate rawTo) {
        boolean hasDay() { return dayFrom != null; }
        boolean hasRaw() { return rawFrom != null; }
    }

    record UnusedScreen(MenuInfo menu, String lastUsedDt) {}

    /** 화면·부서·사용자 공통 합산기. 탭 쿼리가 상속해 탭 전용 누적을 더한다. */
    static class UsageTotals {
        long openCnt;
        long durationMs;
        String lastUsedDt;
        final Set<String> users = new HashSet<>();

        void add(UsageSum s) {
            openCnt += s.openCnt();
            durationMs += s.durationMs();
            users.add(s.userId());
            if (lastUsedDt == null || s.lastUsedDt().compareTo(lastUsedDt) > 0) {
                lastUsedDt = s.lastUsedDt();
            }
        }
    }
}
