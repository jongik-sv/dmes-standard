package com.dongkuk.dmes.mcm.cmb.masterRuleDataList.service;

import com.dongkuk.dmes.mcm.cmb.masterRuleDataList.dto.MasterRuleDataListSearchRequest;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.repository.MasterRuleColListRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import jakarta.persistence.Tuple;
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
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link MasterRuleDataListService} 단위 테스트 — 동적 SQL 안전화(Q-007) 가드 + 조회 3액션.
 *
 * <p>EntityManager mock — SQL 문자열/바인딩 조립 검증. 실 DB 경로는 E2E(GATE-07)에서 실측.
 * 형제 masterRuleData 테스트와 동일 패턴 (조회 전용 — save 계열 케이스 없음).
 */
@ExtendWith(MockitoExtension.class)
class MasterRuleDataListServiceTest {

    @Mock MasterRuleColListRepository colListRepository;
    @Mock EntityManager em;
    @Mock Query query;

    @InjectMocks MasterRuleDataListService service;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "em", em);
        lenient().when(em.createNativeQuery(anyString(), eq(Tuple.class))).thenReturn(query);
        lenient().when(query.setParameter(anyString(), any())).thenReturn(query);
        lenient().when(query.getResultList()).thenReturn(List.of());
    }

    /** 컬럼정의 mock — E2ESRC: BASE_DT(DATE)/CURR_CD(VARCHAR2, PK·CODE_YN=Y)/APPLY_RATE(NUMBER). */
    private void mockColDefs() {
        // {RULE_ID, COL_SEQ, COL_ID, COL_NM, COL_LEN, COL_PREC_LEN, MES_COL_ID, CODE_YN, PK_YN, COL_TYPE, IO_FLAG}
        lenient().when(colListRepository.searchRuleColDefsWithPk("E2ESRC")).thenReturn(List.<Object[]>of(
                new Object[]{"E2ESRC", 1, "BASE_DT", "기준일자", 0, null, null, "N", "N", "DATE", "IN"},
                new Object[]{"E2ESRC", 2, "CURR_CD", "통화코드", 3, null, null, "Y", "Y", "VARCHAR2", "OUT"},
                new Object[]{"E2ESRC", 3, "APPLY_RATE", "적용환율", 10, 10, null, "N", "N", "NUMBER", "OUT"}));
    }

    // ──────────────────────────────── lov ────────────────────────────────

    @Test
    @DisplayName("lov — 11키 대문자 매핑 + ds_GetRuleColList 응답키 (CODE_YN — BR-008 마스터코드 셀 판정)")
    void lov_정상() {
        mockColDefs();

        Map<String, Object> out = service.lov(req("E2ESRC"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> list = (List<Map<String, Object>>) out.get("ds_GetRuleColList");
        assertThat(list).hasSize(3);
        assertThat(list.get(1)).containsEntry("COL_ID", "CURR_CD").containsEntry("CODE_YN", "Y")
                .containsEntry("COL_TYPE", "VARCHAR2");
        assertThat(out.get("cnt")).isEqualTo(3);
    }

    // ──────────────────────────────── 가드 (Q-007) ────────────────────────────────

    @Test
    @DisplayName("가드 — ruleId 공란 REQUIRED_VALUE(MSG-001) / 형식 위반 INVALID_VALUE / pTable 불일치 INVALID_VALUE")
    void 가드_ruleId() {
        assertThatThrownBy(() -> service.search(req(null)))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE));

        assertThatThrownBy(() -> service.search(req("BAD;DROP")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));

        MasterRuleDataListSearchRequest r = req("E2ESRC");
        r.setPTable("TB_MCA_OTHER");   // FE 조립값 불일치 — 서버 대조 차단
        assertThatThrownBy(() -> service.search(r))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));
    }

    @Test
    @DisplayName("가드 — 조건 컬럼 화이트리스트 밖 / 연산자 화이트리스트 밖 → INVALID_VALUE (injection 차단)")
    void 가드_조건컬럼_연산자() {
        mockColDefs();
        MasterRuleDataListSearchRequest r = req("E2ESRC");
        r.setPWhere1("1=1; DROP TABLE X --");
        r.setPVal1("x");
        assertThatThrownBy(() -> service.search(r))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));

        MasterRuleDataListSearchRequest r2 = req("E2ESRC");
        r2.setPWhere1("CURR_CD");
        r2.setPOperator1("OR 1=1");
        r2.setPVal1("x");
        assertThatThrownBy(() -> service.search(r2))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));
        verify(em, never()).createNativeQuery(anyString(), eq(Tuple.class));
    }

    @Test
    @DisplayName("가드 — 컬럼정의 미등록 BUSINESS_ERROR / COL_ID 식별자 형식 위반 INVALID_VALUE (2차 stored injection 차단)")
    void 가드_컬럼정의() {
        when(colListRepository.searchRuleColDefsWithPk("NOCOLS")).thenReturn(List.of());
        assertThatThrownBy(() -> service.search(req("NOCOLS")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.BUSINESS_ERROR));

        when(colListRepository.searchRuleColDefsWithPk("EVIL")).thenReturn(List.<Object[]>of(
                new Object[]{"EVIL", 1, "X=0 OR 1=1 --", "악성컬럼", 0, null, null, "N", "N", "VARCHAR2", "IN"}));
        assertThatThrownBy(() -> service.search(req("EVIL")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));
    }

    // ──────────────────────────────── search / export ────────────────────────────────

    @Test
    @DisplayName("search — CTE+ROW_NUMBER 페이징(As-Is Mapper #2) + VARCHAR2 UPPER 검색(BR-007) + 값 바인딩")
    void search_정상() {
        mockColDefs();
        MasterRuleDataListSearchRequest r = req("E2ESRC");
        r.setPWhere1("CURR_CD");
        r.setPOperator1("LIKE");
        r.setPVal1("krw");
        r.setPWhere2("APPLY_RATE");
        r.setPOperator2(">=");
        r.setPVal2("1");
        r.setCountPerPage(30);
        r.setCurrentPage(1);

        Map<String, Object> out = service.search(r);

        ArgumentCaptor<String> cap = ArgumentCaptor.forClass(String.class);
        verify(em).createNativeQuery(cap.capture(), eq(Tuple.class));
        String sql = cap.getValue();
        assertThat(sql).contains("WITH TB1 AS")
                .contains("ROW_NUMBER() OVER(ORDER BY RULE_SEQ)")
                .contains("MCAAPUSER.TB_MCA_E2ESRC")
                .contains("UPPER(CURR_CD) LIKE UPPER(:v1)")     // VARCHAR2 → UPPER (BR-007)
                .contains("APPLY_RATE >= :v2")                   // NUMBER → UPPER 미적용
                .contains("SEQ BETWEEN");
        verify(query).setParameter("v1", "krw");
        verify(query).setParameter("v2", "1");
        assertThat(out).containsKeys("ds_GetMasterRuleDataList", "cnt", "totalCount");
    }

    @Test
    @DisplayName("search — DATE 칸 LIKE 숫자 앞 일치는 반열린 범위(vN·vNe), 중간 일치는 현행 TO_CHAR LIKE")
    void search_날짜LIKE() {
        mockColDefs();
        MasterRuleDataListSearchRequest r = req("E2ESRC");
        r.setPWhere1("BASE_DT");
        r.setPOperator1("LIKE");
        r.setPVal1("2026-10%");
        r.setPWhere2("BASE_DT");
        r.setPOperator2("LIKE");
        r.setPVal2("%1003%");

        service.search(r);

        ArgumentCaptor<String> cap = ArgumentCaptor.forClass(String.class);
        verify(em).createNativeQuery(cap.capture(), eq(Tuple.class));
        assertThat(cap.getValue())
                .contains("BASE_DT >= TO_DATE(:v1, 'YYYYMMDDHH24MISS') AND BASE_DT < TO_DATE(:v1e, 'YYYYMMDDHH24MISS')")
                .contains("TO_CHAR(BASE_DT, 'YYYYMMDDHH24MISS') LIKE :v2");
        verify(query).setParameter("v1", "20261001000000");
        verify(query).setParameter("v1e", "20261101000000");
        verify(query).setParameter("v2", "%1003%");
    }

    @Test
    @DisplayName("searchExport — 전건 ORDER BY RULE_SEQ (As-Is Mapper #3) + ds_GetMasterRuleDataListExport 응답키")
    void searchExport_정상() {
        mockColDefs();

        Map<String, Object> out = service.searchExport(req("E2ESRC"));

        ArgumentCaptor<String> cap = ArgumentCaptor.forClass(String.class);
        verify(em).createNativeQuery(cap.capture(), eq(Tuple.class));
        assertThat(cap.getValue()).contains("SELECT * FROM MCAAPUSER.TB_MCA_E2ESRC ORDER BY RULE_SEQ");
        assertThat(out).containsKeys("ds_GetMasterRuleDataListExport", "cnt");
    }

    // ──────────────────────────────── builders ────────────────────────────────

    private static MasterRuleDataListSearchRequest req(String ruleId) {
        var r = new MasterRuleDataListSearchRequest();
        r.setPRuleId(ruleId);
        return r;
    }
}
