package com.dongkuk.dmes.mcm.job.server;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 수집 값 읽기(jobSchedMng.collectData)의 DB 와 무관한 계산 — 기간 경계 문자열·한도 자르기·쪽 경계 정리. 시험은 DB 없이 돈다.
 */
public final class CollectDataPaging {

    public static final int DEFAULT_DAYS = 7;
    public static final int MAX_DAYS = 90;
    public static final int DEFAULT_LIMIT = 500;
    public static final int MAX_LIMIT = 500;
    private static final DateTimeFormatter SLOT = DateTimeFormatter.ofPattern("yyyyMMddHHmm");

    private CollectDataPaging() {}

    /** days 를 1~90 으로 자른다(없으면 7). */
    public static int clampDays(Integer days) {
        return days == null ? DEFAULT_DAYS : Math.max(1, Math.min(MAX_DAYS, days));
    }

    /** limit 를 1~500 으로 자른다(없으면 500). */
    public static int clampLimit(Integer limit) {
        return limit == null ? DEFAULT_LIMIT : Math.max(1, Math.min(MAX_LIMIT, limit));
    }

    /** 지금(서버 KST)에서 days 일 전의 SLOT 형식(yyyyMMddHHmm) 문자열 — 「SLOT >= 이 값」 이 기간 조건이다. */
    public static String fromSlot(LocalDateTime now, int days) {
        return SLOT.format(now.minusDays(days));
    }

    /** SLOT 형식 검사(숫자 12자). */
    public static boolean isSlot(String s) {
        if (s == null || s.length() != 12) return false;
        for (int i = 0; i < 12; i++) if (s.charAt(i) < '0' || s.charAt(i) > '9') return false;
        return true;
    }

    /** @param keep 돌려줄 앞쪽 행 수  @param nextBeforeSlot truncated 일 때 다음 쪽 beforeSlot(= 돌려준 마지막 행의 SLOT), 아니면 null */
    public record Trim(int keep, boolean truncated, String nextBeforeSlot) {}

    /**
     * SLOT 내림차순으로 limit+1 행까지 읽은 SLOT 목록에서 돌려줄 행 수와 다음 쪽 기준을 정한다.
     * 경계 SLOT 이 갈리면(limit 번째와 limit+1 번째 행의 SLOT 이 같으면) 그 SLOT 의 읽은 행을 모두 버리고 다음 쪽(SLOT &lt; 돌려준 마지막 SLOT)이 그 SLOT 을 처음부터 읽게 한다
     * — 한 회차가 쪽 사이에서 잘려 나가는 일이 없다. 한 회차 행이 limit 보다 많아 버릴 행이 전부면 limit 행에서 자른다(그 회차의 나머지는 못 읽는다).
     */
    public static Trim trim(List<String> slotsDesc, int limit) {
        int n = slotsDesc.size();
        if (n <= limit) return new Trim(n, false, null);
        String boundary = slotsDesc.get(limit);
        int keep = limit;
        while (keep > 0 && slotsDesc.get(keep - 1).equals(boundary)) keep--;
        if (keep == 0) keep = limit;
        return new Trim(keep, true, slotsDesc.get(keep - 1));
    }
}
