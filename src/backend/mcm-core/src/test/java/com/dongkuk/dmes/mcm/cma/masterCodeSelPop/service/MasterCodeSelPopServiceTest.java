package com.dongkuk.dmes.mcm.cma.masterCodeSelPop.service;

import com.dongkuk.dmes.mcm.cma.masterCodeSelPop.dto.MasterCodeSelPopSearchRequest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link MasterCodeSelPopService} 단위 테스트 — As-Is GetCodeDetailList 분기(pCodeId/pDiv) 1:1 검증.
 *
 * <p>대상 = 선행 커밋(Master관리(원장) 개발)의 기존 구현 (plain native + manual mapping,
 * {@code :pValueLike} 단일 바인딩 — C-001 흡수). EntityManager mock — SQL 문자열/바인딩 조립 검증.
 * 실 뷰(VI_MCM_CODE_ACCESS) 경로는 E2E(masterRuleDataList P-002 경유) 실측.
 */
@ExtendWith(MockitoExtension.class)
class MasterCodeSelPopServiceTest {

    @Mock EntityManager em;
    @Mock Query query;

    @InjectMocks MasterCodeSelPopService service;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "em", em);
        lenient().when(em.createNativeQuery(anyString())).thenReturn(query);
        lenient().when(query.setParameter(anyString(), any())).thenReturn(query);
        lenient().when(query.getResultList()).thenReturn(List.of());
    }

    @Test
    @DisplayName("search — pCodeId + pDiv=CODE_VAL: UPPER(CODE_ID) 동등 + UPPER(CODE_VAL) LIKE :pValueLike ('%v%' 바인딩 — C-001)")
    void search_codeVal분기() {
        List<Map<String, Object>> out = service.search(req("CURR_CD", "CODE_VAL", "KR"));

        String sql = capturedSql();
        assertThat(sql).contains("FROM MCMAPUSER.VI_MCM_CODE_ACCESS")          // C-003/C-005 — schema 명시 (a 안)
                .contains("UPPER(CODE_ID) = UPPER(:pCodeId)")                   // Mapper:16
                .contains("UPPER(CODE_VAL) LIKE UPPER(:pValueLike)")            // Mapper:19 → C-001 바인딩 흡수
                .contains("ORDER BY CODE_VAL");                                 // Mapper:26
        assertThat(sql).doesNotContain("CODE_VAL_MEAN) LIKE");
        verify(query).setParameter("pCodeId", "CURR_CD");
        verify(query).setParameter("pValueLike", "%KR%");
        assertThat(out).isEmpty();   // List 반환 (BPMN output=items — grids.items.rows)
    }

    @Test
    @DisplayName("search — pDiv=CODE_VAL_MEAN: 코드의미 LIKE 분기 (Mapper:22)")
    void search_codeValMean분기() {
        service.search(req("CURR_CD", "CODE_VAL_MEAN", "원"));

        String sql = capturedSql();
        assertThat(sql).contains("UPPER(CODE_VAL_MEAN) LIKE UPPER(:pValueLike)");
        assertThat(sql).doesNotContain("UPPER(CODE_VAL) LIKE");
    }

    @Test
    @DisplayName("search — pCodeId 공란: CODE_ID 조건 미포함 (As-Is if 미진입, V-001 보존) / pValue null = '%%' 전체 (V-003)")
    void search_codeId공란() {
        service.search(req("", "CODE_VAL", null));

        String sql = capturedSql();
        assertThat(sql).doesNotContain("CODE_ID");
        assertThat(sql).contains("UPPER(CODE_VAL) LIKE");
        verify(query).setParameter("pValueLike", "%%");   // null → "" → LIKE '%%'
        verify(query, never()).setParameter(eq("pCodeId"), any());
    }

    @Test
    @DisplayName("search — pDiv enum 밖: LIKE 분기 미진입 (As-Is equals 분기 1:1 — 바인딩 전용, injection 표면 없음)")
    void search_pDiv도메인밖() {
        List<Map<String, Object>> out = service.search(req("CURR_CD", "1=1; DROP TABLE X", "x"));

        String sql = capturedSql();
        assertThat(sql).doesNotContain("LIKE").doesNotContain("DROP");
        assertThat(out).isEmpty();
    }

    @Test
    @DisplayName("search — 행 매핑: SELECT 순서(CODE_VAL/CODE_VAL_MEAN/CATEGORY_ID/CATEGORY_NM) → 대문자 키 Map (As-Is Dataset bind)")
    void search_행매핑() {
        when(query.getResultList()).thenReturn(List.<Object[]>of(
                new Object[]{"KRW", "원화", "CURR", "통화"}));

        List<Map<String, Object>> out = service.search(req("CURR_CD", "CODE_VAL", "KRW"));

        assertThat(out).hasSize(1);
        assertThat(out.get(0)).containsEntry("CODE_VAL", "KRW").containsEntry("CODE_VAL_MEAN", "원화")
                .containsEntry("CATEGORY_ID", "CURR").containsEntry("CATEGORY_NM", "통화");
    }

    // ──────────────────────────────── helpers ────────────────────────────────

    private String capturedSql() {
        ArgumentCaptor<String> cap = ArgumentCaptor.forClass(String.class);
        verify(em).createNativeQuery(cap.capture());
        return cap.getValue();
    }

    private static MasterCodeSelPopSearchRequest req(String codeId, String div, String value) {
        var r = new MasterCodeSelPopSearchRequest();
        r.setPCodeId(codeId);
        r.setPDiv(div);
        r.setPValue(value);
        return r;
    }
}
