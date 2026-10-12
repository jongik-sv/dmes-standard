package com.dongkuk.dmes.mdm.common.metarev;

import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/** 변경 기록을 넣으면 신호기에 커밋 뒤 신호를 맡긴다(ADR-0007 D2 개정) — 원장 SAVE·강제 기록 모두, 넣은 행이 없으면 맡기지 않는다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class MetaRevisionRecorderSignalTest extends AbstractMdmSharedDbTest {

    @Autowired
    MetaRevisionRecorder recorder;
    @Autowired
    JdbcTemplate jdbc;
    @MockitoBean
    MetaChangeSignaler signaler;

    @BeforeEach
    void setUp() {
        MetaRevTestSupport.clear(jdbc);
        clearInvocations(signaler);
    }

    @Test
    void 원장_저장_기록과_강제_기록은_신호를_맡긴다() {
        recorder.column(null, "SIG_COL");
        verify(signaler, atLeastOnce()).afterCommit();

        clearInvocations(signaler);
        recorder.force(MetaTargetType.RULE, List.of("SIG_RULE"), MetaChangeKind.EVICT);
        verify(signaler, atLeastOnce()).afterCommit();
    }

    @Test
    void 넣은_행이_없으면_신호를_맡기지_않는다() {
        recorder.rule(null);
        recorder.layouts(List.of());
        recorder.force(MetaTargetType.RULE, List.of(" "), MetaChangeKind.RELOAD);
        verify(signaler, never()).afterCommit();
    }
}
