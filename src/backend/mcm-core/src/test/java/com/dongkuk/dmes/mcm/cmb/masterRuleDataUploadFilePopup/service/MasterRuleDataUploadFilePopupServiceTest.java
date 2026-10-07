package com.dongkuk.dmes.mcm.cmb.masterRuleDataUploadFilePopup.service;

import com.dongkuk.dmes.mcm.cmb.masterRuleDataUploadFilePopup.dto.MasterRuleDataUploadFilePopupSaveRequest;
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

import java.util.LinkedHashMap;
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
 * {@link MasterRuleDataUploadFilePopupService} 단위 테스트 — 동적 SQL 안전화(Q-104) 가드 +
 * save(선삭제/채번/DATE 정규화/audit/행번호 예외) 중심.
 *
 * <p>EntityManager mock — SQL 문자열/바인딩 조립 검증. 실 DB 경로는 E2E(GATE-07)에서 실측.
 */
@ExtendWith(MockitoExtension.class)
class MasterRuleDataUploadFilePopupServiceTest {

    @Mock MasterRuleColListRepository colListRepository;
    @Mock EntityManager em;
    @Mock Query query;

    @InjectMocks MasterRuleDataUploadFilePopupService service;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "em", em);
        lenient().when(em.createNativeQuery(anyString())).thenReturn(query);
        lenient().when(query.setParameter(anyString(), any())).thenReturn(query);
        lenient().when(query.executeUpdate()).thenReturn(1);
        lenient().when(query.getSingleResult()).thenReturn(0L);
        lenient().when(query.getResultList()).thenReturn(List.of());
    }

    /** 컬럼정의 mock — E2ESRC: BASE_DT(DATE)/CURR_CD(VARCHAR2)/APPLY_RATE(NUMBER). */
    private void mockColDefs() {
        // {RULE_ID, COL_SEQ, COL_ID, COL_NM, COL_LEN, COL_PREC_LEN, MES_COL_ID, CODE_YN, PK_YN, COL_TYPE, IO_FLAG}
        lenient().when(colListRepository.searchRuleColDefsWithPk("E2ESRC")).thenReturn(List.<Object[]>of(
                new Object[]{"E2ESRC", 1, "BASE_DT", "기준일자", 0, null, null, "N", "N", "DATE", "IN"},
                new Object[]{"E2ESRC", 2, "CURR_CD", "통화코드", 3, null, null, "Y", "Y", "VARCHAR2", "OUT"},
                new Object[]{"E2ESRC", 3, "APPLY_RATE", "적용환율", 10, 10, null, "N", "N", "NUMBER", "OUT"}));
    }

    private static MasterRuleDataUploadFilePopupSaveRequest req(String ruleId) {
        var r = new MasterRuleDataUploadFilePopupSaveRequest();
        r.setPRuleId(ruleId);
        return r;
    }

    private static Map<String, Object> row(String baseDt, String currCd, String rate) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (baseDt != null) m.put("BASE_DT", baseDt);
        if (currCd != null) m.put("CURR_CD", currCd);
        if (rate != null) m.put("APPLY_RATE", rate);
        return m;
    }

    // ──────────────────────────────── searchCol / search ────────────────────────────────

    @Test
    @DisplayName("searchCol — 11키 대문자 매핑 + ds_GetRuleColUploadList 응답키 (As-Is resultKey — R-103)")
    void searchCol_정상() {
        mockColDefs();

        Map<String, Object> out = service.searchCol(req("E2ESRC"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> list = (List<Map<String, Object>>) out.get("ds_GetRuleColUploadList");
        assertThat(list).hasSize(3);
        assertThat(list.get(0)).containsEntry("COL_ID", "BASE_DT").containsEntry("COL_TYPE", "DATE")
                .containsEntry("IO_FLAG", "IN");
        assertThat(out.get("cnt")).isEqualTo(3);
    }

    @Test
    @DisplayName("search — SELECT * 전건 (As-Is Mapper #2 — WHERE/ORDER 없음 보존) + ds_GetRuleDataUploadList 응답키")
    void search_정상() {
        lenient().when(em.createNativeQuery(anyString(), eq(Tuple.class))).thenReturn(query);

        Map<String, Object> out = service.search(req("E2ESRC"));

        ArgumentCaptor<String> cap = ArgumentCaptor.forClass(String.class);
        verify(em).createNativeQuery(cap.capture(), eq(Tuple.class));
        assertThat(cap.getValue()).isEqualTo("SELECT * FROM MCAAPUSER.TB_MCA_E2ESRC");
        assertThat(out).containsKeys("ds_GetRuleDataUploadList", "cnt");
    }

    // ──────────────────────────────── 가드 (Q-104) ────────────────────────────────

    @Test
    @DisplayName("가드 — ruleId 공란 REQUIRED_VALUE / 형식 위반 INVALID_VALUE / pTable 불일치 INVALID_VALUE / COL_ID 형식 위반")
    void 가드_안전화() {
        assertThatThrownBy(() -> service.save(req(null), List.of()))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE));

        assertThatThrownBy(() -> service.save(req("BAD;DROP"), List.of()))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));

        MasterRuleDataUploadFilePopupSaveRequest r = req("E2ESRC");
        r.setPTable("TB_MCA_OTHER");
        assertThatThrownBy(() -> service.save(r, List.of()))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));

        when(colListRepository.searchRuleColDefsWithPk("EVIL")).thenReturn(List.<Object[]>of(
                new Object[]{"EVIL", 1, "X; DROP TABLE Y --", "악성컬럼", 0, null, null, "N", "N", "VARCHAR2", "IN"}));
        assertThatThrownBy(() -> service.save(req("EVIL"), List.of(row(null, "A", null))))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));
        verify(query, never()).executeUpdate();
    }

    // ──────────────────────────────── save ────────────────────────────────

    @Test
    @DisplayName("save regFlag=true — 전건 선삭제(R-107) 후 채번 base 조회(Q-103 본 화면 일원화 — COALESCE) + INSERT")
    void save_삭제등록() {
        mockColDefs();
        when(query.getSingleResult()).thenReturn(5L);   // MAX(RULE_SEQ)=5

        MasterRuleDataUploadFilePopupSaveRequest r = req("E2ESRC");
        r.setPRegFlag("true");
        Map<String, Object> out = service.save(r, List.of(row("2026-07-09", "GBP", "1900.5")));

        ArgumentCaptor<String> cap = ArgumentCaptor.forClass(String.class);
        verify(em, org.mockito.Mockito.atLeast(3)).createNativeQuery(cap.capture());
        List<String> sqls = cap.getAllValues();
        assertThat(sqls.stream().anyMatch(s -> s.equals("DELETE FROM MCAAPUSER.TB_MCA_E2ESRC"))).isTrue();   // R-107 전건
        assertThat(sqls.stream().anyMatch(s -> s.contains("COALESCE(MAX(RULE_SEQ), 0)"))).isTrue();            // Q-103/C-002
        verify(query, org.mockito.Mockito.atLeastOnce()).setParameter(eq("ruleSeq"), eq(6L));                 // 채번 5+1 (R-109)
        verify(query, org.mockito.Mockito.atLeastOnce()).setParameter(eq("ruleVer"), eq("1"));                // R-109
        assertThat(out.get("cnt_import")).isEqualTo(1);
    }

    @Test
    @DisplayName("save regFlag=false — 선삭제 없이 INSERT 만 (R-108) + DATE '-' 제거·14자 절단(R-110) + audit 8컬럼(Q-105) + 화이트리스트")
    void save_일반등록() {
        mockColDefs();

        Map<String, Object> r1 = row("2026-07-09", "GBP", "1900.5");
        r1.put("EVIL_COL", "x");             // 화이트리스트 밖 — 무시 (Q-104)
        r1.put("RULE_SEQ", "999");           // 서버 채번 — 행 값 미신뢰
        Map<String, Object> out = service.save(req("E2ESRC"), List.of(r1));

        ArgumentCaptor<String> cap = ArgumentCaptor.forClass(String.class);
        verify(em, org.mockito.Mockito.atLeastOnce()).createNativeQuery(cap.capture());
        List<String> sqls = cap.getAllValues();
        assertThat(sqls.stream().noneMatch(s -> s.startsWith("DELETE"))).isTrue();   // R-108
        String insertSql = sqls.stream().filter(s -> s.startsWith("INSERT")).findFirst().orElseThrow();
        assertThat(insertSql).contains("RULE_VER, RULE_SEQ")
                .contains("C_USR_ID").contains("U_PGM_ID");                          // Q-105 audit 8
        assertThat(insertSql).doesNotContain("EVIL_COL");
        verify(query, org.mockito.Mockito.atLeastOnce()).setParameter(eq("c0"), eq("20260709"));   // R-110 '-' 제거
        verify(query, org.mockito.Mockito.atLeastOnce()).setParameter(eq("ruleSeq"), eq(1L));       // COALESCE 0 + 1
        assertThat(out.get("cnt_import")).isEqualTo(1);
    }

    @Test
    @DisplayName("save — 빈 업로드 + regFlag=true 는 전건삭제 차단 (Q-102 확정 — 서버 이중 방어)")
    void save_빈업로드_삭제등록차단() {
        mockColDefs();
        MasterRuleDataUploadFilePopupSaveRequest r = req("E2ESRC");
        r.setPRegFlag("true");

        assertThatThrownBy(() -> service.save(r, List.of()))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.BUSINESS_ERROR));
        verify(query, never()).executeUpdate();   // DELETE 미수행
    }

    @Test
    @DisplayName("save — INSERT 영향행 0 이면 행 번호 포함 예외 (MT-003/RC-001 — F-001 해소, atomic rollback 전파)")
    void save_행번호예외() {
        mockColDefs();
        when(query.executeUpdate()).thenReturn(1).thenReturn(0);   // 1행 성공 → 2행 실패

        assertThatThrownBy(() -> service.save(req("E2ESRC"),
                List.of(row(null, "GBP", "1"), row(null, "CHF", "2"))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("2행 등록 실패");
    }
}
