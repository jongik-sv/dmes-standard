package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import com.dongkuk.dmes.mcm.screenusage.support.ScreenUsageJpaTestConfig;
import com.dongkuk.dmes.mcm.screenusage.support.StubSecurityIdentity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/** 기록 서비스 + 실제 고유 제약(Oracle) — Review Focus 2·5. */
@SpringJUnitConfig(ScreenUsageJpaTestConfig.class)
class ScreenUsageRecordJpaTest {

    private static final Instant NOW = Instant.parse("2026-10-02T01:00:00Z");
    private static final long NOW_MS = NOW.toEpochMilli();

    @Autowired ScreenUsageLogRepository logRepository;
    @Autowired ScreenUsageDayRepository dayRepository;

    private final SecUserRepository secUserRepository = mock(SecUserRepository.class); // findById → Optional.empty()
    private final RequestClientIp requestClientIp = mock(RequestClientIp.class);
    private StubSecurityIdentity identity;
    private ScreenUsageService service;

    @BeforeEach
    void setUp() {
        logRepository.deleteAllInBatch();
        dayRepository.deleteAllInBatch();
        identity = new StubSecurityIdentity("userA");
        service = new ScreenUsageService(logRepository, secUserRepository, identity, requestClientIp,
                Clock.fixed(NOW, ZoneId.of("Asia/Seoul")));
    }

    private static Map<String, Object> seg(String id, String pageId, long startOffsetMs) {
        Map<String, Object> m = new HashMap<>();
        m.put("clientSegId", id);
        m.put("pageId", pageId);
        m.put("startKind", "OPEN");
        m.put("startedAt", NOW_MS + startOffsetMs);
        m.put("endedAt", NOW_MS + startOffsetMs + 5_000);
        return m;
    }

    @Test
    @DisplayName("같은 묶음을 두 번 보내면 두 번째는 saved=0 이고 원본은 한 번만 쌓인다 (Review Focus 2)")
    void resendSameBatch() {
        List<Map<String, Object>> batch = List.of(seg("seg-1", "csa/commUserMng", -60_000), seg("seg-2", "csa/commMenuMng", -30_000));

        assertThat(service.record(batch)).containsEntry("saved", 2).containsEntry("skipped", 0);
        assertThat(service.record(batch)).containsEntry("saved", 0).containsEntry("skipped", 2);
        assertThat(logRepository.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("일부만 겹친 재전송은 새 구간만 저장한다")
    void partialResend() {
        service.record(List.of(seg("seg-1", "p/a", -60_000)));

        assertThat(service.record(List.of(seg("seg-1", "p/a", -60_000), seg("seg-3", "p/a", -10_000))))
                .containsEntry("saved", 1).containsEntry("skipped", 1);
        assertThat(logRepository.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("다른 사용자의 같은 clientSegId 는 각자 저장된다 (고유 제약은 사용자 기준)")
    void sameSegIdOtherUser() {
        service.record(List.of(seg("seg-1", "p/a", -60_000)));
        identity.userId = "userB";

        assertThat(service.record(List.of(seg("seg-1", "p/a", -60_000)))).containsEntry("saved", 1);
        assertThat(logRepository.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("메뉴에 없는 화면·부서 없는 사용자의 구간도 저장한다 (Review Focus 5)")
    void storesUnknownMenuAndNoDept() {
        assertThat(service.record(List.of(seg("seg-x", "old/removedScreen", -60_000)))).containsEntry("saved", 1);

        ScreenUsageLog saved = logRepository.findAll().get(0);
        assertThat(saved.getPageId()).isEqualTo("old/removedScreen");
        assertThat(saved.getDeptCd()).isNull();
        assertThat(saved.getUserId()).isEqualTo("userA");
    }
}
