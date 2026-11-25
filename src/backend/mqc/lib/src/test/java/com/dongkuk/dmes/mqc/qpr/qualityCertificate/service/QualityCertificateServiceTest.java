package com.dongkuk.dmes.mqc.qpr.qualityCertificate.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.JudgmentStatus;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.service.CoilFixtures;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.service.CoilLookup;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.service.CoilSnapshot;
import com.dongkuk.dmes.mqc.qpr.common.OutputHistories;
import com.dongkuk.dmes.mqc.qpr.common.OutputHistory;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain.QcStatus;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain.QualityCertificate;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain.QualityCertificateCoil;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.dto.QualityCertificateKeyRequest;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.dto.QualityCertificateSaveRequest;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.repository.QualityCertificateCoilRepository;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.repository.QualityCertificateRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class QualityCertificateServiceTest {

    @Mock QualityCertificateRepository certs;
    @Mock QualityCertificateCoilRepository certCoils;
    @Mock CoilLookup lookup;
    @Mock OutputHistories histories;

    QualityCertificateService service;

    @BeforeEach
    void setUp() {
        service = new QualityCertificateService(certs, certCoils, lookup, histories, CoilFixtures.CLOCK);
    }

    private void link(String qcNo, CoilSnapshot... snaps) {
        Map<String, CoilSnapshot> m = new LinkedHashMap<>();
        List<QualityCertificateCoil> links = new java.util.ArrayList<>();
        int seq = 1;
        for (CoilSnapshot s : snaps) {
            m.put(s.coilNo(), s);
            links.add(QualityCertificateCoil.of(qcNo, s.coilNo(), seq++));
        }
        given(certCoils.findByQcNoOrderBySeqAsc(qcNo)).willReturn(links);
        given(lookup.load(anyCollection())).willReturn(m);
    }

    private static QualityCertificateKeyRequest key(String qcNo, String reason) {
        QualityCertificateKeyRequest r = new QualityCertificateKeyRequest();
        r.setQcNo(qcNo);
        r.setReason(reason);
        return r;
    }

    @Test
    @DisplayName("issue: 실린 코일이 모두 합격이면 초안을 발행하고 이력을 남긴다")
    void issue() {
        QualityCertificate q = QualityCertificate.of("QC-1", "D1-010", QcStatus.DRAFT);
        given(certs.findById("QC-1")).willReturn(Optional.of(q));
        link("QC-1", CoilFixtures.snapshot("C1", "D1-010", JudgmentStatus.PASS, JudgmentStatus.PASS));

        Map<String, Object> out = service.issue(key("QC-1", null));

        assertThat(q.getStatCd()).isEqualTo(QcStatus.ISSUED);
        assertThat(q.getIssueAt()).isNotNull();
        verify(histories).record(eq(OutputHistory.QC), eq("QC-1"), eq(1), eq(OutputHistory.ISSUE), eq("DRAFT"), eq("ISSUED"), any(), any(), any());
        @SuppressWarnings("unchecked")
        Map<String, Object> actions = (Map<String, Object>) out.get("actions");
        assertThat(actions.get("canReissue")).isEqualTo(true);
    }

    @Test
    @DisplayName("issue: 합격하지 않은 코일이 있으면 발행하지 않는다")
    void issueBlocked() {
        QualityCertificate q = QualityCertificate.of("QC-1", "D1-010", QcStatus.DRAFT);
        given(certs.findById("QC-1")).willReturn(Optional.of(q));
        link("QC-1", CoilFixtures.snapshot("C1", "D1-010", JudgmentStatus.PASS, JudgmentStatus.PASS),
                CoilFixtures.snapshot("C2", "D1-010", JudgmentStatus.HOLD, JudgmentStatus.HOLD));

        assertThatThrownBy(() -> service.issue(key("QC-1", null))).isInstanceOf(BusinessException.class).hasMessageContaining("C2(보류)");
        assertThat(q.getStatCd()).isEqualTo(QcStatus.DRAFT);
        verify(certs, never()).save(any());
    }

    @Test
    @DisplayName("reissue: 사유가 있어야 하고 판이 1 오른다. cancel 은 회수로 바꾼다")
    void reissueAndCancel() {
        QualityCertificate q = QualityCertificate.of("QC-1", "D1-010", QcStatus.ISSUED);
        given(certs.findById("QC-1")).willReturn(Optional.of(q));
        link("QC-1", CoilFixtures.snapshot("C1", "D1-010", JudgmentStatus.PASS, JudgmentStatus.PASS));

        assertThatThrownBy(() -> service.reissue(key("QC-1", " "))).isInstanceOf(BusinessException.class);
        service.reissue(key("QC-1", "품명 정정"));
        assertThat(q.getStatCd()).isEqualTo(QcStatus.REISSUED);
        assertThat(q.getDocRev()).isEqualTo(2);

        service.cancel(key("QC-1", "수요가 반품"));
        assertThat(q.getStatCd()).isEqualTo(QcStatus.RECALLED);
        assertThatThrownBy(() -> service.cancel(key("QC-1", "x"))).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("save: 다른 주문의 코일은 실을 수 없고, 같은 주문이면 QC-yyMM-0001 로 초안을 만든다")
    void save() {
        Map<String, CoilSnapshot> snaps = new LinkedHashMap<>();
        snaps.put("C1", CoilFixtures.snapshot("C1", "D1-010", JudgmentStatus.WAIT, JudgmentStatus.HOLD));
        snaps.put("C2", CoilFixtures.snapshot("C2", "D2-010", JudgmentStatus.PASS, JudgmentStatus.PASS));
        given(lookup.load(anyCollection())).willReturn(snaps);
        QualityCertificateSaveRequest req = new QualityCertificateSaveRequest();
        req.setOrdNo("D1-010");
        req.setCoilNos("C1,C2");
        assertThatThrownBy(() -> service.save(req)).isInstanceOf(BusinessException.class).hasMessageContaining("C2(D2-010)");

        snaps.remove("C2");
        req.setCoilNos("C1");
        given(certCoils.findByCoilNoIn(anyCollection())).willReturn(List.of());
        given(certs.findTopByQcNoStartingWithOrderByQcNoDesc("QC-2609-")).willReturn(Optional.empty());
        given(certs.findById("QC-2609-0001")).willReturn(Optional.of(QualityCertificate.of("QC-2609-0001", "D1-010", QcStatus.DRAFT)));
        given(certCoils.findByQcNoOrderBySeqAsc("QC-2609-0001")).willReturn(List.of(QualityCertificateCoil.of("QC-2609-0001", "C1", 1)));
        service.save(req);
        verify(certs).save(org.mockito.ArgumentMatchers.argThat(q -> "QC-2609-0001".equals(q.getQcNo()) && q.getStatCd() == QcStatus.DRAFT));
    }

    @Test
    @DisplayName("guarantee: 대표값은 코일 검사값의 최솟값, YP 는 범위다")
    void guarantee() {
        CoilSnapshot a = CoilFixtures.snapshot("C1", "D1-010", JudgmentStatus.PASS, JudgmentStatus.PASS);
        CoilSnapshot b = new CoilSnapshot(CoilFixtures.coil("C2", "D1-010"), null,
                CoilFixtures.items("C2", "96", "A", "268", "350", "31", "+0.001"));
        List<Map<String, Object>> rows = QualityCertificateService.guarantee(List.of(a, b));
        assertThat(rows.get(0).get("value")).isEqualTo("350");
        assertThat(rows.get(1).get("value")).isEqualTo("268~312");
        assertThat(rows.get(3).get("value")).isEqualTo("96");
    }
}
