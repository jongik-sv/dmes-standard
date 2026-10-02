package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * 화면 사용 구간 기록 — OASIS {@code screenUsage/record} (설계 4.3, 계약 C3).
 *
 * <p>로그인 사용자 전원이 호출하는 AUTH_ONLY 서비스다. 사용자 ID 는 인증 컨텍스트, 부서는 기록 시점
 * {@code SecUser.deptCd} 스냅숏으로 서버가 채운다(body·meta 의 값은 쓰지 않는다).
 *
 * <p>중복: 요청 묶음의 clientSegId 를 사용자 기준으로 먼저 조회해 건너뛴다. 고유 제약 위반을 catch 해서 넘기면
 * 트랜잭션이 rollback-only 가 되므로 하지 않는다. 같은 묶음이 동시에 두 번 들어와 사전 조회를 함께 통과하면
 * 뒤 요청이 제약 위반으로 실패하고, sender 가 다음 주기에 재전송할 때 사전 조회가 거른다.
 *
 * <p>{@code @Transactional} 미부착 — OASIS 진입점(6-B-1). 쓰기는 {@code saveAll} 의 저장소 트랜잭션으로 원자적이다.
 */
@Service("screenUsageService")
public class ScreenUsageService {

    private static final Logger log = LoggerFactory.getLogger(ScreenUsageService.class);

    static final int MAX_PER_REQUEST = 100;
    static final long MIN_DURATION_MS = 1_000L;
    static final long MAX_DURATION_MS = 24L * 60 * 60 * 1000;
    static final long MAX_FUTURE_MS = 5L * 60 * 1000;
    /** 수신 시각보다 이만큼(일) 넘게 과거인 구간은 버린다 — startedAt=0 같은 값이 영구 집계에 남는 것을 막는다. */
    static final long MAX_PAST_DAYS = 30L;
    static final long MAX_PAST_MS = MAX_PAST_DAYS * 24 * 60 * 60 * 1000;
    static final int MAX_PAGE_ID_LENGTH = 200;
    static final int MAX_SEG_ID_LENGTH = 36;
    /** 클라이언트는 2026-10-02 부터 OPEN·RESUME 만 보낸다. SWITCH 는 이전 클라이언트·옛 행 호환으로 남긴다. */
    static final Set<String> START_KINDS = Set.of("OPEN", "SWITCH", "RESUME");

    private final ScreenUsageLogRepository logRepository;
    private final SecUserRepository secUserRepository;
    private final SecurityIdentity securityIdentity;
    private final RequestClientIp requestClientIp;
    private final Clock clock;

    @Autowired
    public ScreenUsageService(ScreenUsageLogRepository logRepository,
                              SecUserRepository secUserRepository,
                              SecurityIdentity securityIdentity,
                              RequestClientIp requestClientIp) {
        this(logRepository, secUserRepository, securityIdentity, requestClientIp,
                Clock.system(ScreenUsageDates.ZONE));
    }

    ScreenUsageService(ScreenUsageLogRepository logRepository,
                       SecUserRepository secUserRepository,
                       SecurityIdentity securityIdentity,
                       RequestClientIp requestClientIp,
                       Clock clock) {
        this.logRepository = logRepository;
        this.secUserRepository = secUserRepository;
        this.securityIdentity = securityIdentity;
        this.requestClientIp = requestClientIp;
        this.clock = clock;
    }

    /** action=record — grids key {@code segments} = 파라미터 이름(6-E-3). 응답 {@code data.result = {saved, skipped}}. */
    public Map<String, Object> record(List<Map<String, Object>> segments) {
        String userId = securityIdentity.requireUserId();
        if (segments == null || segments.isEmpty()) {
            return result(0, 0);
        }

        long receivedMs = clock.millis();
        int limit = Math.min(segments.size(), MAX_PER_REQUEST);
        int skipped = segments.size() - limit;

        Map<String, Candidate> candidates = new LinkedHashMap<>();
        for (Map<String, Object> row : segments.subList(0, limit)) {
            Candidate c = Candidate.parse(row, receivedMs);
            if (c == null || candidates.containsKey(c.clientSegId())) {
                skipped++;
                continue;
            }
            candidates.put(c.clientSegId(), c);
        }

        if (!candidates.isEmpty()) {
            List<String> existing = logRepository.findExistingClientSegIds(userId, new ArrayList<>(candidates.keySet()));
            for (String segId : existing) {
                if (candidates.remove(segId) != null) {
                    skipped++;
                }
            }
        }
        if (candidates.isEmpty()) {
            logSkipped(userId, skipped);
            return result(0, skipped);
        }

        String deptCd = secUserRepository.findById(userId)
                .map(SecUser::getDeptCd)
                .filter(d -> !d.isBlank())
                .orElse(null);
        String clientIp = requestClientIp.current();
        LocalDateTime receivedAt = ScreenUsageDates.fromEpochMillis(receivedMs);

        List<ScreenUsageLog> rows = new ArrayList<>(candidates.size());
        for (Candidate c : candidates.values()) {
            rows.add(c.toEntity(userId, deptCd, clientIp, receivedAt));
        }
        logRepository.saveAll(rows);
        logSkipped(userId, skipped);
        return result(rows.size(), skipped);
    }

    private static Map<String, Object> result(int saved, int skipped) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("saved", saved);
        result.put("skipped", skipped);
        return result;
    }

    private static void logSkipped(String userId, int skipped) {
        if (skipped > 0) {
            log.info("[screenUsage/record] user={} skipped={}", userId, skipped);
        }
    }

    /** 검증을 통과한 구간 1건. */
    private record Candidate(String clientSegId, String pageId, String startKind, long startedAt, long endedAt,
                             long durationMs) {

        /** 설계 4.3 검증 — 하나라도 어기면 null. 숫자는 ((Number) v).longValue() 로 읽는다(Integer/Long 혼재). */
        static Candidate parse(Map<String, Object> row, long receivedMs) {
            if (row == null) return null;
            String segId = trimmed(row.get("clientSegId"));
            String pageId = trimmed(row.get("pageId"));
            String kind = trimmed(row.get("startKind"));
            Long started = asLong(row.get("startedAt"));
            Long ended = asLong(row.get("endedAt"));
            if (segId == null || segId.length() > MAX_SEG_ID_LENGTH) return null;
            if (pageId == null || pageId.length() > MAX_PAGE_ID_LENGTH) return null;
            if (kind == null || !START_KINDS.contains(kind)) return null;
            if (started == null || ended == null) return null;
            long wall = ended - started;
            if (wall < MIN_DURATION_MS || wall > MAX_DURATION_MS) return null; // ENDED < STARTED 포함
            if (started > receivedMs + MAX_FUTURE_MS) return null;
            if (started < receivedMs - MAX_PAST_MS) return null;
            // durationMs(선택) — 클라이언트가 탭 단위로 누적한 실제 이용 시간(일시정지 제외). 없거나 null 이면 벽시계 길이.
            Object rawDuration = row.get("durationMs");
            long duration = wall;
            if (rawDuration != null) {
                Long d = asLong(rawDuration);
                if (d == null || d < MIN_DURATION_MS || d > wall) return null;
                duration = d;
            }
            return new Candidate(segId, pageId, kind, started, ended, duration);
        }

        ScreenUsageLog toEntity(String userId, String deptCd, String clientIp, LocalDateTime receivedAt) {
            ScreenUsageLog l = new ScreenUsageLog();
            l.setUsageId(UUID.randomUUID().toString());
            l.setUserId(userId);
            l.setDeptCd(deptCd);
            l.setPageId(pageId);
            l.setStartKind(startKind);
            l.setStartedAt(ScreenUsageDates.fromEpochMillis(startedAt));
            l.setEndedAt(ScreenUsageDates.fromEpochMillis(endedAt));
            l.setDurationMs(durationMs);
            l.setClientSegId(clientSegId);
            l.setClientIp(clientIp);
            l.setReceivedAt(receivedAt);
            return l;
        }

        private static String trimmed(Object v) {
            if (!(v instanceof String s)) return null;
            String t = s.trim();
            return t.isEmpty() ? null : t;
        }

        private static Long asLong(Object v) {
            return v instanceof Number n ? n.longValue() : null;
        }
    }
}
