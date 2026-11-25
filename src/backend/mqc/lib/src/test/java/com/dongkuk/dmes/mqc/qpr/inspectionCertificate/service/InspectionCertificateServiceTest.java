package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.JudgmentStatus;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.service.CoilFixtures;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.service.CoilLookup;
import com.dongkuk.dmes.mqc.qpr.common.OutputHistories;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.InspectionCertificate;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcStatus;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.dto.InspectionCertificateKeyRequest;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.dto.InspectionCertificateSaveRequest;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository.InspectionCertificateRepository;
import java.math.BigDecimal;
import java.util.List;
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
class InspectionCertificateServiceTest {

    @Mock InspectionCertificateRepository certs;
    @Mock CoilLookup lookup;
    @Mock OutputHistories histories;

    InspectionCertificateService service;

    @BeforeEach
    void setUp() {
        service = new InspectionCertificateService(certs, lookup, histories, CoilFixtures.CLOCK);
    }

    @Test
    @DisplayName("issue: 일괄 발행에서 합격이 아닌 코일이 하나라도 있으면 아무것도 발행하지 않는다")
    void issueBatchBlocked() {
        InspectionCertificate a = InspectionCertificate.of("MTC-1", "C1", MtcStatus.REVIEW);
        InspectionCertificate b = InspectionCertificate.of("MTC-2", "C2", MtcStatus.REVIEW);
        given(certs.findById("MTC-1")).willReturn(Optional.of(a));
        given(certs.findById("MTC-2")).willReturn(Optional.of(b));
        given(lookup.one("C1")).willReturn(Optional.of(CoilFixtures.snapshot("C1", "D1-010", JudgmentStatus.PASS, JudgmentStatus.PASS)));
        given(lookup.one("C2")).willReturn(Optional.of(CoilFixtures.snapshot("C2", "D1-010", JudgmentStatus.WAIT, JudgmentStatus.HOLD)));
        InspectionCertificateKeyRequest req = new InspectionCertificateKeyRequest();
        req.setMtcNos("MTC-1,MTC-2");

        assertThatThrownBy(() -> service.issue(req)).isInstanceOf(BusinessException.class).hasMessageContaining("MTC-2");
        assertThat(a.getStatCd()).isEqualTo(MtcStatus.REVIEW);
        verify(certs, never()).save(any());
    }

    @Test
    @DisplayName("issue: 코일이 합격이면 발행하고 YP·TS·EL·도금량을 고정한다")
    void issueFixesValues() {
        InspectionCertificate a = InspectionCertificate.of("MTC-1", "C1", MtcStatus.HOLD);
        given(certs.findById("MTC-1")).willReturn(Optional.of(a));
        given(lookup.one("C1")).willReturn(Optional.of(CoilFixtures.snapshot("C1", "D1-010", JudgmentStatus.PASS, JudgmentStatus.PASS)));
        given(lookup.chemistry(any())).willReturn(List.of());
        InspectionCertificateKeyRequest req = new InspectionCertificateKeyRequest();
        req.setMtcNo("MTC-1");

        service.issue(req);

        assertThat(a.getStatCd()).isEqualTo(MtcStatus.ISSUED);
        assertThat(a.getYpVal()).isEqualByComparingTo(new BigDecimal("312"));
        assertThat(a.getTsVal()).isEqualByComparingTo(new BigDecimal("398"));
        assertThat(a.getCoatVal()).isEqualByComparingTo(new BigDecimal("104"));
    }

    @Test
    @DisplayName("save: 같은 코일·규격 증명서가 있으면 받지 않고, 모르는 규격도 거절한다")
    void saveRejectsDuplicate() {
        given(lookup.one("C1")).willReturn(Optional.of(CoilFixtures.snapshot("C1", "D1-010", JudgmentStatus.PASS, JudgmentStatus.PASS)));
        given(certs.findByCoilNoAndStdCd("C1", "KS D 3506")).willReturn(List.of(InspectionCertificate.of("MTC-9", "C1", MtcStatus.ISSUED)));
        InspectionCertificateSaveRequest req = new InspectionCertificateSaveRequest();
        req.setCoilNo("C1");
        req.setStdCd("KS D 3506");
        assertThatThrownBy(() -> service.save(req)).isInstanceOf(BusinessException.class).hasMessageContaining("MTC-9");
        req.setStdCd("EN 10346");
        assertThatThrownBy(() -> service.save(req)).isInstanceOf(BusinessException.class);
    }
}
