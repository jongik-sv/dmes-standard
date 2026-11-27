/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: PermHistoryService 단위 시험 — 가짜 저장소(Oracle 없음)
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.CommPermBenchSearchHistoryDtlRequest;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.CommPermBenchSearchHistoryRequest;
import com.dongkuk.dmes.mcm.entity.SecPermHis;
import com.dongkuk.dmes.mcm.entity.SecPermHisDtl;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PermHistoryServiceTest {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    /** 읽은 인자를 기록하고 미리 넣은 행을 돌려주는 가짜 저장소. */
    static class FakeStore implements PermHistoryStore {
        LocalDateTime from;
        LocalDateTime to;
        String user;
        int limit;
        String detailId;
        List<SecPermHis> his = new ArrayList<>();
        List<SecPermHisDtl> dtl = new ArrayList<>();

        @Override
        public List<SecPermHis> findHistory(LocalDateTime f, LocalDateTime t, String u, int l) {
            from = f; to = t; user = u; limit = l;
            return his;
        }

        @Override
        public List<SecPermHisDtl> findDetails(String applyId) {
            detailId = applyId;
            return dtl;
        }
    }

    private final FakeStore store = new FakeStore();
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-27T05:00:00Z"), KST); // KST 14:00
    private final PermHistoryService service = new PermHistoryService(store, clock);

    private static CommPermBenchSearchHistoryRequest req(String from, String to, String user) {
        CommPermBenchSearchHistoryRequest r = new CommPermBenchSearchHistoryRequest();
        r.setFromDt(from);
        r.setToDt(to);
        r.setApplyUserId(user);
        return r;
    }

    private static CommPermBenchSearchHistoryDtlRequest dreq(String id) {
        CommPermBenchSearchHistoryDtlRequest r = new CommPermBenchSearchHistoryDtlRequest();
        r.setApplyId(id);
        return r;
    }

    @Test
    @DisplayName("빈 조건 = toDt 오늘, fromDt 30일 전, 양 끝 날짜 포함(끝은 다음날 0시 미만)")
    void defaults() {
        service.searchHistory(req(null, "  ", null));
        assertThat(store.from).isEqualTo(LocalDateTime.of(2026, 10, 28, 0, 0));
        assertThat(store.to).isEqualTo(LocalDateTime.of(2026, 11, 28, 0, 0));
        assertThat(store.user).isNull();
        assertThat(store.limit).isEqualTo(PermHistoryService.HIS_LIMIT);
    }

    @Test
    @DisplayName("null 요청도 기본값으로 읽는다")
    void nullRequest() {
        service.searchHistory(null);
        assertThat(store.to).isEqualTo(LocalDateTime.of(2026, 11, 28, 0, 0));
    }

    @Test
    @DisplayName("yyyy-MM-dd 와 yyyyMMdd 둘 다 받고 적용자는 다듬어 넘긴다. toDt 만 주면 그 날 기준 30일 전")
    void formats() {
        service.searchHistory(req("2026-11-01", "20261105", " u1 "));
        assertThat(store.from).isEqualTo(LocalDateTime.of(2026, 11, 1, 0, 0));
        assertThat(store.to).isEqualTo(LocalDateTime.of(2026, 11, 6, 0, 0));
        assertThat(store.user).isEqualTo("u1");

        service.searchHistory(req(null, "2026-11-10", null));
        assertThat(store.from).isEqualTo(LocalDateTime.of(2026, 10, 11, 0, 0));
    }

    @Test
    @DisplayName("fromDt = toDt 하루 조회는 된다")
    void sameDay() {
        service.searchHistory(req("2026-11-05", "2026-11-05", null));
        assertThat(store.to).isEqualTo(LocalDateTime.of(2026, 11, 6, 0, 0));
    }

    @Test
    @DisplayName("잘못된 날짜·역전·기간 초과·긴 적용자 = PERM_BAD_VALUE")
    void badInputs() {
        for (CommPermBenchSearchHistoryRequest r : List.of(
                req("2026/11/01", null, null), req("2026-13-01", null, null), req("2026-02-30", null, null),
                req(null, "abc", null), req("2026-11-10", "2026-11-09", null),
                req("2025-01-01", "2026-11-27", null), req(null, null, "x".repeat(101)))) {
            assertThatThrownBy(() -> service.searchHistory(r))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("PERM_BAD_VALUE: ");
        }
        assertThatThrownBy(() -> service.searchHistory(req("2026-11-27", "2026-11-26", null)))
                .hasMessageContaining("fromDt");
    }

    @Test
    @DisplayName("기간은 양 끝 포함: 같은 날 1일·366일은 되고 367일은 안 된다")
    void maxRange() {
        service.searchHistory(req("2026-11-27", "2026-11-27", null)); // 1일
        service.searchHistory(req("2025-11-27", "2026-11-27", null)); // 366일(양 끝 포함)
        assertThat(store.from).isEqualTo(LocalDateTime.of(2025, 11, 27, 0, 0));
        assertThat(store.to).isEqualTo(LocalDateTime.of(2026, 11, 28, 0, 0));
        assertThatThrownBy(() -> service.searchHistory(req("2025-11-27", "2026-11-28", null))) // 367일
                .hasMessageContaining("PERM_BAD_VALUE");
    }

    @Test
    @DisplayName("his 행 = §0.3 칸 이름, 저장소가 준 순서 그대로")
    void hisRows() {
        SecPermHis h = new SecPermHis();
        h.setApplyId("PA20261127140000000001");
        h.setApplyUserId("admin1");
        h.setApplyAt(LocalDateTime.of(2026, 11, 27, 14, 0));
        h.setChangeCnt(3);
        h.setGainUserCnt(2);
        h.setLoseUserCnt(1);
        h.setApplyMemo("메모");
        store.his.add(h);

        List<Map<String, Object>> out = service.searchHistory(req(null, null, null));

        assertThat(out).hasSize(1);
        assertThat(out.get(0)).containsEntry("APPLY_ID", "PA20261127140000000001")
                .containsEntry("APPLY_USER_ID", "admin1")
                .containsEntry("APPLY_AT", LocalDateTime.of(2026, 11, 27, 14, 0))
                .containsEntry("CHANGE_CNT", 3).containsEntry("GAIN_USER_CNT", 2)
                .containsEntry("LOSE_USER_CNT", 1).containsEntry("APPLY_MEMO", "메모");
        assertThat(out.get(0).keySet()).containsExactly("APPLY_ID", "APPLY_USER_ID", "APPLY_AT", "CHANGE_CNT",
                "GAIN_USER_CNT", "LOSE_USER_CNT", "APPLY_MEMO");
    }

    @Test
    @DisplayName("dtl 행 = §0.3 칸 이름, 없는 applyId 는 빈 목록")
    void dtlRows() {
        SecPermHisDtl d = new SecPermHisDtl();
        d.setApplyId("PA1");
        d.setSeqNo(1);
        d.setTargetTp("GRP_ROLE");
        d.setKey1("G1");
        d.setKey2("R1");
        d.setOpTp("ADD");
        d.setBeforeVal("-");
        d.setAfterVal("Y");
        store.dtl.add(d);

        List<Map<String, Object>> out = service.searchHistoryDtl(dreq(" PA1 "));

        assertThat(store.detailId).isEqualTo("PA1");
        assertThat(out.get(0).keySet()).containsExactly("SEQ_NO", "TARGET_TP", "KEY1", "KEY2", "OP_TP", "BEFORE_VAL", "AFTER_VAL");
        assertThat(out.get(0)).containsEntry("SEQ_NO", 1).containsEntry("KEY2", "R1").containsEntry("AFTER_VAL", "Y");

        store.dtl.clear();
        assertThat(service.searchHistoryDtl(dreq("NOPE"))).isEmpty();
    }

    @Test
    @DisplayName("applyId 없음·너무 김 = PERM_BAD_VALUE")
    void dtlBad() {
        for (CommPermBenchSearchHistoryDtlRequest r : java.util.Arrays.asList(null, dreq(null), dreq("  "), dreq("x".repeat(41)))) {
            assertThatThrownBy(() -> service.searchHistoryDtl(r)).hasMessageContaining("PERM_BAD_VALUE: ");
        }
    }
}
