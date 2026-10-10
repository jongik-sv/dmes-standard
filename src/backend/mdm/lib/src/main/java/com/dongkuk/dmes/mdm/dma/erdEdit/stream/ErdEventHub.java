package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdChangesView;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdCommandService;
import jakarta.annotation.PreDestroy;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 모델별 실시간 구독자 묶음(스펙 4.4·D16·D17). 서버 1대 가정(스펙 5절) — 구독·접속자는 메모리에, 작업 중 표시는 표에 둔다.
 * 델타는 rev 순서로 빠짐없이 보낸다: 구독 등록 → 재생 → 쌓인 실시간 델타, 그리고 중간이 빈 델타가 오면 명령 기록에서 채운다.
 */
@Component
public class ErdEventHub {

    private static final Logger log = LoggerFactory.getLogger(ErdEventHub.class);
    static final long PING_MS = 15_000;
    /** 재생 스레드 수. 재생마다 풀 연결 하나를 잠깐 쓰므로 Hikari 풀(로컬 3)보다 작게 고정한다. */
    static final int REPLAY_THREADS = 2;

    /** 구독 하나. 이 객체로 동기화한다 — SseEmitter 는 동시 send 를 허용하지 않는다. */
    static final class Sub {
        final String modelId;
        final String session;
        final SseEmitter emitter;
        long lastRev = -1;
        boolean replaying = true;
        final List<ErdDelta> pending = new ArrayList<>();
        volatile boolean dropped;

        Sub(String modelId, String session, SseEmitter emitter) {
            this.modelId = modelId;
            this.session = session;
            this.emitter = emitter;
        }
    }

    private final Map<String, List<Consumer<ErdDelta>>> listeners = new ConcurrentHashMap<>();
    private final Map<String, List<Sub>> subs = new ConcurrentHashMap<>();
    /** 키: modelId + "\u0000" + session. */
    private final Map<String, ErdPresence> presence = new ConcurrentHashMap<>();
    private final ObjectProvider<ErdCommandService> commandsProvider;
    private final JdbcTemplate jdbc;
    private final ScheduledExecutorService pinger;
    /** 구독 시작 때의 재생(명령 기록 읽기)을 맡는다. 요청 스레드와 분리 — subscribe 주석 참고. */
    private final ExecutorService replayer;

    /** ErdCommandService 는 이 허브를 받으므로 ObjectProvider 로 늦게 꺼낸다(순환 의존 회피). */
    public ErdEventHub(ObjectProvider<ErdCommandService> commandsProvider, JdbcTemplate jdbc) {
        this.commandsProvider = commandsProvider;
        this.jdbc = jdbc;
        // MDM 앱에는 @EnableScheduling 이 없다 — 허브가 스레드 하나를 직접 둔다.
        this.pinger = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "erd-sse-ping");
            t.setDaemon(true);
            return t;
        });
        pinger.scheduleAtFixedRate(this::pingAll, PING_MS, PING_MS, TimeUnit.MILLISECONDS);
        this.replayer = Executors.newFixedThreadPool(REPLAY_THREADS, r -> {
            Thread t = new Thread(r, "erd-sse-replay");
            t.setDaemon(true);
            return t;
        });
    }

    @PreDestroy
    void close() {
        pinger.shutdownNow();
        replayer.shutdownNow();
        subs.values().forEach(list -> list.forEach(s -> s.emitter.complete()));
    }

    // ── 델타 ──────────────────────────────────────────────────────────

    /** 커밋 뒤에 불린다. 구독자 하나의 실패가 다른 구독자와 이미 커밋된 명령 처리에 번지지 않도록 구독자별로 예외를 삼킨다. */
    public void publish(ErdDelta delta) {
        for (Consumer<ErdDelta> l : listeners.getOrDefault(delta.modelId(), List.of())) {
            try {
                l.accept(delta);
            } catch (RuntimeException e) {
                log.warn("ERD 델타 구독자 처리 실패 model={} rev={}", delta.modelId(), delta.rev(), e);
            }
        }
        for (Sub s : subs.getOrDefault(delta.modelId(), List.of())) {
            try {
                synchronized (s) {
                    if (s.replaying) s.pending.add(delta);
                    else deliver(s, delta);
                }
            } catch (RuntimeException e) {
                // 보내기(IO) 오류는 send 가 이미 처리했다. 여기는 그 밖의 실패(직렬화 등) — 멈춘 채 남지 않게 끊는다.
                log.warn("ERD SSE 델타 전달 실패 model={} session={} rev={} — 구독 해제", delta.modelId(), s.session, delta.rev(), e);
                s.dropped = true;
                s.emitter.completeWithError(e);
                pinger.execute(() -> drop(s));
            }
        }
    }

    /** 시험·내부 구독. 돌려준 Runnable 로 해지한다. */
    public Runnable addListenerForTest(String modelId, Consumer<ErdDelta> listener) {
        listeners.computeIfAbsent(modelId, k -> new CopyOnWriteArrayList<>()).add(listener);
        return () -> listeners.getOrDefault(modelId, List.of()).remove(listener);
    }

    /**
     * 구독. sinceRev ≥ 0 이면 그 뒤 델타를 먼저 재생하고, 500건을 넘거나 DRAFT 표시를 건너면 reload 하나만 보낸다.
     * sinceRev 가 없으면(음수) 첫 이벤트로 {@code hello{rev}} 를 보내고 그 rev 뒤부터 이어 보낸다(최종 검토 B4).
     * 반환한 뒤에도 send 가 가능하다 — SseEmitter 는 핸들러 초기화 전 send 를 모아 두었다가 보낸다.
     */
    public SseEmitter subscribe(String modelId, String session, String userId, String source, long sinceRev) {
        // 없는 모델이면 ERD_MODEL_NOT_FOUND(컨트롤러가 404 로 바꾼다). EntityManager 를 요청 스레드에서 쓰지 않는다 — open-in-view 가
        // 비동기 응답이 끝날 때까지 JDBC 연결을 쥐어, 구독자 하나마다 풀 연결 하나가 묶인다. 재생도 그래서 별도 스레드에서 한다.
        long helloRev = currentRev(modelId);
        SseEmitter emitter = new SseEmitter(0L); // 0 = 시간 제한 없음. 끊김은 ping 보내기 실패로 잡는다
        Sub sub = new Sub(modelId, session, emitter);
        // 0. 새 구독이면 등록 전에 hello 를 보낸다 — 등록 전이라 다른 스레드(presence·claim·델타)가 이 구독에 먼저 보낼 수 없다.
        //    hello 의 rev 는 등록 전에 읽었으므로, 그 뒤에 커밋된 델타는 아래 재생(helloRev 부터)이 채운다.
        if (sinceRev < 0 && !send(sub, "hello", Map.of("rev", helloRev))) return emitter;
        subs.computeIfAbsent(modelId, k -> new CopyOnWriteArrayList<>()).add(sub); // 1. 먼저 등록(실시간 델타는 pending 에 쌓인다)
        Runnable drop = () -> drop(sub);
        emitter.onCompletion(drop);
        emitter.onTimeout(drop);
        emitter.onError(e -> drop.run());
        presence.put(key(modelId, session), new ErdPresence(session, userId, source, null, List.of(), Instant.now().toString()));
        // 2·3. 재생(현재 rev 읽기 포함)은 등록 뒤 별도 스레드에서 한다. 그 사이의 실시간 델타는 pending 에 쌓이고, 재생이 끝나면 lastRev 보다 큰 것만 보낸다.
        replayer.execute(() -> replay(sub, sinceRev >= 0 ? sinceRev : helloRev));
        broadcastPresence(modelId);
        send(sub, "claim", claims(modelId));
        return emitter;
    }

    /** 시험용: 재생 스레드가 명령 기록을 읽은 뒤, 잠금을 잡기 전에 부른다. 이 사이에 낀 델타가 빠지거나 겹치지 않는지 확인하는 데 쓴다. */
    private volatile Runnable replayPauseForTest;

    public void setReplayPauseForTest(Runnable pause) {
        this.replayPauseForTest = pause;
    }

    /**
     * DB 읽기는 모두 sub 잠금 밖에서 한다(R11-1). 잠금 안에서 연결을 기다리면, 연결을 쥔 채 afterCommit 에서 같은 잠금을 기다리는
     * 발행 스레드와 서로 막혀 풀이 마른다. 구독은 이미 등록되어 있으므로, 읽는 동안 커밋된 델타는 pending 에 쌓였다가 lastRev 보다 큰 것만 나간다.
     */
    private void replay(Sub sub, long sinceRev) {
        try {
            ErdChangesView snapshot = commandsProvider.getObject().changesSince(sub.modelId, sinceRev);
            Runnable pause = replayPauseForTest;
            if (pause != null) pause.run();
            synchronized (sub) {
                if (snapshot.reload()) {
                    if (send(sub, "reload", Map.of("rev", snapshot.rev()))) sub.lastRev = snapshot.rev();
                } else {
                    sub.lastRev = Math.max(sub.lastRev, sinceRev);
                    for (ErdDelta d : snapshot.deltas()) {
                        if (d.rev() <= sub.lastRev) continue;
                        if (!send(sub, "change", d)) break;
                        sub.lastRev = d.rev();
                    }
                }
                sub.replaying = false;
                sub.pending.sort(Comparator.comparingLong(ErdDelta::rev));
                for (ErdDelta d : sub.pending) deliver(sub, d);
                sub.pending.clear();
            }
        } catch (RuntimeException e) {
            log.warn("ERD SSE 재생 실패 model={} session={} — 구독 해제", sub.modelId, sub.session, e);
            sub.dropped = true;
            sub.emitter.completeWithError(e);
        }
    }

    /** JdbcTemplate 으로 읽고 바로 연결을 돌려준다. 없는 모델이면 ERD_MODEL_NOT_FOUND. */
    private long currentRev(String modelId) {
        return jdbc.query("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = ?", (rs, i) -> rs.getLong(1), modelId)
                .stream().findFirst().orElseThrow(() -> MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND));
    }

    /**
     * rev 순서로 하나씩 보낸다. 중간이 비면(다른 트랜잭션의 afterCommit 이 늦게 온 경우) 명령 기록에서 채운다. 호출자가 sub 를 잡고 있다.
     * 표시 델타(DRAFT 삭제·새 DRAFT)는 change 대신 {@code reload{rev}} 로 보낸다 — 화면이 모델을 다시 읽으므로 그 앞의 빈 칸은 채우지 않는다.
     */
    private void deliver(Sub s, ErdDelta d) {
        if (d.rev() <= s.lastRev) return;
        if (ErdDelta.isMarker(d)) {
            if (send(s, "reload", Map.of("rev", d.rev()))) s.lastRev = d.rev();
            return;
        }
        if (d.rev() > s.lastRev + 1) {
            catchUp(s, s.lastRev);
            if (d.rev() <= s.lastRev) return;
        }
        if (send(s, "change", d)) s.lastRev = d.rev();
    }

    /** 명령 기록에서 sinceRev 뒤를 읽어 보낸다. 500건을 넘으면 reload 만 보내고 lastRev 를 현재 rev 로 맞춘다. */
    private void catchUp(Sub s, long sinceRev) {
        ErdChangesView v = commandsProvider.getObject().changesSince(s.modelId, sinceRev);
        if (v.reload()) {
            if (send(s, "reload", Map.of("rev", v.rev()))) s.lastRev = v.rev();
            return;
        }
        s.lastRev = Math.max(s.lastRev, sinceRev);
        for (ErdDelta d : v.deltas()) {
            if (d.rev() <= s.lastRev) continue;
            if (!send(s, "change", d)) return;
            s.lastRev = d.rev();
        }
    }

    // ── 접속자 ────────────────────────────────────────────────────────

    public List<ErdPresence> presence(String modelId) {
        String prefix = modelId + "\u0000";
        return presence.entrySet().stream().filter(e -> e.getKey().startsWith(prefix)).map(Map.Entry::getValue)
                .sorted(Comparator.comparing(ErdPresence::session)).toList();
    }

    /** 화면 상태 갱신(SET_VIEW). 실시간 채널에 붙은 세션만 바꿀 수 있다 — 없으면 false. */
    public boolean updateView(String modelId, String session, String diagramId, List<String> selectedTables) {
        ErdPresence updated = presence.computeIfPresent(key(modelId, session),
                (k, p) -> new ErdPresence(p.session(), p.userId(), p.source(), diagramId, List.copyOf(selectedTables),
                        Instant.now().toString()));
        if (updated == null) return false;
        broadcastPresence(modelId);
        return true;
    }

    private void broadcastPresence(String modelId) {
        List<ErdPresence> list = presence(modelId);
        for (Sub s : subs.getOrDefault(modelId, List.of())) send(s, "presence", list);
    }

    /** 구독 해제. 여러 번 불려도 한 번만 처리한다(onCompletion·onError·보내기 실패가 겹친다). */
    private void drop(Sub sub) {
        sub.dropped = true;
        List<Sub> list = subs.getOrDefault(sub.modelId, List.of());
        if (!list.remove(sub)) return;
        // 같은 세션이 다시 붙어 있으면(재연결이 겹친 경우) 접속자 표시는 남긴다.
        if (list.stream().noneMatch(s -> s.session.equals(sub.session))) {
            presence.remove(key(sub.modelId, sub.session));
            broadcastPresence(sub.modelId);
        }
    }

    // ── 작업 중 표시(TB_MDM_ERD_CLAIM) ──────────────────────────────────

    /** 표 하나를 작업 중으로 표시한다. 다른 세션이 아직 만료되지 않은 표시를 갖고 있으면 빼앗지 않고 false. */
    public boolean claim(String modelId, String tableId, String session, String userId, long ttlSeconds) {
        Timestamp now = Timestamp.from(Instant.now());
        Timestamp until = Timestamp.from(Instant.now().plusSeconds(ttlSeconds));
        int n;
        try {
            n = jdbc.update("""
                MERGE INTO TB_MDM_ERD_CLAIM T
                USING (
                       SELECT ? AS ERD_MODEL_ID
                            , ? AS TABLE_UUID
                         FROM DUAL
                      ) S
                   ON (T.ERD_MODEL_ID = S.ERD_MODEL_ID AND T.TABLE_UUID = S.TABLE_UUID)
                 WHEN MATCHED THEN UPDATE
                         SET T.SESSION_NM = ?
                           , T.USER_ID    = ?
                           , T.EXPIRES_AT = ?
                           , T.U_USR_ID   = ?
                           , T.U_AT       = ?
                       WHERE T.SESSION_NM = ?
                          OR T.EXPIRES_AT <= ?
                 WHEN NOT MATCHED THEN INSERT
                       (ERD_MODEL_ID, TABLE_UUID, SESSION_NM, USER_ID, EXPIRES_AT, C_USR_ID, C_AT, U_USR_ID, U_AT, VER)
                       VALUES (S.ERD_MODEL_ID, S.TABLE_UUID, ?, ?, ?, ?, ?, ?, ?, 0)
                """, modelId, tableId, session, userId, until, userId, now, session, now,
                session, userId, until, userId, now, userId, now);
        } catch (DuplicateKeyException e) {
            return false; // 같은 표를 다른 세션이 동시에 처음 표시했다 — 먼저 들어간 쪽이 이긴다
        }
        if (n > 0) broadcastClaims(modelId);
        return n > 0;
    }

    public void release(String modelId, String tableId, String session) {
        int n = jdbc.update("DELETE FROM TB_MDM_ERD_CLAIM WHERE ERD_MODEL_ID = ? AND TABLE_UUID = ? AND SESSION_NM = ?",
                modelId, tableId, session);
        if (n > 0) broadcastClaims(modelId);
    }

    /** 만료가 지나지 않은 표시만. 시각 비교는 애플리케이션 시각으로 한다(쓰기와 같은 시계). */
    public List<ErdClaimView> claims(String modelId) {
        return jdbc.query("""
                SELECT TABLE_UUID
                     , SESSION_NM
                     , USER_ID
                     , EXPIRES_AT
                  FROM TB_MDM_ERD_CLAIM
                 WHERE ERD_MODEL_ID = ?
                   AND EXPIRES_AT > ?
                 ORDER BY TABLE_UUID
                """, (rs, i) -> new ErdClaimView(rs.getString(1), rs.getString(2), rs.getString(3), rs.getTimestamp(4).toInstant().toString()),
                modelId, Timestamp.from(Instant.now()));
    }

    private void broadcastClaims(String modelId) {
        List<ErdClaimView> list = claims(modelId);
        for (Sub s : subs.getOrDefault(modelId, List.of())) send(s, "claim", list);
    }

    // ── 보내기 ────────────────────────────────────────────────────────

    private void pingAll() {
        Map<String, Object> body = Map.of("at", Instant.now().toString());
        subs.values().forEach(list -> list.forEach(s -> {
            try {
                send(s, "ping", body);
            } catch (RuntimeException e) { // 한 구독자의 오류가 주기 작업 전체를 멈추지 않게 한다
                log.warn("ERD SSE ping 실패 model={} session={}", s.modelId, s.session, e);
            }
        }));
    }

    /**
     * 이벤트 하나를 보낸다. 본문은 ErdModelCodec(Jackson 2)으로 만든 JSON 문자열이다 — Spring 의 Jackson 3 변환기를 거치지 않는다.
     * 직렬화 오류는 코드 결함이므로 그대로 던진다. 보내기(IO) 오류만 연결 끊김으로 보고 구독을 지운다.
     */
    private boolean send(Sub s, String name, Object body) {
        if (s.dropped) return false;
        String json;
        try {
            json = ErdModelCodec.MAPPER.writeValueAsString(body);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException("ERD SSE 본문 직렬화 실패: " + name, e);
        }
        try {
            synchronized (s) {
                s.emitter.send(SseEmitter.event().name(name).data(json));
            }
            return true;
        } catch (Exception e) {
            log.debug("[erd-sse] {} {} 보내기 실패 — 구독 해제: {}", s.modelId, s.session, e.toString());
            s.dropped = true;
            s.emitter.completeWithError(e);
            // 해제는 다른 구독자에게 presence 를 보내므로, 지금 잡은 잠금 밖(ping 스레드)에서 한다 — 두 구독의 잠금이 엇갈려 멈추지 않게.
            pinger.execute(() -> drop(s));
            return false;
        }
    }

    private static String key(String modelId, String session) {
        return modelId + "\u0000" + session;
    }
}
