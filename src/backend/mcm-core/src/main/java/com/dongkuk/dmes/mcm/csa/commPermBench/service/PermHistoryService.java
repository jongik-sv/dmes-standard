/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench 적용 이력 조회 — searchHistory(his)·searchHistoryDtl(dtl)
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.CommPermBenchSearchHistoryDtlRequest;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.CommPermBenchSearchHistoryRequest;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchDtlRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchHisRow;
import com.dongkuk.dmes.mcm.entity.SecPermHis;
import com.dongkuk.dmes.mcm.entity.SecPermHisDtl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 적용 이력 읽기. 쓰기 없음(트랜잭션 불필요 — 가이드 §6-B).
 *
 * <p>규칙(BPMN설계서 §2.7, 기능설계서 S-010~S-012):
 * <ul>
 *   <li>fromDt·toDt = {@code yyyy-MM-dd}(DatePicker) 또는 {@code yyyyMMdd}, 양 끝 날짜 포함(KST).
 *       비면 toDt = 오늘, fromDt = toDt 30일 전. 형식 오류·fromDt &gt; toDt·기간 366일 초과 = PERM_BAD_VALUE.
 *       기간은 양 끝을 포함해 센다(같은 날 = 1일, fromDt..toDt 가 366일이면 통과, 367일이면 거절)</li>
 *   <li>applyUserId 비면 전체, 있으면 그 적용자만(정확히 일치). 100자 초과 = PERM_BAD_VALUE</li>
 *   <li>APPLY_AT 내림차순, 상한 {@value #HIS_LIMIT}건. 적용은 관리자가 손으로 하는 일이라 한 기간에 보통 수백 건 아래이고
 *       화면은 페이지 없이 표 한 장이다. 상한은 폭주 방어용 안전판일 뿐 업무 수치가 아니다(검토 N6: 200 에는 근거가 없었다 —
 *       기간 상한 366일과 짝으로 넉넉하게 500). 넘으면 오래된 쪽이 잘리며, 좁히려면 기간·적용자를 쓴다</li>
 *   <li>searchHistoryDtl: applyId 비면 PERM_BAD_VALUE, 없는 applyId 는 오류가 아니라 빈 목록(설계에 NOT_FOUND 없음), SEQ_NO 오름차순</li>
 *   <li>조회 권한 = action 토큰(searchHistory·searchHistoryDtl) 게이트가 전부다. 서비스는 사람별로 거르지 않는다(기능설계서 권한표)</li>
 * </ul>
 */
@Service
public class PermHistoryService {

    static final String BAD_VALUE = "PERM_BAD_VALUE";
    static final int HIS_LIMIT = 500;
    static final int DEFAULT_DAYS = 30;
    static final int MAX_DAYS = 366;
    static final int USER_MAX = 100;
    static final int APPLY_ID_MAX = 40;

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter DASH =
            DateTimeFormatter.ofPattern("uuuu-MM-dd").withResolverStyle(ResolverStyle.STRICT);
    private static final DateTimeFormatter PLAIN =
            DateTimeFormatter.ofPattern("uuuuMMdd").withResolverStyle(ResolverStyle.STRICT);

    private final PermHistoryStore store;
    private final Clock clock;

    @Autowired
    public PermHistoryService(PermHistoryStore store) {
        this(store, Clock.system(KST));
    }

    PermHistoryService(PermHistoryStore store, Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    /** grid his. */
    public List<Map<String, Object>> searchHistory(CommPermBenchSearchHistoryRequest request) {
        LocalDate to = parse(request == null ? null : request.getToDt(), "toDt");
        LocalDate from = parse(request == null ? null : request.getFromDt(), "fromDt");
        if (to == null) {
            to = LocalDate.now(clock.withZone(KST));
        }
        if (from == null) {
            from = to.minusDays(DEFAULT_DAYS);
        }
        if (from.isAfter(to)) {
            throw bad("fromDt 가 toDt 보다 늦습니다");
        }
        if (ChronoUnit.DAYS.between(from, to) + 1 > MAX_DAYS) {
            throw bad("조회 기간은 " + MAX_DAYS + "일까지입니다");
        }
        String user = request == null ? null : blankToNull(request.getApplyUserId());
        if (user != null && user.length() > USER_MAX) {
            throw bad("applyUserId 가 너무 깁니다");
        }
        List<SecPermHis> rows = store.findHistory(from.atStartOfDay(), to.plusDays(1).atStartOfDay(), user, HIS_LIMIT);
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (SecPermHis h : rows) {
            out.add(new PermBenchHisRow(h.getApplyId(), h.getApplyUserId(), h.getApplyAt(), h.getChangeCnt(),
                    h.getGainUserCnt(), h.getLoseUserCnt(), h.getApplyMemo()).toRow());
        }
        return out;
    }

    /** grid dtl. */
    public List<Map<String, Object>> searchHistoryDtl(CommPermBenchSearchHistoryDtlRequest request) {
        String applyId = request == null ? null : blankToNull(request.getApplyId());
        if (applyId == null) {
            throw bad("applyId 가 필요합니다");
        }
        if (applyId.length() > APPLY_ID_MAX) {
            throw bad("applyId 가 너무 깁니다");
        }
        List<SecPermHisDtl> rows = store.findDetails(applyId);
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (SecPermHisDtl d : rows) {
            out.add(new PermBenchDtlRow(d.getSeqNo(), d.getTargetTp(), d.getKey1(), d.getKey2(), d.getOpTp(),
                    d.getBeforeVal(), d.getAfterVal()).toRow());
        }
        return out;
    }

    private static LocalDate parse(String text, String name) {
        String t = blankToNull(text);
        if (t == null) {
            return null;
        }
        try {
            return LocalDate.parse(t, t.length() == 8 ? PLAIN : DASH);
        } catch (DateTimeParseException e) {
            throw bad(name + " 형식이 맞지 않습니다(yyyy-MM-dd)");
        }
    }

    private static String blankToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static BusinessException bad(String detail) {
        return new BusinessException(ErrorCode.INVALID_VALUE, BAD_VALUE + ": " + detail);
    }
}
