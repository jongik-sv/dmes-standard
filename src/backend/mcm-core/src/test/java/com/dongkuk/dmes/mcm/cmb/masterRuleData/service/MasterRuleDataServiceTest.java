package com.dongkuk.dmes.mcm.cmb.masterRuleData.service;

import com.dongkuk.dmes.mcm.cmb.masterRuleData.dto.MasterRuleDataSearchRequest;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.repository.MasterRuleColListRepository;
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

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link MasterRuleDataService} 단위 테스트 — 동적 SQL 안전화(Q-007) 가드 + save 분기 중심.
 *
 * <p>EntityManager 는 mock — SQL 문자열/바인딩 조립 검증. 실 DB 경로는 E2E(GATE-07)에서 실측.
 */
@ExtendWith(MockitoExtension.class)
class MasterRuleDataServiceTest {

    @Mock MasterRuleColListRepository colListRepository;
    @Mock EntityManager em;
    @Mock Query query;

    @InjectMocks MasterRuleDataService service;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "em", em);
        lenient().when(em.createNativeQuery(anyString())).thenReturn(query);
        lenient().when(query.setParameter(anyString(), any())).thenReturn(query);
        lenient().when(query.executeUpdate()).thenReturn(1);
        lenient().when(query.getSingleResult()).thenReturn(0L);
    }

    /** 컬럼정의 mock — E2ESRC: BASE_DT(DATE)/CURR_CD(VARCHAR2, PK)/APPLY_RATE(NUMBER). */
    private void mockColDefs() {
        // {RULE_ID, COL_SEQ, COL_ID, COL_NM, COL_LEN, COL_PREC_LEN, MES_COL_ID, CODE_YN, PK_YN, COL_TYPE, IO_FLAG}
        lenient().when(colListRepository.searchRuleColDefsWithPk("E2ESRC")).thenReturn(List.<Object[]>of(
                new Object[]{"E2ESRC", 1, "BASE_DT", "기준일자", 0, null, null, "N", "N", "DATE", "IN"},
                new Object[]{"E2ESRC", 2, "CURR_CD", "통화코드", 3, null, null, "Y", "Y", "VARCHAR2", "OUT"},
                new Object[]{"E2ESRC", 3, "APPLY_RATE", "적용환율", 10, 10, null, "N", "N", "NUMBER", "OUT"}));
    }

    // ──────────────────────────────── lov ────────────────────────────────

    @Test
    @DisplayName("lov — 11키 대문자 매핑 + ds_GetRuleColList 응답키 (As-Is resultKey/동적 bind 키 보존)")
    void lov_정상() {
        mockColDefs();

        Map<String, Object> out = service.lov(req("E2ESRC"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> list = (List<Map<String, Object>>) out.get("ds_GetRuleColList");
        assertThat(list).hasSize(3);
        assertThat(list.get(0)).containsEntry("COL_ID", "BASE_DT").containsEntry("COL_TYPE", "DATE")
                .containsEntry("PK_YN", "N").containsEntry("IO_FLAG", "IN");
        assertThat(list.get(1)).containsEntry("PK_YN", "Y").containsEntry("CODE_YN", "Y");
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

        MasterRuleDataSearchRequest r = req("E2ESRC");
        r.setPTable("TB_MCA_OTHER");   // FE 조립값 불일치 — 서버 대조 차단
        assertThatThrownBy(() -> service.search(r))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));
    }

    @Test
    @DisplayName("가드 — 조건 컬럼이 컬럼정의 화이트리스트 밖이면 INVALID_VALUE (injection 차단)")
    void 가드_조건컬럼() {
        mockColDefs();
        MasterRuleDataSearchRequest r = req("E2ESRC");
        r.setPWhere1("1=1; DROP TABLE X --");
        r.setPVal1("x");

        assertThatThrownBy(() -> service.search(r))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));
        verify(em, never()).createNativeQuery(anyString(), eq(jakarta.persistence.Tuple.class));
    }

    @Test
    @DisplayName("가드 — 연산자 화이트리스트(LIKE/=/<=/>=) 밖이면 INVALID_VALUE")
    void 가드_연산자() {
        mockColDefs();
        MasterRuleDataSearchRequest r = req("E2ESRC");
        r.setPWhere1("CURR_CD");
        r.setPOperator1("OR 1=1");
        r.setPVal1("x");

        assertThatThrownBy(() -> service.search(r))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));
    }

    @Test
    @DisplayName("가드 — 컬럼정의 미등록 업무기준: BUSINESS_ERROR")
    void 가드_컬럼정의없음() {
        when(colListRepository.searchRuleColDefsWithPk("NOCOLS")).thenReturn(List.of());

        assertThatThrownBy(() -> service.search(req("NOCOLS")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.BUSINESS_ERROR));
    }

    @Test
    @DisplayName("가드 — 컬럼정의 COL_ID 가 식별자 형식이 아니면 INVALID_VALUE (2차 stored injection 차단)")
    void 가드_colId형식() {
        when(colListRepository.searchRuleColDefsWithPk("E2ESRC")).thenReturn(List.<Object[]>of(
                new Object[]{"E2ESRC", 1, "X=0 OR 1=1 --", "악성컬럼", 0, null, null, "N", "N", "VARCHAR2", "IN"}));

        assertThatThrownBy(() -> service.search(req("E2ESRC")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));
        verify(em, never()).createNativeQuery(anyString(), eq(jakarta.persistence.Tuple.class));
    }

    // ──────────────────────────────── save ────────────────────────────────

    @Test
    @DisplayName("save U — 화이트리스트 컬럼만 SET + RULE_SEQ WHERE(BR-011) + U_* audit + DATE 14자 절단(BR-009)")
    void save_update() {
        mockColDefs();
        mockSearchForReload();

        Map<String, Object> row = new LinkedHashMap<>();
        row.put("rowStatus", "U");
        row.put("RULE_SEQ", 7);
        row.put("BASE_DT", "20260708123456789");      // DATE 17자 → 14자 절단
        row.put("CURR_CD", "USD");
        row.put("EVIL_COL", "x");                     // 화이트리스트 밖 — 무시 (filterKeyByColId)
        Map<String, Object> out = service.save(req("E2ESRC"), List.of(row));

        ArgumentCaptor<String> sqlCap = ArgumentCaptor.forClass(String.class);
        verify(em, org.mockito.Mockito.atLeastOnce()).createNativeQuery(sqlCap.capture());
        String updateSql = sqlCap.getAllValues().stream().filter(s -> s.startsWith("UPDATE")).findFirst().orElseThrow();
        assertThat(updateSql).contains("MCAAPUSER.TB_MCA_E2ESRC")
                .contains("WHERE RULE_SEQ = :seq")
                .contains("U_USR_ID").contains("U_AT = SYSDATETIME()");
        assertThat(updateSql).doesNotContain("EVIL_COL");
        verify(query, org.mockito.Mockito.atLeastOnce()).setParameter(eq("c0"), eq("20260708123456"));   // 절단 확인
        assertThat(out.get("cnt_save")).isEqualTo(1);
        assertThat(out).containsKey("ds_GetMasterRuleData");   // 재조회 동봉
    }

    @Test
    @DisplayName("save C — GetMaxRuleSeq 채번+1(BR-010) / RULE_VER='1' / C_*+U_* audit 포함")
    void save_insert() {
        mockColDefs();
        mockSearchForReload();
        when(query.getSingleResult()).thenReturn(5L);   // MAX(RULE_SEQ)=5

        Map<String, Object> row = new LinkedHashMap<>();
        row.put("rowStatus", "C");
        row.put("CURR_CD", "EUR");
        Map<String, Object> out = service.save(req("E2ESRC"), List.of(row));

        ArgumentCaptor<String> sqlCap = ArgumentCaptor.forClass(String.class);
        verify(em, org.mockito.Mockito.atLeastOnce()).createNativeQuery(sqlCap.capture());
        String insertSql = sqlCap.getAllValues().stream().filter(s -> s.startsWith("INSERT")).findFirst().orElseThrow();
        assertThat(insertSql).contains("RULE_VER, RULE_SEQ")
                .contains("C_USR_ID").contains("U_PGM_ID");
        verify(query, org.mockito.Mockito.atLeastOnce()).setParameter(eq("ruleSeq"), eq(6L));   // 채번 5+1
        verify(query, org.mockito.Mockito.atLeastOnce()).setParameter(eq("ruleVer"), eq("1"));
        assertThat(out.get("cnt_save")).isEqualTo(1);
    }

    @Test
    @DisplayName("save D — RULE_SEQ WHERE 삭제 / RULE_SEQ 없는 U·D 행은 REQUIRED_VALUE")
    void save_delete_및_seq가드() {
        mockColDefs();
        mockSearchForReload();

        Map<String, Object> del = new LinkedHashMap<>();
        del.put("rowStatus", "D");
        del.put("RULE_SEQ", 3);
        Map<String, Object> out = service.save(req("E2ESRC"), List.of(del));
        ArgumentCaptor<String> sqlCap = ArgumentCaptor.forClass(String.class);
        verify(em, org.mockito.Mockito.atLeastOnce()).createNativeQuery(sqlCap.capture());
        assertThat(sqlCap.getAllValues().stream().anyMatch(s -> s.startsWith("DELETE") && s.contains("WHERE RULE_SEQ = :seq"))).isTrue();
        assertThat(out.get("cnt_save")).isEqualTo(1);

        Map<String, Object> noSeq = new LinkedHashMap<>();
        noSeq.put("rowStatus", "D");
        assertThatThrownBy(() -> service.save(req("E2ESRC"), List.of(noSeq)))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE));
    }

    // ──────────────────────────────── builders / mocks ────────────────────────────────

    /** save 말미 재조회(search) 경로 — Tuple 쿼리 mock (빈 결과). */
    @SuppressWarnings("unchecked")
    private void mockSearchForReload() {
        Query tupleQuery = org.mockito.Mockito.mock(Query.class);
        lenient().when(em.createNativeQuery(anyString(), eq(jakarta.persistence.Tuple.class))).thenReturn(tupleQuery);
        lenient().when(tupleQuery.setParameter(anyString(), any())).thenReturn(tupleQuery);
        lenient().when(tupleQuery.getResultList()).thenReturn(List.of());
    }

    private static MasterRuleDataSearchRequest req(String ruleId) {
        var r = new MasterRuleDataSearchRequest();
        r.setPRuleId(ruleId);
        return r;
    }
}
