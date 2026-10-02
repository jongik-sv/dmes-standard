package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import com.dongkuk.dmes.mcm.screenusage.support.StubSecurityIdentity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** {@link ScreenUsageService#record} 검증 규칙(설계 4.3) — 저장소는 Mockito, SecurityIdentity 는 스텁. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ScreenUsageServiceTest {

    /** 2026-10-02 10:00 Asia/Seoul */
    private static final Instant NOW = Instant.parse("2026-10-02T01:00:00Z");
    private static final long NOW_MS = NOW.toEpochMilli();

    @Mock ScreenUsageLogRepository logRepository;
    @Mock SecUserRepository secUserRepository;
    @Mock RequestClientIp requestClientIp;
    @Captor ArgumentCaptor<List<ScreenUsageLog>> rowsCaptor;

    private StubSecurityIdentity identity;
    private ScreenUsageService service;

    @BeforeEach
    void setUp() {
        identity = new StubSecurityIdentity("userA");
        service = new ScreenUsageService(logRepository, secUserRepository, identity, requestClientIp,
                Clock.fixed(NOW, ZoneId.of("Asia/Seoul")));
        when(logRepository.findExistingClientSegIds(anyString(), anyCollection())).thenReturn(List.of());
        when(secUserRepository.findById("userA")).thenReturn(Optional.of(user("userA", "D100")));
        when(requestClientIp.current()).thenReturn("10.0.0.7");
    }

    private static SecUser user(String userId, String deptCd) {
        SecUser u = new SecUser();
        u.setUserId(userId);
        u.setDeptCd(deptCd);
        return u;
    }

    private static Map<String, Object> seg(String id, String pageId, String kind, long startOffsetMs, long durationMs) {
        Map<String, Object> m = new HashMap<>();
        m.put("clientSegId", id);
        m.put("pageId", pageId);
        m.put("startKind", kind);
        m.put("startedAt", NOW_MS + startOffsetMs);
        m.put("endedAt", NOW_MS + startOffsetMs + durationMs);
        return m;
    }

    @Test
    @DisplayName("인증 사용자·기록 시점 부서·IP·서버 계산 길이로 저장하고 body 의 userId·deptCd 는 무시한다")
    void savesWithServerFilledFields() {
        Map<String, Object> s = seg("seg-1", "csa/commUserMng", "OPEN", -120_000, 60_000);
        s.put("userId", "intruder");
        s.put("deptCd", "HACK");

        Map<String, Object> result = service.record(List.of(s));

        assertThat(result).containsEntry("saved", 1).containsEntry("skipped", 0);
        verify(logRepository).saveAll(rowsCaptor.capture());
        ScreenUsageLog row = rowsCaptor.getValue().get(0);
        assertThat(row.getUserId()).isEqualTo("userA");
        assertThat(row.getDeptCd()).isEqualTo("D100");
        assertThat(row.getClientIp()).isEqualTo("10.0.0.7");
        assertThat(row.getClientSegId()).isEqualTo("seg-1");
        assertThat(row.getPageId()).isEqualTo("csa/commUserMng");
        assertThat(row.getStartKind()).isEqualTo("OPEN");
        assertThat(row.getDurationMs()).isEqualTo(60_000L);
        assertThat(row.getStartedAt()).isEqualTo(LocalDateTime.of(2026, 10, 2, 9, 58));
        assertThat(row.getEndedAt()).isEqualTo(LocalDateTime.of(2026, 10, 2, 9, 59));
        assertThat(row.getReceivedAt()).isEqualTo(LocalDateTime.of(2026, 10, 2, 10, 0));
        assertThat(row.getUsageId()).hasSize(36);
    }

    @Test
    @DisplayName("검증을 통과하지 못한 구간은 버리고 건수만 센다")
    void dropsInvalidSegments() {
        Map<String, Object> ok = seg("s1", "p/a", "OPEN", -60_000, 10_000);
        Map<String, Object> noSegId = seg(null, "p/a", "OPEN", -60_000, 10_000);
        Map<String, Object> blankPage = seg("s3", "  ", "OPEN", -60_000, 10_000);
        Map<String, Object> longPage = seg("s4", "p/" + "x".repeat(199), "OPEN", -60_000, 10_000); // 201자
        Map<String, Object> badKind = seg("s5", "p/a", "CLOSE", -60_000, 10_000);
        Map<String, Object> reversed = seg("s6", "p/a", "OPEN", -60_000, -1_000);           // ENDED < STARTED
        Map<String, Object> tooShort = seg("s7", "p/a", "OPEN", -60_000, 999);              // 1초 미만
        Map<String, Object> tooLong = seg("s8", "p/a", "OPEN", -90_000_000, 86_400_001);    // 24시간 초과
        Map<String, Object> future = seg("s9", "p/a", "OPEN", 300_001, 10_000);             // 5분 넘게 미래
        Map<String, Object> textTime = seg("s10", "p/a", "OPEN", -60_000, 10_000);
        textTime.put("startedAt", String.valueOf(NOW_MS - 60_000));                          // 숫자가 아님

        Map<String, Object> result = service.record(Arrays.asList(
                ok, noSegId, blankPage, longPage, badKind, reversed, tooShort, tooLong, future, textTime, null));

        assertThat(result).containsEntry("saved", 1).containsEntry("skipped", 10);
        verify(logRepository).saveAll(rowsCaptor.capture());
        assertThat(rowsCaptor.getValue()).extracting(ScreenUsageLog::getClientSegId).containsExactly("s1");
    }

    @Test
    @DisplayName("경계값(정확히 1초·24시간·5분 미래·pageId 200자)은 받는다")
    void acceptsBoundaries() {
        Map<String, Object> result = service.record(List.of(
                seg("b1", "p/a", "OPEN", -60_000, 1_000),
                seg("b2", "p/a", "SWITCH", -86_400_000, 86_400_000),
                seg("b3", "p/a", "RESUME", 300_000, 1_000),
                seg("b4", "p/" + "x".repeat(198), "OPEN", -60_000, 1_000)));

        assertThat(result).containsEntry("saved", 4).containsEntry("skipped", 0);
    }

    @Test
    @DisplayName("한 요청에 100건이 넘으면 앞 100건만 다루고 나머지는 건너뛴 것으로 센다")
    void capsAtHundred() {
        List<Map<String, Object>> segments = IntStream.range(0, 105)
                .mapToObj(i -> seg("s" + i, "p/a", "OPEN", -60_000, 1_000))
                .toList();

        Map<String, Object> result = service.record(segments);

        assertThat(result).containsEntry("saved", 100).containsEntry("skipped", 5);
        verify(logRepository).saveAll(rowsCaptor.capture());
        assertThat(rowsCaptor.getValue()).hasSize(100);
        assertThat(rowsCaptor.getValue().get(99).getClientSegId()).isEqualTo("s99");
    }

    @Test
    @DisplayName("같은 묶음 안의 중복 clientSegId 와 이미 저장된 clientSegId 는 건너뛴다")
    void skipsDuplicates() {
        when(logRepository.findExistingClientSegIds(eq("userA"), anyCollection())).thenReturn(List.of("old"));

        Map<String, Object> result = service.record(List.of(
                seg("new", "p/a", "OPEN", -60_000, 1_000),
                seg("new", "p/a", "OPEN", -50_000, 1_000),
                seg("old", "p/a", "OPEN", -40_000, 1_000)));

        assertThat(result).containsEntry("saved", 1).containsEntry("skipped", 2);
        verify(logRepository).saveAll(rowsCaptor.capture());
        assertThat(rowsCaptor.getValue()).extracting(ScreenUsageLog::getClientSegId).containsExactly("new");
    }

    @Test
    @DisplayName("모두 이미 저장된 구간이면 저장소에 쓰지 않고 saved=0 이다")
    void allDuplicates() {
        when(logRepository.findExistingClientSegIds(eq("userA"), anyCollection())).thenReturn(List.of("a", "b"));

        Map<String, Object> result = service.record(List.of(
                seg("a", "p/a", "OPEN", -60_000, 1_000),
                seg("b", "p/a", "OPEN", -50_000, 1_000)));

        assertThat(result).containsEntry("saved", 0).containsEntry("skipped", 2);
        verify(logRepository, never()).saveAll(any());
    }

    @Test
    @DisplayName("사용자 마스터에 없거나 부서가 비어 있으면 부서는 null 로 남긴다")
    void noDeptSnapshot() {
        when(secUserRepository.findById("userA")).thenReturn(Optional.empty());
        service.record(List.of(seg("n1", "p/a", "OPEN", -60_000, 1_000)));
        when(secUserRepository.findById("userA")).thenReturn(Optional.of(user("userA", "  ")));
        service.record(List.of(seg("n2", "p/a", "OPEN", -60_000, 1_000)));

        verify(logRepository, times(2)).saveAll(rowsCaptor.capture());
        assertThat(rowsCaptor.getAllValues()).allSatisfy(rows -> assertThat(rows.get(0).getDeptCd()).isNull());
    }

    @Test
    @DisplayName("인증 사용자가 없으면 거절하고 저장소를 건드리지 않는다")
    void requiresAuthentication() {
        identity.userId = null;

        assertThatThrownBy(() -> service.record(List.of(seg("x", "p/a", "OPEN", -60_000, 1_000))))
                .isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(logRepository);
    }

    @Test
    @DisplayName("빈 목록·null 은 saved=0, skipped=0 이고 저장하지 않는다")
    void emptyBatch() {
        assertThat(service.record(List.of())).containsEntry("saved", 0).containsEntry("skipped", 0);
        assertThat(service.record(null)).containsEntry("saved", 0).containsEntry("skipped", 0);
        verify(logRepository, never()).saveAll(any());
    }
}
