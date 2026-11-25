package com.dongkuk.dmes.mqc.qpr.tagManagement.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.JudgmentStatus;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.service.CoilFixtures;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.service.CoilLookup;
import com.dongkuk.dmes.mqc.qpr.common.OutputHistories;
import com.dongkuk.dmes.mqc.qpr.tagManagement.domain.CoilTag;
import com.dongkuk.dmes.mqc.qpr.tagManagement.domain.TagKind;
import com.dongkuk.dmes.mqc.qpr.tagManagement.domain.TagStatus;
import com.dongkuk.dmes.mqc.qpr.tagManagement.dto.TagKeyRequest;
import com.dongkuk.dmes.mqc.qpr.tagManagement.dto.TagReissueRequest;
import com.dongkuk.dmes.mqc.qpr.tagManagement.repository.CoilTagRepository;
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
class TagManagementServiceTest {

    @Mock CoilTagRepository tags;
    @Mock CoilLookup lookup;
    @Mock OutputHistories histories;

    TagManagementService service;

    @BeforeEach
    void setUp() {
        service = new TagManagementService(tags, lookup, histories, CoilFixtures.CLOCK);
        given(histories.list(any(), any(), any(), any(), any(), any())).willReturn(List.of());
    }

    private static TagKeyRequest key(String tagNo) {
        TagKeyRequest r = new TagKeyRequest();
        r.setTagNo(tagNo);
        return r;
    }

    @Test
    @DisplayName("issue: 출하 Tag 는 코일이 합격이어야 출력하고, 공정 Tag 는 판정과 상관없이 출력한다")
    void issueShipNeedsPass() {
        CoilTag ship = CoilTag.of("T-1", TagKind.SHIP, "C1", "PRT-출하-01", TagStatus.WAIT);
        CoilTag proc = CoilTag.of("T-2", TagKind.PROC, "C1", "PRT-CGL2-01", TagStatus.WAIT);
        given(tags.findById("T-1")).willReturn(Optional.of(ship));
        given(tags.findById("T-2")).willReturn(Optional.of(proc));
        given(lookup.one("C1")).willReturn(Optional.of(CoilFixtures.snapshot("C1", "D1-010", JudgmentStatus.WAIT, JudgmentStatus.HOLD)));

        assertThatThrownBy(() -> service.issue(key("T-1"))).isInstanceOf(BusinessException.class).hasMessageContaining("합격");
        assertThat(ship.getStatCd()).isEqualTo(TagStatus.WAIT);
        service.issue(key("T-2"));
        assertThat(proc.getStatCd()).isEqualTo(TagStatus.ISSUED);

        given(lookup.one("C1")).willReturn(Optional.of(CoilFixtures.snapshot("C1", "D1-010", JudgmentStatus.PASS, JudgmentStatus.PASS)));
        service.issue(key("T-1"));
        assertThat(ship.getStatCd()).isEqualTo(TagStatus.ISSUED);
    }

    @Test
    @DisplayName("reissue: 코일 번호로 최근 발행 Tag 를 찾아 사유·프린터·매수로 재발행하고, 대기 Tag 는 거절한다")
    void reissueByCoil() {
        CoilTag t = CoilTag.of("T-1", TagKind.PROC, "C1", "PRT-CGL2-01", TagStatus.ISSUED);
        given(tags.findByCoilNoOrderByIssueAtDesc("C1")).willReturn(List.of(t));
        given(tags.findById("T-1")).willReturn(Optional.of(t));
        given(lookup.one("C1")).willReturn(Optional.of(CoilFixtures.snapshot("C1", "D1-010", JudgmentStatus.WAIT, null)));
        TagReissueRequest req = new TagReissueRequest();
        req.setCoilNo("C1");
        req.setReasonCd("LOST");
        req.setPrtId("PRT-CGL5-01");
        req.setCopies("2");

        service.reissue(req);

        assertThat(t.getStatCd()).isEqualTo(TagStatus.REISSUED);
        assertThat(t.getPrtId()).isEqualTo("PRT-CGL5-01");
        assertThat(t.getCopyCnt()).isEqualTo(2);
        assertThat(t.getRissuCnt()).isEqualTo(1);

        CoilTag waiting = CoilTag.of("T-9", TagKind.PROC, "C1", null, TagStatus.WAIT);
        given(tags.findById("T-9")).willReturn(Optional.of(waiting));
        req.setTagNo("T-9");
        assertThatThrownBy(() -> service.reissue(req)).isInstanceOf(BusinessException.class);
        req.setTagNo("T-1");
        req.setCopies("12");
        assertThatThrownBy(() -> service.reissue(req)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("cancel: 사유를 받아 폐기한다")
    void cancel() {
        CoilTag t = CoilTag.of("T-1", TagKind.SHIP, "C1", "PRT-출하-01", TagStatus.WAIT);
        given(tags.findById("T-1")).willReturn(Optional.of(t));
        given(lookup.one("C1")).willReturn(Optional.of(CoilFixtures.snapshot("C1", "D1-010", JudgmentStatus.FAIL, JudgmentStatus.FAIL)));
        TagKeyRequest req = key("T-1");
        assertThatThrownBy(() -> service.cancel(req)).isInstanceOf(BusinessException.class);
        req.setReason("불합격 판정");
        service.cancel(req);
        assertThat(t.getStatCd()).isEqualTo(TagStatus.DISCARDED);
    }
}
