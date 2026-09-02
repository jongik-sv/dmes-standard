package com.dongkuk.dmes.mcm.cmb.masterRuleFrameColListPopup.service;

import com.dongkuk.dmes.mcm.cmb.masterRuleFrameColListPopup.dto.MasterRuleFrameColListPopupSearchRequest;
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
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link MasterRuleFrameColListPopupService} 단위 테스트 — mcm-core Mockito 패턴 (형제 화면 선례 동일).
 *
 * <p>검증: search(메타 9 컬럼 camelCase + ds_grdRuleCol 응답키 + 파라미터 가드) /
 * save(delete-all→insert 재채번 + RULE_VER=1 고정 + OLD_COL_ID·MES_COL_ID 미설정(As-Is 주석 보존) +
 * savedCount 만 반환(Q-002 — 재조회 없음) + V-003~007 서버 검증).
 */
@ExtendWith(MockitoExtension.class)
class MasterRuleFrameColListPopupServiceTest {

    @Mock MasterRuleColListRepository repository;

    @InjectMocks MasterRuleFrameColListPopupService service;

    // ──────────────────────────────── search ────────────────────────────────

    @Test
    @DisplayName("search — 메타 9 컬럼 camelCase 매핑 + ds_grdRuleCol 응답키 (As-Is resultKey 보존)")
    void search_정상() {
        // {ruleVer, ruleId, colId, colNm, colType, colLen, colPrecLen, ioFlag, masterCodeDiv}
        when(repository.searchSourceTableColumns("USD", "TB_MCA_USD")).thenReturn(List.<Object[]>of(
                new Object[]{"1", "USD", "BASE_DT", "기준일자", "DATE", null, null, "OUT", "N"},
                new Object[]{"1", "USD", "CURR_CD", "통화코드", "VARCHAR2", 3, null, "OUT", "N"}));

        Map<String, Object> out = service.search(req("USD", "TB_MCA_USD"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> list = (List<Map<String, Object>>) out.get("ds_grdRuleCol");
        assertThat(list).hasSize(2);
        Map<String, Object> r = list.get(0);
        assertThat(r.get("ruleVer")).isEqualTo("1");            // '1' 고정 (As-Is Mapper:9)
        assertThat(r.get("ruleId")).isEqualTo("USD");
        assertThat(r.get("colId")).isEqualTo("BASE_DT");
        assertThat(r.get("colNm")).isEqualTo("기준일자");        // MS_Description (C-001)
        assertThat(r.get("ioFlag")).isEqualTo("OUT");           // 기본 OUT (As-Is Mapper:16)
        assertThat(r.get("masterCodeDiv")).isEqualTo("N");      // 기본 N (As-Is Mapper:17)
        assertThat(list.get(1).get("colType")).isEqualTo("VARCHAR2");   // varchar→VARCHAR2 (C-002)
        assertThat(out.get("cnt")).isEqualTo(2);
    }

    @Test
    @DisplayName("search — pRuleId/pTable 공란: REQUIRED_VALUE (부모 가드 BR-013 서버 방어)")
    void search_파라미터_가드() {
        assertThatThrownBy(() -> service.search(req("", "TB_MCA_USD")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE));
        assertThatThrownBy(() -> service.search(req("USD", "")))
                .isInstanceOf(BusinessException.class);

        verify(repository, never()).searchSourceTableColumns(anyString(), anyString());
    }

    // ──────────────────────────────── save ────────────────────────────────

    @Test
    @DisplayName("save — delete-all 후 재삽입: COL_SEQ 재채번·RULE_VER=1 고정·OLD/MES 미설정, savedCount 만 반환(재조회 없음)")
    void save_정상() {
        Map<String, Object> out = service.save(req("USD", null), List.of(
                row("기준일자", "BASE_DT", "N", "DATE", "8", "", "IN"),
                row("적용환율", "APPLY_RATE", "N", "NUMBER", "10", "4", "OUT")));

        verify(repository).deleteByRuleId("USD");   // As-Is Java:35

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<MasterRuleColList>> cap = ArgumentCaptor.forClass(List.class);
        verify(repository).saveAll(cap.capture());
        List<MasterRuleColList> saved = cap.getValue();
        assertThat(saved).hasSize(2);
        assertThat(saved.get(0).getId()).isEqualTo(new MasterRuleColListId("USD", 1));   // 재채번
        assertThat(saved.get(1).getId()).isEqualTo(new MasterRuleColListId("USD", 2));
        assertThat(saved.get(0).getRuleVer()).isEqualByComparingTo(BigDecimal.ONE);      // "1" 고정
        assertThat(saved.get(0).getIoFlag()).isEqualTo("IN");
        assertThat(saved.get(0).getOldColId()).isNull();   // As-Is 주석 보존 (INSERT 비포함)
        assertThat(saved.get(0).getMesColId()).isNull();   // As-Is 주석 보존
        assertThat(saved.get(1).getColPrecLen()).isEqualTo(4);

        assertThat(out.get("savedCount")).isEqualTo(2);    // Q-002 — { savedCount } 표준화
        assertThat(out).doesNotContainKey("ds_grdRuleCol");   // 재조회 없음 (As-Is save→End 직행)
        verify(repository, never()).searchSourceTableColumns(anyString(), anyString());
    }

    @Test
    @DisplayName("save — ruleId 공란: REQUIRED_VALUE (delete/insert 미실행)")
    void save_ruleId_가드() {
        assertThatThrownBy(() -> service.save(req("", null), List.of()))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE));

        verify(repository, never()).deleteByRuleId(anyString());
        verify(repository, never()).saveAll(anyList());
    }

    @Test
    @DisplayName("save — 필수값 누락(COL_TYPE): V-006 메시지, delete 미실행 (검증 선행)")
    void save_필수값_누락() {
        assertThatThrownBy(() -> service.save(req("USD", null), List.of(
                row("기준일자", "BASE_DT", "N", "", "8", "", "IN"))))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> {
                    assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE);
                    assertThat(e.getMessage()).contains("유형을 선택해 주십시오");   // V-006
                });

        verify(repository, never()).deleteByRuleId(anyString());
    }

    // ──────────────────────────────── builders ────────────────────────────────

    private static MasterRuleFrameColListPopupSearchRequest req(String ruleId, String table) {
        var r = new MasterRuleFrameColListPopupSearchRequest();
        r.setPRuleId(ruleId);
        r.setPTable(table);
        return r;
    }

    private static Map<String, Object> row(String colNm, String colId, String masterCodeDiv,
                                           String colType, String colLen, String colPrecLen, String ioFlag) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("colNm", colNm);
        m.put("colId", colId);
        m.put("masterCodeDiv", masterCodeDiv);
        m.put("colType", colType);
        m.put("colLen", colLen);
        m.put("colPrecLen", colPrecLen);
        m.put("ioFlag", ioFlag);
        return m;
    }
}
