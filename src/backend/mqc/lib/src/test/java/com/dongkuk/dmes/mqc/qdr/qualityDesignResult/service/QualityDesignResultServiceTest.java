package com.dongkuk.dmes.mqc.qdr.qualityDesignResult.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mqc.qcd.order.pipeline.DesignPipeline;
import com.dongkuk.dmes.mqc.qcd.order.repository.OrderLookup;
import com.dongkuk.dmes.mqc.qdr.qualityDesignResult.domain.DesignHistory;
import com.dongkuk.dmes.mqc.qdr.qualityDesignResult.domain.DesignRequest;
import com.dongkuk.dmes.mqc.qdr.qualityDesignResult.domain.DesignResult;
import com.dongkuk.dmes.mqc.qdr.qualityDesignResult.domain.DesignStatus;
import com.dongkuk.dmes.mqc.qdr.qualityDesignResult.dto.QualityDesignResultKeyRequest;
import com.dongkuk.dmes.mqc.qdr.qualityDesignResult.dto.QualityDesignResultSearchRequest;
import com.dongkuk.dmes.mqc.qdr.qualityDesignResult.repository.DesignHistoryRepository;
import com.dongkuk.dmes.mqc.qdr.qualityDesignResult.repository.DesignRequestRepository;
import com.dongkuk.dmes.mqc.qdr.qualityDesignResult.repository.DesignResultRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class QualityDesignResultServiceTest {

    static final Clock CLOCK = Clock.fixed(Instant.parse("2026-11-25T01:00:00Z"), ZoneId.of("Asia/Seoul"));

    @Mock OrderLookup orders;
    @Mock DesignRequestRepository requests;
    @Mock DesignResultRepository results;
    @Mock DesignHistoryRepository histories;
    @Mock DesignPipeline pipeline;
    QualityDesignResultService service;

    final Map<String, String> order = new LinkedHashMap<>();

    @BeforeEach
    void setUp() {
        service = new QualityDesignResultService(orders, requests, results, histories, pipeline, CLOCK);
        order.put("ORD_REQ_NO", "D260831021"); order.put("ORD_REQ_LN", "010"); order.put("PRD_NM_CD", "G");
        order.put("SPC_AVR", "KSG-SGC340"); order.put("FNL_CUS_CD", "320104"); order.put("FNL_CUS_NM", "수요가 B");
        order.put("ORD_EXC_THK", "0.440"); order.put("ORD_EXC_WTH", "1225.0"); order.put("MAT_CD", "BA"); order.put("REQ_DT", "20260831");
        given(orders.one("D260831021", "010")).willReturn(Optional.of(order));
        given(orders.all()).willReturn(List.of(order));
        given(pipeline.run(anyMap(), any(), anyString())).willAnswer(inv -> fakeRun((String) inv.getArgument(2)));
    }

    static Map<String, Object> fakeRun(String statusLabel) {
        Map<String, Object> design = new LinkedHashMap<>();
        List<Object> common = new ArrayList<>();
        common.add(new ArrayList<>(List.of("품질설계상태", statusLabel, "b")));
        design.put("common", common);
        design.put("cgl", Map.of("lines", List.of(List.of("적정", "H34 - 2 종", "L", "1.8", "1.8", "2.0", "1225")),
                "pltcm", List.of(List.of("X-Ray Set두께값", "0.420"), List.of("폭목표값(주공정)", "1225"))));
        design.put("route", Map.of("no", "1P-83", "rows", List.of()));
        Map<String, Object> run = new LinkedHashMap<>();
        run.put("design", design);
        run.put("mainLine", "3CGL");
        run.put("summary", Map.of("verdict", "WARN", "errors", 0, "warnings", 1));
        run.put("stages", List.of());
        return run;
    }

    private static QualityDesignResultKeyRequest key(String k) {
        QualityDesignResultKeyRequest r = new QualityDesignResultKeyRequest();
        r.setOrderKey(k);
        return r;
    }

    @Test
    void view_without_stored_result_returns_preview_and_saves_nothing() {
        given(requests.findById("D260831021-010")).willReturn(Optional.empty());
        given(results.findById("D260831021-010")).willReturn(Optional.empty());
        Map<String, Object> out = service.view(key("D260831021-010"));
        assertThat(out).containsEntry("status", "WAIT").containsEntry("stored", false);
        verify(results, never()).save(any());
    }

    @Test
    void calculate_moves_wait_to_ing_and_stores_result_with_history() {
        DesignRequest r = DesignRequest.of("D260831021", "010", DesignStatus.WAIT);
        given(requests.findById("D260831021-010")).willReturn(Optional.of(r));
        given(results.findById("D260831021-010")).willReturn(Optional.empty());
        Map<String, Object> out = service.calculate(key("D260831021-010"));
        assertThat(r.getDsnStat()).isEqualTo(DesignStatus.ING);
        ArgumentCaptor<DesignResult> saved = ArgumentCaptor.forClass(DesignResult.class);
        verify(results).save(saved.capture());
        assertThat(saved.getValue().getVerdict()).isEqualTo("WARN");
        assertThat(saved.getValue().getRawMatCd()).isEqualTo("H34");
        assertThat(saved.getValue().getSetThk()).isEqualByComparingTo("0.420");
        assertThat(saved.getValue().getResultJson()).contains("3CGL");
        ArgumentCaptor<DesignHistory> h = ArgumentCaptor.forClass(DesignHistory.class);
        verify(histories).save(h.capture());
        assertThat(h.getValue().getActionCd()).isEqualTo("CALC");
        assertThat(out).containsEntry("status", "ING");
    }

    @Test
    void confirmed_and_held_designs_are_not_recalculated() {
        given(requests.findById("D260831021-010")).willReturn(Optional.of(DesignRequest.of("D260831021", "010", DesignStatus.CONF)));
        assertThatThrownBy(() -> service.calculate(key("D260831021-010"))).isInstanceOf(BusinessException.class).hasMessageContaining("확정");
        given(requests.findById("D260831021-010")).willReturn(Optional.of(DesignRequest.of("D260831021", "010", DesignStatus.HOLD)));
        assertThatThrownBy(() -> service.confirm(key("D260831021-010"))).isInstanceOf(BusinessException.class).hasMessageContaining("보류");
    }

    @Test
    void confirm_calculates_first_when_nothing_stored() {
        DesignRequest r = DesignRequest.of("D260831021", "010", DesignStatus.ING);
        given(requests.findById("D260831021-010")).willReturn(Optional.of(r));
        given(results.existsById("D260831021-010")).willReturn(false);
        given(results.findById("D260831021-010")).willReturn(Optional.empty());
        service.confirm(key("D260831021-010"));
        assertThat(r.getDsnStat()).isEqualTo(DesignStatus.CONF);
        verify(results).save(any());
    }

    @Test
    void cancel_toggles_hold_and_restores_previous_status() {
        DesignRequest r = DesignRequest.of("D260831021", "010", DesignStatus.ING);
        given(requests.findById("D260831021-010")).willReturn(Optional.of(r));
        given(results.findById("D260831021-010")).willReturn(Optional.empty());
        service.cancel(key("D260831021-010"));
        assertThat(r.getDsnStat()).isEqualTo(DesignStatus.HOLD);
        Map<String, Object> out = service.cancel(key("D260831021-010"));
        assertThat(r.getDsnStat()).isEqualTo(DesignStatus.ING);
        assertThat(out).containsEntry("status", "ING");
    }

    @Test
    void search_filters_dates_and_counts_statuses() {
        given(requests.findAll()).willReturn(List.of(DesignRequest.of("D260831021", "010", DesignStatus.HOLD)));
        given(results.findAll()).willReturn(List.of());
        QualityDesignResultSearchRequest req = new QualityDesignResultSearchRequest();
        req.setFromDt("2026-08-30");
        req.setToDt("2026-08-31");
        req.setStatus("ING");
        Map<String, Object> out = service.search(req);
        assertThat((List<?>) out.get("rows")).isEmpty();
        assertThat((Map<String, Object>) out.get("counts")).containsEntry("HOLD", 1).containsEntry("ING", 0);
        req.setFromDt("2026-09-01");
        req.setToDt("2026-08-31");
        assertThatThrownBy(() -> service.search(req)).isInstanceOf(BusinessException.class);
    }
}
