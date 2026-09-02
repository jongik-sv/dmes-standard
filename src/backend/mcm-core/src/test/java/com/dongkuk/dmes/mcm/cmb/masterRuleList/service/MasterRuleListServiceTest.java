package com.dongkuk.dmes.mcm.cmb.masterRuleList.service;

import com.dongkuk.dmes.mcm.cmb.masterRuleList.dto.MasterRuleListSearchRequest;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.entity.RuleMaster;
import com.dongkuk.dmes.mcm.repository.RuleMasterRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link MasterRuleListService} 단위 테스트 — mcm-core Mockito 패턴.
 *
 * <p>검증: search(12 컬럼 매핑 + 타임스탬프 포맷 + 공란→null 위임) /
 * save(rowStatus C INSERT 7컬럼 / 중복PK DUPLICATE_DATA / U UPDATE 3컬럼 / RULE_ID 공란 REQUIRED_VALUE).
 */
@ExtendWith(MockitoExtension.class)
class MasterRuleListServiceTest {

    @Mock RuleMasterRepository repository;

    @InjectMocks MasterRuleListService service;

    // ──────────────────────────────── search ────────────────────────────────

    @Test
    @DisplayName("search — 12 컬럼 camelCase 매핑 + 타임스탬프 포맷 + 공란→null 위임")
    void search_정상() {
        Instant cAt = Instant.parse("2026-01-02T03:04:05Z");
        Instant uAt = Instant.parse("2026-06-02T01:23:45Z");
        // {ruleId, oldRuleId, ruleNm, ruleDesc, ruleVer, ruleTp, ruleOwnerDeptNm, ruleOwnerEmpNo, useTp, createdAt, updatedBy, updatedAt}
        when(repository.searchRuleMasterList("USD", null)).thenReturn(List.<Object[]>of(
                new Object[]{"USD", null, "달러 업무기준", "설명", new BigDecimal("1"), "A", "재무팀", "E001", "Y", cAt, "USER1", uAt}));

        Map<String, Object> out = service.search(req("USD", ""));   // pRuleNm "" → null 위임

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> list = (List<Map<String, Object>>) out.get("list");
        assertThat(list).hasSize(1);
        Map<String, Object> r = list.get(0);
        assertThat(r.get("ruleId")).isEqualTo("USD");
        assertThat(r.get("ruleNm")).isEqualTo("달러 업무기준");
        assertThat(r.get("ruleDesc")).isEqualTo("설명");
        assertThat(r.get("ruleVer")).isEqualTo(new BigDecimal("1"));
        assertThat(r.get("ruleTp")).isEqualTo("A");
        assertThat(r.get("ruleOwnerEmpNo")).isEqualTo("E001");
        assertThat(r.get("useTp")).isEqualTo("Y");
        assertThat(r.get("lastUpdatedObjectId")).isEqualTo("USER1");
        assertThat(r.get("creationTimestamp")).asString().contains("2026-01-02");   // 포맷됨(비-null)
        assertThat(r.get("lastUpdateTimestamp")).asString().contains("2026-06-02");
        assertThat(out.get("cnt")).isEqualTo(1);
    }

    // ──────────────────────────────── save (C/U) ────────────────────────────────

    @Test
    @DisplayName("save — C INSERT (7컬럼 + RULE_VER 공란→'1'), 중복PK 없음")
    void save_insert_신규() {
        when(repository.existsById("USD")).thenReturn(false);
        when(repository.searchRuleMasterList(any(), any())).thenReturn(List.of());   // 자동 재조회

        Map<String, Object> out = service.save(req("", ""), List.of(
                rowC("USD", "달러", "설명", "Y", "A", "E001", "")));   // ruleVer 공란

        ArgumentCaptor<RuleMaster> cap = ArgumentCaptor.forClass(RuleMaster.class);
        verify(repository, times(1)).save(cap.capture());
        RuleMaster e = cap.getValue();
        assertThat(e.getRuleId()).isEqualTo("USD");
        assertThat(e.getRuleNm()).isEqualTo("달러");
        assertThat(e.getRuleDesc()).isEqualTo("설명");
        assertThat(e.getUseTp()).isEqualTo("Y");
        assertThat(e.getRuleTp()).isEqualTo("A");
        assertThat(e.getRuleOwnerEmpNo()).isEqualTo("E001");
        assertThat(e.getRuleVer()).isEqualByComparingTo(new BigDecimal("1"));  // 공란→1 (As-Is xfdl:231)
        assertThat(out.get("cnt_save")).isEqualTo(1);
    }

    @Test
    @DisplayName("save — C 중복 PK: DUPLICATE_DATA throw (save·재조회 미실행)")
    void save_insert_중복() {
        when(repository.existsById("USD")).thenReturn(true);

        assertThatThrownBy(() -> service.save(req("", ""), List.of(rowC("USD", "달러", "설명", "Y", "A", "E001", "1"))))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> {
                    assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.DUPLICATE_DATA);
                    assertThat(e.getMessage()).contains("동일한 업무기준ID가 존재합니다");
                });

        verify(repository, never()).save(any());
        verify(repository, never()).searchRuleMasterList(anyString(), anyString());
    }

    @Test
    @DisplayName("save — U UPDATE (RULE_NM/RULE_DESC/USE_TP 3컬럼만 갱신, RULE_TP/RULE_VER 보존)")
    void save_update_기존() {
        RuleMaster existing = new RuleMaster();
        existing.setRuleId("USD");
        existing.setRuleNm("구명");
        existing.setRuleDesc("구설명");
        existing.setUseTp("Y");
        existing.setRuleTp("A");
        existing.setRuleVer(new BigDecimal("1"));
        when(repository.findById("USD")).thenReturn(Optional.of(existing));
        when(repository.searchRuleMasterList(any(), any())).thenReturn(List.of());

        service.save(req("", ""), List.of(rowU("USD", "신명", "신설명", "N")));

        ArgumentCaptor<RuleMaster> cap = ArgumentCaptor.forClass(RuleMaster.class);
        verify(repository).save(cap.capture());
        RuleMaster e = cap.getValue();
        assertThat(e.getRuleNm()).isEqualTo("신명");      // 갱신
        assertThat(e.getRuleDesc()).isEqualTo("신설명");   // 갱신
        assertThat(e.getUseTp()).isEqualTo("N");           // 갱신
        assertThat(e.getRuleTp()).isEqualTo("A");          // 보존 (UPDATE 미포함)
        assertThat(e.getRuleVer()).isEqualByComparingTo(new BigDecimal("1"));  // 보존
    }

    @Test
    @DisplayName("save — C RULE_ID 공란: REQUIRED_VALUE (save·재조회 미실행)")
    void save_ruleId_공란() {
        assertThatThrownBy(() -> service.save(req("", ""), List.of(rowC("", "달러", "설명", "Y", "A", "E001", "1"))))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE));

        verify(repository, never()).save(any());
        verify(repository, never()).searchRuleMasterList(anyString(), anyString());
    }

    // ──────────────────────────────── builders ────────────────────────────────

    private static MasterRuleListSearchRequest req(String ruleId, String ruleNm) {
        var r = new MasterRuleListSearchRequest();
        r.setPRuleId(ruleId);
        r.setPRuleNm(ruleNm);
        return r;
    }

    private static Map<String, Object> rowC(String ruleId, String ruleNm, String ruleDesc,
                                            String useTp, String ruleTp, String ruleOwnerEmpNo, String ruleVer) {
        Map<String, Object> m = baseRow("C", ruleId);
        m.put("ruleNm", ruleNm);
        m.put("ruleDesc", ruleDesc);
        m.put("useTp", useTp);
        m.put("ruleTp", ruleTp);
        m.put("ruleOwnerEmpNo", ruleOwnerEmpNo);
        m.put("ruleVer", ruleVer);
        return m;
    }

    private static Map<String, Object> rowU(String ruleId, String ruleNm, String ruleDesc, String useTp) {
        Map<String, Object> m = baseRow("U", ruleId);
        m.put("ruleNm", ruleNm);
        m.put("ruleDesc", ruleDesc);
        m.put("useTp", useTp);
        return m;
    }

    private static Map<String, Object> baseRow(String rowStatus, String ruleId) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowStatus", rowStatus);
        m.put("ruleId", ruleId);
        return m;
    }
}
