package com.dongkuk.dmes.mqc.qjd.qualityJudgment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.CoilJudgment;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.InspectionItem;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.ItemResult;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.JudgmentHistory;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.JudgmentStatus;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.dto.QualityJudgmentConfirmRequest;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.dto.QualityJudgmentJudgeRequest;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.repository.CoilJudgmentRepository;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.repository.CoilRepository;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.repository.InspectionItemRepository;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.repository.JudgmentHistoryRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class QualityJudgmentServiceTest {

    @Mock CoilRepository coils;
    @Mock CoilJudgmentRepository judgments;
    @Mock InspectionItemRepository items;
    @Mock JudgmentHistoryRepository histories;
    @Mock CoilLookup lookup;

    QualityJudgmentService service;

    @BeforeEach
    void setUp() {
        service = new QualityJudgmentService(coils, judgments, items, histories, lookup, CoilFixtures.CLOCK);
    }

    private void stubDetail(String coilNo, CoilJudgment j, List<InspectionItem> list) {
        given(lookup.one(coilNo)).willReturn(Optional.of(new CoilSnapshot(CoilFixtures.coil(coilNo, "D1-010"), j, list)));
        given(lookup.chemistry(any())).willReturn(List.of());
        given(histories.findByCoilNoOrderByActAtDescHistNoDesc(coilNo)).willReturn(List.of());
    }

    @Test
    @DisplayName("judge: 미검 YP 에 값을 넣으면 항목이 합으로 바뀌고 시스템 제안이 합격이 된다. 확정 상태는 판정대기 그대로다")
    void judgeRecordsValueAndSuggests() {
        String no = "C1";
        List<InspectionItem> list = CoilFixtures.items(no, "96", "A", null, "398", "29", "+0.008");
        CoilJudgment j = CoilJudgment.of(no, JudgmentStatus.WAIT, JudgmentStatus.HOLD);
        given(coils.existsById(no)).willReturn(true);
        given(judgments.findById(no)).willReturn(Optional.of(j));
        given(items.findByCoilNoOrderBySeqAsc(no)).willReturn(list);
        stubDetail(no, j, list);

        QualityJudgmentJudgeRequest req = new QualityJudgmentJudgeRequest();
        req.setCoilNo(no);
        req.setValuesJson("{\"YP\":\"268\"}");
        Map<String, Object> out = service.judge(req);

        assertThat(list.get(2).getMeasVal()).isEqualTo("268");
        assertThat(list.get(2).getRsltCd()).isEqualTo(ItemResult.PASS);
        assertThat(j.getSuggStat()).isEqualTo(JudgmentStatus.PASS);
        assertThat(j.getJdgStat()).isEqualTo(JudgmentStatus.WAIT);
        @SuppressWarnings("unchecked")
        Map<String, Object> judgment = (Map<String, Object>) out.get("judgment");
        assertThat(judgment.get("suggStatus")).isEqualTo("PASS");
        ArgumentCaptor<JudgmentHistory> h = ArgumentCaptor.forClass(JudgmentHistory.class);
        verify(histories).save(h.capture());
        assertThat(h.getValue().getActCd()).isEqualTo(JudgmentHistory.JUDGE);
        assertThat(h.getValue().getNote()).contains("YP 268");
    }

    @Test
    @DisplayName("judge: 확정(합격) 코일은 다시 판정하지 않는다")
    void judgeRejectsClosed() {
        given(coils.existsById("C1")).willReturn(true);
        given(judgments.findById("C1")).willReturn(Optional.of(CoilJudgment.of("C1", JudgmentStatus.PASS, JudgmentStatus.PASS)));
        QualityJudgmentJudgeRequest req = new QualityJudgmentJudgeRequest();
        req.setCoilNo("C1");
        assertThatThrownBy(() -> service.judge(req)).isInstanceOf(BusinessException.class).hasMessageContaining("판정대기·보류");
    }

    @Test
    @DisplayName("judge: 숫자 항목에 글자를 넣으면 거절한다")
    void judgeRejectsBadValue() {
        given(coils.existsById("C1")).willReturn(true);
        given(judgments.findById("C1")).willReturn(Optional.of(CoilJudgment.of("C1", JudgmentStatus.WAIT, null)));
        given(items.findByCoilNoOrderBySeqAsc("C1")).willReturn(CoilFixtures.passingItems("C1"));
        QualityJudgmentJudgeRequest req = new QualityJudgmentJudgeRequest();
        req.setCoilNo("C1");
        req.setValuesJson("{\"TS\":\"abc\"}");
        assertThatThrownBy(() -> service.judge(req)).isInstanceOf(BusinessException.class).hasMessageContaining("TS");
    }

    @Test
    @DisplayName("confirm: 제안과 같은 합격은 사유 없이 확정하고 이력을 남긴다")
    void confirmPass() {
        CoilSnapshot s = CoilFixtures.snapshot("C1", "D1-010", JudgmentStatus.WAIT, JudgmentStatus.PASS);
        Map<String, CoilSnapshot> snaps = new LinkedHashMap<>();
        snaps.put("C1", s);
        given(lookup.load(anyCollection())).willReturn(snaps);
        stubDetail("C1", s.judgment(), s.items());

        QualityJudgmentConfirmRequest req = new QualityJudgmentConfirmRequest();
        req.setCoilNos("C1");
        req.setStatus("PASS");
        Map<String, Object> out = service.confirm(req);

        assertThat(out.get("count")).isEqualTo(1);
        assertThat(s.judgment().getJdgStat()).isEqualTo(JudgmentStatus.PASS);
        assertThat(s.judgment().getDcsnBy()).isEqualTo("system");
        verify(histories).save(any(JudgmentHistory.class));
    }

    @Test
    @DisplayName("confirm: 제안(불합격)과 다르게 합격 처리하려면 사유가 있어야 하고, 없으면 아무것도 바꾸지 않는다")
    void confirmOverrideNeedsNote() {
        CoilSnapshot ok = CoilFixtures.snapshot("C1", "D1-010", JudgmentStatus.WAIT, JudgmentStatus.PASS);
        CoilSnapshot bad = CoilFixtures.snapshot("C2", "D1-010", JudgmentStatus.WAIT, JudgmentStatus.FAIL);
        Map<String, CoilSnapshot> snaps = new LinkedHashMap<>();
        snaps.put("C1", ok);
        snaps.put("C2", bad);
        given(lookup.load(anyCollection())).willReturn(snaps);

        QualityJudgmentConfirmRequest req = new QualityJudgmentConfirmRequest();
        req.setCoilNos("C1,C2");
        req.setStatus("PASS");
        assertThatThrownBy(() -> service.confirm(req)).isInstanceOf(BusinessException.class).hasMessageContaining("C2");
        assertThat(ok.judgment().getJdgStat()).isEqualTo(JudgmentStatus.WAIT);
        verify(judgments, never()).save(any());

        req.setNote("특채 — 고객 승인");
        service.confirm(req);
        assertThat(bad.judgment().getJdgStat()).isEqualTo(JudgmentStatus.PASS);
        assertThat(bad.judgment().getNote()).isEqualTo("특채 — 고객 승인");
    }

    @Test
    @DisplayName("confirm: 이미 확정된 코일과 판정대기 상태 지정은 거절한다")
    void confirmRejects() {
        Map<String, CoilSnapshot> snaps = new LinkedHashMap<>();
        snaps.put("C1", CoilFixtures.snapshot("C1", "D1-010", JudgmentStatus.FAIL, JudgmentStatus.FAIL));
        given(lookup.load(anyCollection())).willReturn(snaps);
        QualityJudgmentConfirmRequest req = new QualityJudgmentConfirmRequest();
        req.setCoilNos("C1");
        req.setStatus("HOLD");
        req.setNote("x");
        assertThatThrownBy(() -> service.confirm(req)).isInstanceOf(BusinessException.class).hasMessageContaining("이미 확정");
        req.setStatus("WAIT");
        assertThatThrownBy(() -> service.confirm(req)).isInstanceOf(BusinessException.class);
    }
}
