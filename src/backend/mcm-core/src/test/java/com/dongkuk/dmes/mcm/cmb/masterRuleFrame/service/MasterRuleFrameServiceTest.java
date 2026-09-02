package com.dongkuk.dmes.mcm.cmb.masterRuleFrame.service;

import com.dongkuk.dmes.mcm.cmb.masterRuleFrame.dto.MasterRuleFrameSearchRequest;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.entity.MasterRuleColList;
import com.dongkuk.dmes.mcm.entity.MasterRuleColListId;
import com.dongkuk.dmes.mcm.repository.MasterRuleColListRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link MasterRuleFrameService} 단위 테스트 — mcm-core Mockito 패턴 (masterRuleList 선례 동일).
 *
 * <p>검증: search(IN/OUT 2 조회 + camelCase 12 컬럼 + ds_* 응답키) /
 * save(delete-all→insert BR-003 / COL_SEQ 통합 순번 BR-004 / RULE_VER 공란→1 BR-005 /
 * 필수검증 VAL-01 MSG-001~005 / ruleId 가드 BR-012 / 정수 검증 BR-009).
 */
@ExtendWith(MockitoExtension.class)
class MasterRuleFrameServiceTest {

    @Mock MasterRuleColListRepository repository;

    @InjectMocks MasterRuleFrameService service;

    // ──────────────────────────────── search ────────────────────────────────

    @Test
    @DisplayName("search — IN/OUT 2 조회, camelCase 12 컬럼 매핑, ds_* 응답키, cnt=IN 건수")
    void search_정상() {
        when(repository.searchRuleColList("USD", "IN")).thenReturn(List.of(
                entity("USD", 1, "기준일자", "BASE_DT", "N", "DATE", 8, null, "IN"),
                entity("USD", 2, "통화코드", "CURR_CD", "Y", "VARCHAR2", 3, null, "IN")));
        when(repository.searchRuleColList("USD", "OUT")).thenReturn(List.of(
                entity("USD", 3, "적용환율", "APPLY_RATE", "N", "NUMBER", 10, 4, "OUT")));

        Map<String, Object> out = service.search(req("USD"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> inList = (List<Map<String, Object>>) out.get("ds_GetRuleColInList");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> outList = (List<Map<String, Object>>) out.get("ds_GetRuleColOutList");

        assertThat(inList).hasSize(2);
        assertThat(outList).hasSize(1);
        assertThat(out.get("cnt")).isEqualTo(2);   // MSG-010 — IN 건수 (As-Is xfdl:382)

        Map<String, Object> r = inList.get(0);     // 12 컬럼 camelCase (분석 §6.1)
        assertThat(r.get("ruleId")).isEqualTo("USD");
        assertThat(r.get("colSeq")).isEqualTo(1);
        assertThat(r.get("colNm")).isEqualTo("기준일자");
        assertThat(r.get("colId")).isEqualTo("BASE_DT");
        assertThat(r.get("masterCodeDiv")).isEqualTo("N");
        assertThat(r.get("colType")).isEqualTo("DATE");
        assertThat(r.get("colLen")).isEqualTo(8);
        assertThat(r.get("colPrecLen")).isNull();
        assertThat(r.get("ioFlag")).isEqualTo("IN");
        assertThat(r).containsKeys("mesColId", "oldColId", "ruleVer");

        Map<String, Object> o = outList.get(0);
        assertThat(o.get("ioFlag")).isEqualTo("OUT");
        assertThat(o.get("colPrecLen")).isEqualTo(4);
    }

    @Test
    @DisplayName("search — pRuleId 공란 → null 위임 (전체 조회, As-Is if skip)")
    void search_공란() {
        when(repository.searchRuleColList(null, "IN")).thenReturn(List.of());
        when(repository.searchRuleColList(null, "OUT")).thenReturn(List.of());

        Map<String, Object> out = service.search(req(""));

        assertThat(out.get("cnt")).isEqualTo(0);
        verify(repository).searchRuleColList(null, "IN");
        verify(repository).searchRuleColList(null, "OUT");
    }

    // ──────────────────────────────── save ────────────────────────────────

    @Test
    @DisplayName("save — delete-all 후 IN→OUT 재삽입: COL_SEQ 통합 순번(BR-004), RULE_VER 공란→1(BR-005), IO_FLAG 그리드 확정")
    void save_정상() {
        when(repository.searchRuleColList(anyString(), anyString())).thenReturn(List.of());   // 재조회

        Map<String, Object> out = service.save(req("USD"),
                List.of(row("기준일자", "BASE_DT", "N", "DATE", "8", "", ""),          // ruleVer 공란
                        row("통화코드", "CURR_CD", "Y", "VARCHAR2", "3", "", "1")),
                List.of(row("적용환율", "APPLY_RATE", "N", "NUMBER", "10", "4", "1")));

        verify(repository).deleteByRuleId("USD");   // BR-003 (반환값 미검증 — BR-015)

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<MasterRuleColList>> cap = ArgumentCaptor.forClass(List.class);
        verify(repository).saveAll(cap.capture());
        List<MasterRuleColList> saved = cap.getValue();
        assertThat(saved).hasSize(3);
        // COL_SEQ = IN 1,2 → OUT 3 (통합 단일 순번 — As-Is java:51/76)
        assertThat(saved.get(0).getId()).isEqualTo(new MasterRuleColListId("USD", 1));
        assertThat(saved.get(1).getId()).isEqualTo(new MasterRuleColListId("USD", 2));
        assertThat(saved.get(2).getId()).isEqualTo(new MasterRuleColListId("USD", 3));
        assertThat(saved.get(0).getIoFlag()).isEqualTo("IN");
        assertThat(saved.get(2).getIoFlag()).isEqualTo("OUT");
        // RULE_VER 공란→1 (BR-005)
        assertThat(saved.get(0).getRuleVer()).isEqualByComparingTo(BigDecimal.ONE);
        // 정수 변환 (BR-009)
        assertThat(saved.get(2).getColLen()).isEqualTo(10);
        assertThat(saved.get(2).getColPrecLen()).isEqualTo(4);

        assertThat(out.get("cnt_save")).isEqualTo(3);
        assertThat(out).containsKeys("ds_GetRuleColInList", "ds_GetRuleColOutList", "cnt");   // 재조회 동봉
    }

    @Test
    @DisplayName("save — pRuleId 공란이면 첫 행 ruleId 사용 (As-Is ds_grdIn[0].RULE_ID)")
    void save_첫행_ruleId() {
        when(repository.searchRuleColList(anyString(), anyString())).thenReturn(List.of());

        Map<String, Object> inRow = row("기준일자", "BASE_DT", "N", "DATE", "8", "", "1");
        inRow.put("ruleId", "EUR");
        service.save(req(""), List.of(inRow), List.of());

        verify(repository).deleteByRuleId("EUR");
    }

    @Test
    @DisplayName("save — ruleId 미확정: REQUIRED_VALUE (BR-012, delete/insert 미실행)")
    void save_ruleId_없음() {
        assertThatThrownBy(() -> service.save(req(""), List.of(), List.of()))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE));

        verify(repository, never()).deleteByRuleId(anyString());
        verify(repository, never()).saveAll(anyList());
    }

    @Test
    @DisplayName("save — 필수값 누락(COL_NM 공란): REQUIRED_VALUE MSG-001, delete 미실행 (검증 선행)")
    void save_필수값_누락() {
        assertThatThrownBy(() -> service.save(req("USD"),
                List.of(row("", "BASE_DT", "N", "DATE", "8", "", "1")), List.of()))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> {
                    assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE);
                    assertThat(e.getMessage()).contains("한글항목명을 입력해 주십시오");   // MSG-001
                });

        verify(repository, never()).deleteByRuleId(anyString());
        verify(repository, never()).saveAll(anyList());
    }

    @Test
    @DisplayName("save — OUT 행 필수값 누락(COL_TYPE 공란): MSG-004 (OUT 5종 검증)")
    void save_OUT_필수값_누락() {
        assertThatThrownBy(() -> service.save(req("USD"),
                List.of(),
                List.of(row("적용환율", "APPLY_RATE", "N", "", "10", "4", "1"))))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(e.getMessage()).contains("유형을 선택해 주십시오"));   // MSG-004

        verify(repository, never()).deleteByRuleId(anyString());
    }

    @Test
    @DisplayName("save — 총길이 비정수: INVALID_VALUE (BR-009)")
    void save_비정수_길이() {
        assertThatThrownBy(() -> service.save(req("USD"),
                List.of(row("기준일자", "BASE_DT", "N", "DATE", "8x", "", "1")), List.of()))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));

        verify(repository, never()).saveAll(anyList());
    }

    // ──────────────────────────────── builders ────────────────────────────────

    private static MasterRuleFrameSearchRequest req(String pRuleId) {
        var r = new MasterRuleFrameSearchRequest();
        r.setPRuleId(pRuleId);
        return r;
    }

    /** 저장 행 (FE ds_grdIn/ds_grdOut row — camelCase, 값은 문자열로 수신되는 케이스 재현). */
    private static Map<String, Object> row(String colNm, String colId, String masterCodeDiv,
                                           String colType, String colLen, String colPrecLen, String ruleVer) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("colNm", colNm);
        m.put("colId", colId);
        m.put("masterCodeDiv", masterCodeDiv);
        m.put("colType", colType);
        m.put("colLen", colLen);
        m.put("colPrecLen", colPrecLen);
        m.put("ruleVer", ruleVer);
        return m;
    }

    private static MasterRuleColList entity(String ruleId, int colSeq, String colNm, String colId,
                                            String masterCodeDiv, String colType, Integer colLen,
                                            Integer colPrecLen, String ioFlag) {
        MasterRuleColList e = new MasterRuleColList();
        e.setId(new MasterRuleColListId(ruleId, colSeq));
        e.setRuleVer(BigDecimal.ONE);
        e.setColNm(colNm);
        e.setColId(colId);
        e.setMasterCodeDiv(masterCodeDiv);
        e.setColType(colType);
        e.setColLen(colLen);
        e.setColPrecLen(colPrecLen);
        e.setIoFlag(ioFlag);
        return e;
    }
}
