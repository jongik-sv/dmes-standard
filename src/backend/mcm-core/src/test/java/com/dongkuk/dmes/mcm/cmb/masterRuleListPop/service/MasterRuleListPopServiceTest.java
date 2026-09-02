package com.dongkuk.dmes.mcm.cmb.masterRuleListPop.service;

import com.dongkuk.dmes.mcm.cmb.masterRuleListPop.dto.MasterRuleListPopSearchRequest;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.repository.RuleMasterRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link MasterRuleListPopService} 단위 테스트 — mcm-core Mockito 패턴 (형제 화면 선례 동일).
 *
 * <p>검증: search(9 컬럼 camelCase 매핑 + ds_GetRuleMasterList 응답키 + cnt) /
 * 공란→null 위임 / sSchema 화이트리스트 (Q-002 — 공란·MCAAPUSER·MCA_SOURCE 허용, 그 외 INVALID_VALUE).
 */
@ExtendWith(MockitoExtension.class)
class MasterRuleListPopServiceTest {

    @Mock RuleMasterRepository repository;

    @InjectMocks MasterRuleListPopService service;

    @Test
    @DisplayName("search — 9 컬럼 camelCase 매핑 + ds_GetRuleMasterList 응답키 + cnt (MSG-001)")
    void search_정상() {
        // {ruleId, oldRuleId, ruleNm, ruleDesc, ruleVer, ruleTp, ruleOwnerDeptNm, ruleOwnerEmpNo, useTp}
        when(repository.searchRuleMasterListPop("USD", null)).thenReturn(List.<Object[]>of(
                new Object[]{"USD", null, "달러 기준", "설명", new BigDecimal("1"), "A", "재무팀", "E001", "Y"}));

        Map<String, Object> out = service.search(req("USD", "", null));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> list = (List<Map<String, Object>>) out.get("ds_GetRuleMasterList");
        assertThat(list).hasSize(1);
        Map<String, Object> r = list.get(0);
        assertThat(r.get("ruleId")).isEqualTo("USD");        // 반환 sRuleId (BR-006)
        assertThat(r.get("ruleNm")).isEqualTo("달러 기준");   // 반환 sRuleNm (BR-006)
        assertThat(r).containsKeys("oldRuleId", "ruleDesc", "ruleVer", "ruleTp",
                "ruleOwnerDeptNm", "ruleOwnerEmpNo", "useTp");   // As-Is 9 컬럼 보존
        assertThat(out.get("cnt")).isEqualTo(1);
    }

    @Test
    @DisplayName("search — 조건 공란 → null 위임 (전체 조회, As-Is if skip)")
    void search_공란() {
        when(repository.searchRuleMasterListPop(null, null)).thenReturn(List.of());

        Map<String, Object> out = service.search(req("", "", ""));

        assertThat(out.get("cnt")).isEqualTo(0);
        verify(repository).searchRuleMasterListPop(null, null);
    }

    @Test
    @DisplayName("search — sSchema 화이트리스트 허용 (MCAAPUSER / MCA_SOURCE 동의어 — Q-002)")
    void search_sSchema_허용() {
        when(repository.searchRuleMasterListPop(any(), any())).thenReturn(List.of());

        assertThat(service.search(req("", "", "MCAAPUSER")).get("cnt")).isEqualTo(0);
        assertThat(service.search(req("", "", "MCA_SOURCE")).get("cnt")).isEqualTo(0);   // As-Is synonym
    }

    @Test
    @DisplayName("search — sSchema 화이트리스트 외 값: INVALID_VALUE (SQL injection 표면 차단)")
    void search_sSchema_거부() {
        assertThatThrownBy(() -> service.search(req("", "", "EVIL;DROP")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));

        verify(repository, never()).searchRuleMasterListPop(anyString(), anyString());
    }

    private static MasterRuleListPopSearchRequest req(String ruleId, String ruleNm, String schema) {
        var r = new MasterRuleListPopSearchRequest();
        r.setPRuleId(ruleId);
        r.setPRuleNm(ruleNm);
        r.setSSchema(schema);
        return r;
    }
}
