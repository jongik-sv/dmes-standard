package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import com.dongkuk.dmes.cactus.common.ResponseCodeAware;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdChangesView;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdClaimResult;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdCommandService;
import jakarta.annotation.PreDestroy;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Semaphore;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 모델별 실시간 구독자 묶음(스펙 4.4·D16·D17). 서버 1대 가정(스펙 5절) — 구독·접속자는 메모리에, 작업 중 표시는 표에 둔다.
 * 델타는 rev 순서로 빠짐없이 보낸다: 구독 등록 → 재생 → 쌓인 실시간 델타, 그리고 중간이 빈 델타가 오면 명령 기록에서 채운다.
 *
 * <p>스레드와 연결(deferred 27):
 * <ul>
 *   <li>요청 스레드(커밋 뒤 발행·접속자·작업 중 표시)는 구독자별 상한 큐에 넣기만 한다. DB 를 읽거나 소켓에 쓰지 않는다.</li>
 *   <li>소켓 쓰기는 보내기 스레드({@code erd-sse-send})만 한다. 구독자 하나는 한 번에 한 스레드만 비운다. 스레드는 {@value #SEND_CORE}개에서
 *       {@value #SEND_MAX}개까지 늘어나므로 쓰기에 막힌 구독자 몇이 다른 구독자의 전달을 막지 않는다. 한 번의 쓰기가
 *       {@link #sendDeadlineMs}(기본 {@value #SEND_DEADLINE_MS}ms)를 넘으면 감시({@code erd-sse-ping})가 그 구독을 끊고 스레드를 깨운다.</li>
 *   <li>허브의 DB 읽기(재생·빈 칸 채우기·작업 중 표시 다시 읽기)는 {@value #DB_READERS}개만 동시에 한다 — Hikari 풀(로컬 3, 시험 2)보다 작게.
 *       어느 것도 구독자 잠금을 쥔 채 읽지 않는다. 재생·작업 중 표시 읽기는 읽기 스레드({@code erd-sse-read})가 하고 소켓에는 쓰지 않는다.</li>
 *   <li>큐가 넘치면(구독자가 {@value #QUEUE_CAP}건을 못 따라옴) 쌓인 이벤트를 버리고 {@code reload{rev}} 하나를 보낸 뒤 스트림을 닫는다.
 *       화면은 모델을 다시 읽고 sinceRev 로 다시 붙는다.</li>
 * </ul>
 */
@Component
public class ErdEventHub {

    private static final Logger log = LoggerFactory.getLogger(ErdEventHub.class);
    static final long PING_MS = 15_000;
    /** 읽기 스레드 수(재생·작업 중 표시 다시 읽기). 실제 DB 읽기 수는 {@link #DB_READERS} 가 묶는다. */
    static final int READ_THREADS = 2;
    /** 허브가 동시에 쓰는 풀 연결 수의 상한. 저장 요청이 연결을 쥐고 모델 행 잠금을 기다릴 때도 풀을 다 가져가지 않게 1. */
    static final int DB_READERS = 1;
    /** 보내기 스레드 기본 수와 상한. 상한을 넘으면 그 구독은 다음 넣기·ping 때 다시 예약한다. */
    static final int SEND_CORE = 4;
    static final int SEND_MAX = 32;
    /** 한 번의 소켓 쓰기 상한. 넘으면 읽지 않는 구독자(잠든 노트북, 프록시 역압)로 보고 끊는다. */
    static final long SEND_DEADLINE_MS = 10_000;
    /** 구독자별 큐 상한. 넘치면 reload 뒤 스트림을 닫는다. ping(15초)만 쌓여도 약 1시간 뒤에는 닫힌다. */
    static final int QUEUE_CAP = 256;
    /** MCP·CLI 시한 접속자의 수명(S2-11). 작업 중 표시 TTL(ErdEditService.CLAIM_TTL_SECONDS)과 같다. */
    static final long PRESENCE_TTL_SECONDS = 600;

    /** 큐 항목. delta 가 있으면 change(빈 칸 채우기·표시 행 포함), 없으면 이름 붙은 이벤트 하나. */
    private record Out(String name, Object body, ErdDelta delta) {
        static Out of(ErdDelta d) {
            return new Out(null, null, d);
        }

        static Out event(String name, Object body) {
            return new Out(name, body, null);
        }
    }

    /**
     * 구독 하나. 보내기는 이 객체로 동기화한다 — SseEmitter 는 동시 send 를 허용하지 않는다. 요청 스레드는 이 잠금을 잡지 않고
     * {@link #queue} 에 넣기만 한다. 재생 중에는 큐를 비우지 않는다(재생 읽기가 끝나면 비우기 스레드가 재생분부터 보낸다).
     */
    static final class Sub {
        final String modelId;
        final String session;
        /** 구독한 사용자(SUBSCRIBE version 의 userId). 시험용 구독은 null. */
        final String userId;
        final SseEmitter emitter;
        long lastRev = -1;
        volatile boolean replaying = true;
        volatile boolean dropped;
        /** 재생 읽기 결과. 비우기 스레드가 큐보다 먼저 보낸다. */
        volatile ErdChangesView replay;
        /** 재생과 같이 읽은 버전 상태(SUBSCRIBE). 재생분 바로 뒤에 보낸다. */
        volatile ErdVersionEvent replayVersion;
        long replaySince;
        final BlockingQueue<Out> queue = new ArrayBlockingQueue<>(QUEUE_CAP);
        /** 보내기 스레드가 이 구독을 비우는 중인가(한 번에 하나). */
        final AtomicBoolean draining = new AtomicBoolean();
        /** 큐가 넘쳤다 — 다음 비우기에서 reload 뒤 닫는다. */
        volatile boolean overflowed;
        /** 모델이 지워졌다(ERD 2차 §7.2) — 0 이상이면 다음 비우기에서 쌓인 것을 버리고 reload{이 rev} 뒤 닫는다. */
        volatile long closeRev = -1;
        /** 큐에 넣은 델타의 가장 큰 rev(넘침 때 reload 의 rev). */
        final AtomicLong maxRev = new AtomicLong(-1);
        /** 진행 중인 소켓 쓰기의 시작 시각(nanoTime, 0 = 쓰지 않는 중)과 그 스레드 — 감시가 본다. */
        volatile long sendingSince;
        volatile Thread sendingThread;

        Sub(String modelId, String session, String userId, SseEmitter emitter) {
            this.modelId = modelId;
            this.session = session;
            this.userId = userId;
            this.emitter = emitter;
        }
    }

    /** 모델별 작업 중 표시 다시 읽기. 한 모델은 한 번에 하나만 돌고, 도는 동안 들어온 요청은 끝난 뒤 한 번 더 읽는다(순서 보장). */
    private static final class ClaimRefresh {
        final AtomicBoolean dirty = new AtomicBoolean();
        final AtomicBoolean running = new AtomicBoolean();
    }

    private final Map<String, List<Consumer<ErdDelta>>> listeners = new ConcurrentHashMap<>();
    private final Map<String, List<Sub>> subs = new ConcurrentHashMap<>();
    /** 키: modelId + "\u0000" + session. */
    private final Map<String, ErdPresence> presence = new ConcurrentHashMap<>();

    /** MCP·CLI 시한 항목의 재료(S2-11). written = 마지막 반영 쓰기가 건드린 표, claimed = 그 세션의 작업 중 표시(표 → 만료 시각). */
    private record Timed(List<String> written, Map<String, Instant> claimed) {}

    /** 키는 presence 와 같다. 시한 항목을 만들고 지우는 일은 {@link #timedLock} 안에서 한다. */
    private final Map<String, Timed> timed = new ConcurrentHashMap<>();
    private final Object timedLock = new Object();
    private final Map<String, ClaimRefresh> claimRefresh = new ConcurrentHashMap<>();
    /** 지운 모델의 마지막 rev(reload 로 보낸 값). 같은 id 를 다시 등록하면 rev 를 여기서 잇는다 — 서버 1대·메모리(스펙 5절)라 재시작하면 잊는다. */
    private final Map<String, Long> deletedRevs = new ConcurrentHashMap<>();
    private final ObjectProvider<ErdCommandService> commandsProvider;
    private final JdbcTemplate jdbc;
    private final ScheduledExecutorService pinger;
    /** 재생 읽기와 작업 중 표시 다시 읽기. 소켓에는 쓰지 않는다. */
    private final ExecutorService reader;
    /** 구독자별 큐를 비우는 보내기 스레드. 소켓 쓰기는 여기서만 한다. */
    private final ThreadPoolExecutor sender;
    private final Semaphore dbReads = new Semaphore(DB_READERS, true);
    /** 소켓 쓰기 상한(ms). 시험이 줄인다. */
    volatile long sendDeadlineMs = SEND_DEADLINE_MS;

    /** ErdCommandService 는 이 허브를 받으므로 ObjectProvider 로 늦게 꺼낸다(순환 의존 회피). */
    public ErdEventHub(ObjectProvider<ErdCommandService> commandsProvider, JdbcTemplate jdbc) {
        this.commandsProvider = commandsProvider;
        this.jdbc = jdbc;
        // MDM 앱에는 @EnableScheduling 이 없다 — 허브가 스레드 하나를 직접 둔다(ping·막힌 쓰기 감시·해제).
        this.pinger = Executors.newSingleThreadScheduledExecutor(daemon("erd-sse-ping"));
        pinger.scheduleAtFixedRate(this::pingAll, PING_MS, PING_MS, TimeUnit.MILLISECONDS);
        pinger.scheduleAtFixedRate(this::dropStuckSenders, 1, 1, TimeUnit.SECONDS);
        this.reader = Executors.newFixedThreadPool(READ_THREADS, daemon("erd-sse-read"));
        this.sender = new ThreadPoolExecutor(SEND_CORE, SEND_MAX, 60, TimeUnit.SECONDS, new SynchronousQueue<>(), daemon("erd-sse-send"));
    }

    private static ThreadFactory daemon(String name) {
        return r -> {
            Thread t = new Thread(r, name);
            t.setDaemon(true);
            return t;
        };
    }

    @PreDestroy
    void close() {
        pinger.shutdownNow();
        reader.shutdownNow();
        sender.shutdownNow();
        subs.values().forEach(list -> list.forEach(s -> completeQuietly(s)));
    }

    /** 허브의 DB 읽기. 동시에 {@value #DB_READERS}개만 — 구독자 잠금을 쥐고 부르지 않는다. */
    private <T> T dbRead(Supplier<T> read) {
        dbReads.acquireUninterruptibly();
        try {
            return read.get();
        } finally {
            dbReads.release();
        }
    }

    // ── 델타 ──────────────────────────────────────────────────────────

    /**
     * 커밋 뒤에 불린다(OASIS 커밋 안의 afterCommit — 요청 스레드가 아직 연결을 쥐고 있다). 그래서 DB 를 읽거나 소켓에 쓰지 않고
     * 구독자별 큐에 넣기만 한다. 빈 칸 채우기(명령 기록 읽기)와 보내기는 보내기 스레드가 한다.
     */
    public void publish(ErdDelta delta) {
        for (Consumer<ErdDelta> l : listeners.getOrDefault(delta.modelId(), List.of())) {
            try {
                l.accept(delta);
            } catch (RuntimeException e) {
                log.warn("ERD 델타 구독자 처리 실패 model={} rev={}", delta.modelId(), delta.rev(), e);
            }
        }
        for (Sub s : subs.getOrDefault(delta.modelId(), List.of())) enqueue(s, Out.of(delta));
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
        SseEmitter emitter = newEmitter();
        Sub sub = new Sub(modelId, session, userId, emitter);
        // 0. 새 구독이면 등록 전에 hello 를 보낸다 — 등록 전이라 다른 스레드(presence·claim·델타)가 이 구독에 먼저 보낼 수 없다.
        //    hello 의 rev 는 등록 전에 읽었으므로, 그 뒤에 커밋된 델타는 아래 재생(helloRev 부터)이 채운다.
        if (sinceRev < 0 && !send(sub, "hello", Map.of("rev", helloRev))) return emitter;
        register(sub); // 1. 먼저 등록(실시간 델타는 큐에 쌓인다)
        Runnable drop = () -> drop(sub);
        emitter.onCompletion(drop);
        emitter.onTimeout(drop);
        emitter.onError(e -> drop.run());
        synchronized (timedLock) { // 시한 항목이 있었으면 SSE 항목으로 바꾼다(touchTimed 는 잠금 안에서 구독을 다시 본다)
            timed.remove(key(modelId, session));
            presence.put(key(modelId, session), new ErdPresence(session, userId, source, null, List.of(), Instant.now().toString()));
        }
        // 2·3. 재생 읽기(현재 rev 포함)는 등록 뒤 읽기 스레드에서 한다. 그 사이의 실시간 델타는 큐에 쌓이고, 보내기 스레드가 재생분을
        //      먼저 보낸 뒤 lastRev 보다 큰 것만 보낸다.
        reader.execute(() -> replay(sub, sinceRev >= 0 ? sinceRev : helloRev));
        broadcastPresence(modelId);
        refreshClaims(modelId); // 작업 중 표시 목록도 모델별 순서대로(모든 구독자에게 최신 목록)
        return emitter;
    }

    /** 구독 스트림. 0 = 시간 제한 없음 — 끊김은 ping 보내기 실패로 잡는다. 시험이 보낸 이벤트를 모으려고 바꾼다. */
    SseEmitter newEmitter() {
        return new SseEmitter(0L);
    }

    /** 시험용: 재생 없이 lastRev 부터 받는 구독을 붙인다(DB 없이 보내기 큐만 시험할 때). */
    void attachForTest(String modelId, String session, SseEmitter emitter, long lastRev) {
        Sub sub = new Sub(modelId, session, null, emitter);
        sub.lastRev = lastRev;
        sub.replaying = false;
        register(sub);
    }

    /** 구독 목록에 넣는다. 목록 만들기와 넣기를 키 단위로 한 번에 한다 — 빈 목록을 지우는 {@link #drop} 과 겹쳐도 구독이 사라지지 않는다. */
    private void register(Sub sub) {
        subs.compute(sub.modelId, (k, list) -> {
            List<Sub> l = list != null ? list : new CopyOnWriteArrayList<>();
            l.add(sub);
            return l;
        });
    }

    /** 시험용: 모델의 구독 수. */
    int subscriberCount(String modelId) {
        return subs.getOrDefault(modelId, List.of()).size();
    }

    /** 시험용: 재생 스레드가 명령 기록을 읽은 뒤, 보내기 전에 부른다. 이 사이에 낀 델타가 빠지거나 겹치지 않는지 확인하는 데 쓴다. */
    private volatile Runnable replayPauseForTest;

    public void setReplayPauseForTest(Runnable pause) {
        this.replayPauseForTest = pause;
    }

    /**
     * 재생 읽기(읽기 스레드). 읽은 결과를 구독에 걸어 두고 비우기를 예약한다 — 보내기는 보내기 스레드가 큐보다 먼저 한다.
     * 구독은 이미 등록되어 있으므로, 읽는 동안 커밋된 델타는 큐에 쌓였다가 lastRev 보다 큰 것만 나간다.
     */
    private void replay(Sub sub, long sinceRev) {
        try {
            record Read(ErdChangesView snapshot, ErdVersionEvent version) {}
            // 구독마다 버전 상태 하나(S2-12 SUBSCRIBE). 보내기는 재생분 바로 뒤, 큐(presence·claim·실시간 델타)보다 먼저다.
            Read read = dbRead(() -> new Read(commandsProvider.getObject().changesSince(sub.modelId, sinceRev),
                    versionNow(sub.modelId, "SUBSCRIBE", sub.userId)));
            Runnable pause = replayPauseForTest;
            if (pause != null) pause.run();
            synchronized (sub) {
                sub.replaySince = sinceRev;
                sub.replay = read.snapshot();
                sub.replayVersion = read.version();
                sub.replaying = false;
            }
            schedule(sub);
        } catch (RuntimeException e) {
            if (sub.closeRev >= 0 || isModelNotFound(e)) {
                // 재생 읽기 중에 모델이 지워졌다(ERD 2차 §7.2). 오류로 끊지 않고 reload 뒤 닫는다 — 화면은 다시 읽고 MDM029 를 받는다.
                // rev = 삭제가 정한 값(아직 커밋 뒤 콜백 전이면 허브가 아는 값, 그것도 없으면 sinceRev + 1).
                synchronized (sub) {
                    if (sub.closeRev < 0) sub.closeRev = deletedRevs.getOrDefault(sub.modelId, Math.max(0, sinceRev + 1));
                    sub.replaying = false;
                }
                schedule(sub);
                return;
            }
            log.warn("ERD SSE 재생 실패 model={} session={} — 구독 해제", sub.modelId, sub.session, e);
            sub.dropped = true;
            pinger.execute(() -> drop(sub));
            completeLater(sub, e);
        }
    }

    /** 재생분 보내기. 호출자(보내기 스레드)가 sub 를 잡고 있다. */
    private void sendReplay(Sub s, ErdChangesView snapshot, long sinceRev) {
        if (snapshot.reload()) {
            if (send(s, "reload", Map.of("rev", snapshot.rev()))) s.lastRev = snapshot.rev();
            return;
        }
        s.lastRev = Math.max(s.lastRev, sinceRev);
        for (ErdDelta d : snapshot.deltas()) {
            if (d.rev() <= s.lastRev) continue;
            if (!send(s, "change", d)) return;
            s.lastRev = d.rev();
        }
    }

    /**
     * 빈 칸 채우기 — 큐 맨 앞 델타보다 앞 rev 만 명령 기록에서 보낸다. 같은 rev 의 실시간 델타가 이미 큐에 있으면 그것을 보낸다.
     * 명령 기록의 델타는 rowVersion 이 없으므로(S2-16), 큐 맨 앞과 그 뒤 rev 는 큐에서 rowVersion 을 실은 채 나가게 한다.
     * 표시 델타(reload)면 sendReplay 와 같다. 호출자(보내기 스레드)가 sub 를 잡고 있다.
     */
    private void sendGap(Sub s, ErdChangesView snapshot, long sinceRev) {
        Out head = s.queue.peek();
        if (snapshot.reload() || head == null || head.delta() == null) {
            sendReplay(s, snapshot, sinceRev);
            return;
        }
        long below = head.delta().rev();
        Map<Long, ErdDelta> live = new HashMap<>();
        for (Out o : s.queue) if (o.delta() != null && o.delta().rev() < below) live.putIfAbsent(o.delta().rev(), o.delta());
        s.lastRev = Math.max(s.lastRev, sinceRev);
        for (ErdDelta d : snapshot.deltas()) {
            if (d.rev() <= s.lastRev) continue;
            if (d.rev() >= below) continue;
            if (!send(s, "change", live.getOrDefault(d.rev(), d))) return;
            s.lastRev = d.rev();
        }
    }

    /** JdbcTemplate 으로 읽고 바로 연결을 돌려준다. 없는 모델이면 ERD_MODEL_NOT_FOUND. */
    private long currentRev(String modelId) {
        return jdbc.query("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = ?", (rs, i) -> rs.getLong(1), modelId)
                .stream().findFirst().orElseThrow(() -> MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND));
    }

    /**
     * 델타 하나를 보낸다(빈 칸은 호출자가 먼저 채웠다). 호출자(보내기 스레드)가 sub 를 잡고 있다.
     * 표시 델타(DRAFT 삭제·새 DRAFT)는 change 대신 {@code reload{rev}} 로 보낸다 — 화면이 모델을 다시 읽으므로 그 앞의 빈 칸은 채우지 않는다.
     */
    private void deliver(Sub s, ErdDelta d) {
        if (d.rev() <= s.lastRev) return;
        if (ErdDelta.isMarker(d)) {
            if (send(s, "reload", Map.of("rev", d.rev()))) s.lastRev = d.rev();
            return;
        }
        if (send(s, "change", d)) s.lastRev = d.rev();
    }

    /** 빈 칸 채우기가 필요한가 — 다른 트랜잭션의 afterCommit 이 늦게 와서 앞 rev 가 아직 큐에 없다. 표시 델타는 채우지 않는다. */
    private static boolean needsCatchUp(Sub s, ErdDelta d) {
        return d.rev() > s.lastRev + 1 && !ErdDelta.isMarker(d);
    }

    // ── 모델 삭제(ERD 2차 §7.2) ─────────────────────────────────────────

    /**
     * 모델 완전 삭제 뒤 알림. 커밋 뒤(트랜잭션 밖이면 바로) 그 모델의 구독자마다 쌓인 이벤트를 버리고 {@code reload{rev}} 하나를 보낸 뒤
     * 스트림을 닫는다 — 화면은 이미 아는 reload 로 모델을 다시 읽고, ERD_MODEL_NOT_FOUND 를 받아 시작 화면으로 간다. 새 이벤트 이름은
     * 화면이 모르면 버려지므로 쓰지 않는다. 소켓 쓰기는 보내기 스레드가 한다(요청 스레드는 표시만 한다). 접속자(시한 항목 포함)와
     * 작업 중 표시 다시 읽기 상태도 지운다. 롤백되면 돌지 않는다. 이 뒤에 붙는 구독은 rev 읽기에서 ERD_MODEL_NOT_FOUND(404)다.
     *
     * @param rev 삭제 직전 rev + 1(화면이 지금 rev 보다 큰 값을 받게)
     */
    public void modelDeleted(String modelId, long rev) {
        afterCommit(() -> {
            deletedRevs.merge(modelId, Math.max(0, rev), Math::max);
            for (Sub s : subs.getOrDefault(modelId, List.of())) {
                s.closeRev = Math.max(0, rev);
                schedule(s);
            }
            String prefix = modelId + "\u0000";
            synchronized (timedLock) {
                presence.keySet().removeIf(k -> k.startsWith(prefix));
                timed.keySet().removeIf(k -> k.startsWith(prefix));
            }
            claimRefresh.remove(modelId);
        });
    }

    /** 이 서버가 지운 같은 id 모델의 마지막 rev. 다시 등록할 때 rev 를 이어 쓰는 데 쓴다(ErdVersionService.createModel). */
    public Optional<Long> deletedRev(String modelId) {
        return Optional.ofNullable(deletedRevs.get(modelId));
    }

    /** 응답 코드가 ERD_MODEL_NOT_FOUND 인 예외인가(원인 사슬 포함). */
    static boolean isModelNotFound(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof ResponseCodeAware r && MdmErrorCode.ERD_MODEL_NOT_FOUND.code().equals(r.responseCode())) return true;
            if (t.getCause() == t) break;
        }
        return false;
    }

    // ── 버전 이벤트(S2-12) ─────────────────────────────────────────────

    /**
     * 지금 버전 상태 — view(ver 없음)가 돌려줄 값과 같다: DRAFT 가 있으면 그것, 없으면 가장 높은 RELEASED. 버전 행이 없으면 null.
     * JdbcTemplate 으로 읽는다. 동작 뒤 이벤트는 호출자(ErdEditService)가 같은 트랜잭션 안에서 영속성 문맥을 내보낸 뒤 부른다 —
     * 엔티티는 네이티브 CAS 뒤에 낡은 값을 가질 수 있다. 구독 직후 이벤트는 읽기 스레드가 {@link #dbRead} 안에서 부른다.
     */
    public ErdVersionEvent versionNow(String modelId, String reason, String userId) {
        record Row(BigDecimal ver, String status, String ownerId, long rowVersion) {}
        List<Row> rows = jdbc.query("""
                SELECT VER
                     , STATUS
                     , OWNER_ID
                     , ROW_VERSION
                  FROM TB_MDM_ERD_MODEL_VER
                 WHERE ERD_MODEL_ID = ?
                   AND STATUS IN ('DRAFT', 'RELEASED')
                 ORDER BY CASE STATUS WHEN 'DRAFT' THEN 0 ELSE 1 END
                        , VER DESC
                """, (rs, i) -> new Row(rs.getBigDecimal(1), rs.getString(2), rs.getString(3), rs.getLong(4)), modelId);
        if (rows.isEmpty()) return null;
        Row v = rows.get(0);
        List<String> editors = jdbc.queryForList(
                "SELECT USER_ID FROM TB_MDM_ERD_EDITOR WHERE ERD_MODEL_ID = ? AND VER = ? ORDER BY USER_ID",
                String.class, modelId, v.ver());
        return new ErdVersionEvent(modelId, VersionNumbers.plain(v.ver()), v.status(), v.ownerId(), List.copyOf(editors),
                v.rowVersion(), reason, userId, Instant.now().toString());
    }

    /** 버전 이벤트를 커밋 뒤에(트랜잭션 밖이면 바로) 그 모델의 구독자 큐에 넣는다. 소켓 쓰기는 보내기 스레드가 한다. */
    public void publishVersion(ErdVersionEvent event) {
        afterCommit(() -> {
            for (Sub s : subs.getOrDefault(event.modelId(), List.of())) enqueue(s, Out.event("version", event));
        });
    }

    // ── 접속자 ────────────────────────────────────────────────────────

    public List<ErdPresence> presence(String modelId) {
        String prefix = modelId + "\u0000";
        return presence.entrySet().stream().filter(e -> e.getKey().startsWith(prefix)).map(Map.Entry::getValue)
                .sorted(Comparator.comparing(ErdPresence::session)).toList();
    }

    /** 화면 상태 갱신(SET_VIEW). 실시간 채널에 붙은 세션만 바꿀 수 있다 — 없거나 시한 항목(MCP·CLI)이면 false. */
    public boolean updateView(String modelId, String session, String diagramId, List<String> selectedTables) {
        boolean[] hit = {false};
        presence.computeIfPresent(key(modelId, session), (k, p) -> {
            if (p.expiresAt() != null) return p;
            hit[0] = true;
            return new ErdPresence(p.session(), p.userId(), p.source(), diagramId, List.copyOf(selectedTables),
                    Instant.now().toString());
        });
        if (!hit[0]) return false;
        broadcastPresence(modelId);
        return true;
    }

    private void broadcastPresence(String modelId) {
        List<ErdPresence> list = presence(modelId);
        for (Sub s : subs.getOrDefault(modelId, List.of())) enqueue(s, Out.event("presence", list));
    }

    /** 시한 접속자를 만드는 출처. UI 는 SSE 구독이 접속자를 만든다. */
    public static boolean isTimedSource(String source) {
        return "MCP".equals(source) || "CLI".equals(source);
    }

    /**
     * MCP·CLI 요청의 시한 접속자(S2-11). touchedTables 가 null 이면 읽기다 — 표 목록은 그대로 두고 만료만 늘린다. 반영된 쓰기는
     * 커밋 뒤 콜백에서 건드린 표를 넘긴다(DB 를 읽지 않는다). 같은 모델·세션의 SSE 구독이 있으면 아무것도 하지 않는다.
     */
    public void touch(String modelId, String session, String userId, String source, List<String> touchedTables) {
        touchTimed(modelId, session, userId, source,
                touchedTables == null ? null : List.copyOf(new TreeSet<>(touchedTables)), null);
    }

    /**
     * CLAIM·RELEASE 뒤: 그 세션의 작업 중 표시 부분을 다시 정한다. claims 는 호출자가 같은 트랜잭션 연결로 읽은 그 모델의 목록이다.
     * 반영은 커밋 뒤에 한다 — claim 이벤트 뒤에 presence 가 가고, 되돌린 트랜잭션은 접속자 표시를 바꾸지 않는다.
     */
    public void touchClaims(String modelId, String session, String userId, String source, List<ErdClaimView> claims) {
        Map<String, Instant> mine = new TreeMap<>();
        for (ErdClaimView cl : claims) {
            if (cl.session().equals(session)) mine.put(cl.tableId(), Instant.parse(cl.expiresAt()));
        }
        afterCommit(() -> touchTimed(modelId, session, userId, source, null, mine));
    }

    /** 새로 생기거나 selectedTables 가 바뀌면 방송한다. 만료만 늘면 방송하지 않는다. */
    private void touchTimed(String modelId, String session, String userId, String source,
                            List<String> written, Map<String, Instant> claimed) {
        if (session == null || session.isBlank() || !isTimedSource(source)) return;
        if (subs.getOrDefault(modelId, List.of()).stream().anyMatch(s -> !s.dropped && s.session.equals(session))) return;
        String k = key(modelId, session);
        Instant now = Instant.now();
        boolean changed;
        synchronized (timedLock) {
            // 잠금 밖 검사와 여기 사이에 같은 세션이 구독했으면 SSE 항목을 덮지 않는다(subscribe 는 등록 뒤 이 잠금 안에서 항목을 둔다)
            if (subs.getOrDefault(modelId, List.of()).stream().anyMatch(s -> !s.dropped && s.session.equals(session))) return;
            Timed old = timed.getOrDefault(k, new Timed(List.of(), Map.of()));
            Timed t = new Timed(written != null ? written : old.written(), claimed != null ? claimed : old.claimed());
            timed.put(k, t);
            TreeSet<String> tables = new TreeSet<>(t.written());
            t.claimed().forEach((table, until) -> {
                if (until.isAfter(now)) tables.add(table);
            });
            List<String> selected = List.copyOf(tables);
            ErdPresence prev = presence.put(k, new ErdPresence(session, userId, source, null, selected, now.toString(),
                    now.plusSeconds(PRESENCE_TTL_SECONDS).toString()));
            changed = prev == null || prev.expiresAt() == null || !prev.selectedTables().equals(selected);
        }
        if (changed) broadcastPresence(modelId);
    }

    /**
     * 시한 접속자 정리(S2-11). 핑 주기(15초)가 지금 시각으로 부른다. expiresAt 이 now 이전인 항목을 지우고, 지운 것이 있는 모델에만
     * presence 를 다시 방송한다(지운 것이 없으면 아무것도 보내지 않는다). 시험은 600초 뒤 시각을 넣어 부른다.
     */
    public void sweepPresence(Instant now) {
        Set<String> models = new HashSet<>();
        synchronized (timedLock) {
            for (Map.Entry<String, ErdPresence> e : presence.entrySet()) {
                String exp = e.getValue().expiresAt();
                if (exp == null || Instant.parse(exp).isAfter(now)) continue;
                if (presence.remove(e.getKey(), e.getValue())) {
                    timed.remove(e.getKey());
                    models.add(e.getKey().substring(0, e.getKey().indexOf('\u0000')));
                }
            }
        }
        models.forEach(this::broadcastPresence);
    }

    /** 구독 해제. 여러 번 불려도 한 번만 처리한다(onCompletion·onError·보내기 실패·감시가 겹친다). */
    private void drop(Sub sub) {
        sub.dropped = true;
        boolean[] removed = {false};
        // 지우고 비면 키도 지운다(지운 모델의 빈 목록이 남지 않게). register 와 같은 키 단위 원자 동작이다.
        subs.computeIfPresent(sub.modelId, (k, l) -> {
            removed[0] = l.remove(sub);
            return l.isEmpty() ? null : l;
        });
        if (!removed[0]) return;
        List<Sub> list = subs.getOrDefault(sub.modelId, List.of());
        // 같은 세션이 다시 붙어 있으면(재연결이 겹친 경우) 접속자 표시는 남긴다.
        if (list.stream().noneMatch(s -> s.session.equals(sub.session))) {
            synchronized (timedLock) {
                timed.remove(key(sub.modelId, sub.session));
                presence.remove(key(sub.modelId, sub.session));
            }
            broadcastPresence(sub.modelId);
        }
    }

    // ── 작업 중 표시(TB_MDM_ERD_CLAIM) ──────────────────────────────────

    /**
     * 표 하나를 작업 중으로 표시하고 지금 그 표를 쥔 세션을 돌려준다(S2-26). 다른 세션이 아직 만료되지 않은 표시를 갖고 있으면 빼앗지 않고
     * ok=false 와 그 세션을 준다. 같은 표를 다른 세션이 동시에 처음 표시해 키가 겹치면 Oracle 은 상대 커밋까지 기다린 뒤 키 위반을 내고,
     * 그 뒤 커밋된 상대 행을 읽는다. 그 사이에 상대 표시가 만료·해제되어 읽을 행이 없을 때만 셋 다 null 이다. 호출자 트랜잭션(OASIS)이 있으면 그 연결로 쓰고 읽으며, 방송은 커밋 뒤에 한다({@link #afterCommit}).
     */
    public ErdClaimResult claimFor(String modelId, String tableId, String session, String userId, long ttlSeconds) {
        Instant at = Instant.now().truncatedTo(ChronoUnit.MICROS); // EXPIRES_AT 은 TIMESTAMP(6) — 돌려주는 글과 저장 값을 같게
        Timestamp now = Timestamp.from(at);
        Instant until = at.plusSeconds(ttlSeconds);
        Timestamp untilTs = Timestamp.from(until);
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
                """, modelId, tableId, session, userId, untilTs, userId, now, session, now,
                    session, userId, untilTs, userId, now, userId, now);
        } catch (DuplicateKeyException e) {
            n = 0; // 같은 표를 다른 세션이 동시에 처음 표시했다 — 먼저 들어간 쪽이 이긴다
        } catch (DataIntegrityViolationException e) {
            // 모델 삭제(ERD 2차 §7.2)와 겹쳤다 — 부모 모델 행이 사라져 FK 위반(ORA-02291). 원시 오류(S001) 대신 ERD_MODEL_NOT_FOUND.
            // 이 경로는 저장 잠금(모델 행)을 기다리지 않는다 — 풀 연결을 아끼려고 잠그지 않고 FK 로 판정한다.
            if (!String.valueOf(e.getMostSpecificCause().getMessage()).contains("FK_TB_MDM_ERD_CLAIM_MODEL")) throw e;
            throw MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND);
        }
        if (n > 0) {
            afterCommit(() -> refreshClaims(modelId));
            return new ErdClaimResult(true, session, userId, until.toString());
        }
        return holder(modelId, tableId)
                .map(h -> new ErdClaimResult(false, h.session(), h.userId(), h.expiresAt()))
                .orElseGet(() -> new ErdClaimResult(false, null, null, null));
    }

    /** 단계 1 모양(성공 여부만). */
    public boolean claim(String modelId, String tableId, String session, String userId, long ttlSeconds) {
        return claimFor(modelId, tableId, session, userId, ttlSeconds).ok();
    }

    /** 지금 그 표를 쥔 살아 있는 표시. 호출자 트랜잭션 연결로 읽는다. */
    private Optional<ErdClaimView> holder(String modelId, String tableId) {
        return jdbc.query("""
                SELECT TABLE_UUID
                     , SESSION_NM
                     , USER_ID
                     , EXPIRES_AT
                  FROM TB_MDM_ERD_CLAIM
                 WHERE ERD_MODEL_ID = ?
                   AND TABLE_UUID = ?
                   AND EXPIRES_AT > ?
                """, (rs, i) -> new ErdClaimView(rs.getString(1), rs.getString(2), rs.getString(3),
                        rs.getTimestamp(4).toInstant().toString()), modelId, tableId, Timestamp.from(Instant.now()))
                .stream().findFirst();
    }

    /** 작업 중 표시를 지운다. 쓰기·방송 시점은 {@link #claim} 과 같다. */
    public void release(String modelId, String tableId, String session) {
        int n = jdbc.update("DELETE FROM TB_MDM_ERD_CLAIM WHERE ERD_MODEL_ID = ? AND TABLE_UUID = ? AND SESSION_NM = ?",
                modelId, tableId, session);
        if (n > 0) afterCommit(() -> refreshClaims(modelId));
    }

    /** 트랜잭션 안이면 커밋 뒤에, 밖이면(자동 커밋) 바로 돈다. 롤백되면 돌지 않는다. */
    private static void afterCommit(Runnable r) {
        if (TransactionSynchronizationManager.isSynchronizationActive() && TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    r.run();
                }
            });
        } else {
            r.run();
        }
    }

    /**
     * 작업 중 표시 목록을 다시 읽어 방송하도록 예약한다(막지 않는다). 읽기 스레드에서 모델마다 하나씩 돈다 — 돌고 있으면 끝난 뒤 한 번 더
     * 읽으므로 CLAIM·RELEASE 가 잇달아 커밋돼도 마지막으로 나가는 목록은 마지막 커밋 뒤의 것이다. 구독자가 없으면 읽지 않는다.
     */
    private void refreshClaims(String modelId) {
        ClaimRefresh r = claimRefresh.computeIfAbsent(modelId, k -> new ClaimRefresh());
        r.dirty.set(true);
        if (!r.running.compareAndSet(false, true)) return;
        try {
            reader.execute(() -> runClaimRefresh(modelId, r));
        } catch (RejectedExecutionException e) {
            r.running.set(false); // 종료 중
        }
    }

    private void runClaimRefresh(String modelId, ClaimRefresh r) {
        try {
            while (r.dirty.getAndSet(false)) {
                if (subs.getOrDefault(modelId, List.of()).isEmpty()) continue;
                List<ErdClaimView> list = dbRead(() -> claims(modelId));
                for (Sub s : subs.getOrDefault(modelId, List.of())) enqueue(s, Out.event("claim", list));
            }
        } catch (RuntimeException e) {
            log.warn("ERD 작업 중 표시 방송 실패 model={}", modelId, e);
        } finally {
            r.running.set(false);
            if (r.dirty.get()) refreshClaims(modelId); // 끝내는 사이에 들어온 요청
        }
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

    // ── 보내기 ────────────────────────────────────────────────────────

    private void pingAll() {
        try {
            sweepPresence(Instant.now());
        } catch (RuntimeException e) {
            log.warn("ERD 시한 접속자 정리 실패", e);
        }
        Map<String, Object> body = Map.of("at", Instant.now().toString());
        subs.values().forEach(list -> list.forEach(s -> enqueue(s, Out.event("ping", body))));
    }

    /**
     * 감시(1초마다): 소켓 쓰기 하나가 상한을 넘은 구독을 끊는다. 쓰던 스레드를 깨우고(interrupt), 구독 목록·접속자에서 빼고,
     * 스트림 닫기는 따로 띄운 스레드에서 한다 — 닫기도 막힌 쓰기와 같은 잠금을 기다릴 수 있어 이 스레드가 멈추면 안 된다.
     */
    private void dropStuckSenders() {
        long now = System.nanoTime();
        long limit = TimeUnit.MILLISECONDS.toNanos(sendDeadlineMs);
        subs.values().forEach(list -> list.forEach(s -> {
            long since = s.sendingSince;
            if (since == 0 || now - since <= limit || s.dropped) return;
            log.warn("[erd-sse] {} {} 쓰기가 {}ms 를 넘었다 — 읽지 않는 구독자로 보고 끊는다", s.modelId, s.session, sendDeadlineMs);
            s.dropped = true;
            Thread t = s.sendingThread;
            if (t != null && s.sendingSince == since) t.interrupt(); // 그 쓰기가 아직 진행 중일 때만 깨운다
            drop(s);
            completeLater(s, new java.io.IOException("ERD SSE 쓰기 시간 초과"));
        }));
    }

    /**
     * 스트림을 닫는다. 컨테이너가 onError 를 이미 처리했으면 complete 가 IllegalStateException 을 던진다("non-container thread … after an error") —
     * 이미 닫힌 것이므로 삼킨다. 새면 {@link #drain} 의 catch 가 "전달 실패" WARN 을 스택째 남겨 로그가 넘친다.
     */
    private static void completeQuietly(Sub s) {
        try {
            s.emitter.complete();
        } catch (RuntimeException e) {
            log.debug("[erd-sse] {} {} 이미 닫힌 스트림 — complete 무시: {}", s.modelId, s.session, e.toString());
        }
    }

    /** {@link #completeQuietly} 와 같은 이유로, 오류로 닫을 때 던지는 예외를 삼킨다. */
    private static void completeWithErrorQuietly(Sub s, Throwable cause) {
        try {
            s.emitter.completeWithError(cause);
        } catch (RuntimeException e) {
            log.debug("[erd-sse] {} {} 이미 닫힌 스트림 — completeWithError 무시: {}", s.modelId, s.session, e.toString());
        }
    }

    /** 막지 않고 스트림을 닫는다(닫기가 진행 중인 쓰기의 잠금을 기다릴 수 있다). */
    private static void completeLater(Sub s, Throwable cause) {
        Thread t = new Thread(() -> {
            try {
                s.emitter.completeWithError(cause);
            } catch (RuntimeException ignored) {
                // 이미 닫혔다
            }
        }, "erd-sse-close");
        t.setDaemon(true);
        t.start();
    }

    /**
     * 큐에 넣고 비우기를 예약한다. 막지 않는다 — 요청 스레드가 부른다. 넘치면 쌓인 것을 버리고 넘침 표시만 남긴다
     * (다음 비우기가 reload 뒤 닫는다). 큐가 다 차 있는 동안 들어온 델타도 reload 가 덮는다.
     */
    private void enqueue(Sub s, Out o) {
        if (s.dropped) return;
        if (o.delta() != null) s.maxRev.accumulateAndGet(o.delta().rev(), Math::max);
        if (!s.queue.offer(o)) {
            if (!s.overflowed) log.info("[erd-sse] {} {} 큐 넘침({}건) — reload 뒤 닫는다", s.modelId, s.session, QUEUE_CAP);
            s.overflowed = true;
            s.queue.clear();
        }
        schedule(s);
    }

    /** 이 구독을 비우는 보내기 스레드가 없으면 하나 띄운다. 재생 읽기 중이면 읽기가 끝날 때 띄운다. 스레드가 상한이면 다음 넣기·ping 때. */
    private void schedule(Sub s) {
        if (s.replaying || s.dropped || !s.draining.compareAndSet(false, true)) return;
        try {
            sender.execute(() -> drain(s));
        } catch (RejectedExecutionException e) {
            s.draining.set(false); // 종료 중이거나 보내기 스레드가 모두 막혔다
        }
    }

    /**
     * 보내기 스레드: 재생분, 그다음 큐를 하나씩 보낸다. 항목마다 sub 를 잡는다. 빈 칸 채우기(명령 기록 읽기)는 sub 잠금 밖에서 하고,
     * 읽은 뒤 다시 잡아 보낸다 — 저장들이 연결을 쥐고 있어 읽기가 늦어도 다른 스레드(감시·재생)가 이 구독에서 막히지 않는다.
     */
    private void drain(Sub s) {
        Thread.interrupted(); // 앞서 끊긴 구독의 감시 interrupt 가 남아 있으면 지운다
        try {
            while (!s.dropped) {
                long gapFrom;
                synchronized (s) {
                    if (s.replaying) return;
                    ErdChangesView replay = s.replay;
                    if (replay != null) {
                        s.replay = null;
                        sendReplay(s, replay, s.replaySince);
                        ErdVersionEvent version = s.replayVersion;
                        s.replayVersion = null;
                        if (version != null && !s.dropped) send(s, "version", version);
                        continue;
                    }
                    if (s.overflowed || s.closeRev >= 0) {
                        closeWithReload(s);
                        return;
                    }
                    Out o = s.queue.peek();
                    if (o == null) return;
                    if (o.delta() == null || !needsCatchUp(s, o.delta())) {
                        s.queue.poll();
                        if (o.delta() != null) deliver(s, o.delta());
                        else send(s, o.name(), o.body());
                        continue;
                    }
                    gapFrom = s.lastRev;
                }
                ErdChangesView v = dbRead(() -> commandsProvider.getObject().changesSince(s.modelId, gapFrom));
                synchronized (s) {
                    if (s.overflowed || s.closeRev >= 0 || s.dropped) continue; // 읽는 사이에 넘쳤다(모델이 지워졌다) — 다음 바퀴가 reload 뒤 닫는다
                    if (s.lastRev == gapFrom) sendGap(s, v, gapFrom); // 사이에 다른 경로가 lastRev 를 옮기지 않았을 때만
                    // 채운 뒤에도 빈 칸이 남으면(기록이 아직 그 rev 를 모름) 그 델타는 그대로 보낸다 — 다시 읽기를 되풀이하지 않는다.
                    Out o = s.queue.poll();
                    if (o != null) {
                        if (o.delta() != null) deliver(s, o.delta());
                        else send(s, o.name(), o.body());
                    }
                }
            }
        } catch (RuntimeException e) {
            // 보내기(IO) 오류는 send 가 이미 처리했다. 여기는 그 밖의 실패(직렬화·명령 기록 읽기 등) — 멈춘 채 남지 않게 끊는다.
            log.warn("ERD SSE 전달 실패 model={} session={} — 구독 해제", s.modelId, s.session, e);
            s.dropped = true;
            pinger.execute(() -> drop(s));
            completeLater(s, e);
        } finally {
            s.draining.set(false);
            if (s.overflowed || s.closeRev >= 0 || s.replay != null || !s.queue.isEmpty()) schedule(s); // 비우는 사이에 들어온 항목
        }
    }

    /**
     * 넘친 구독: reload{rev} 하나를 보내고 닫는다. 화면은 모델을 다시 읽고 sinceRev 로 다시 붙는다. 지워진 모델의 구독({@link #modelDeleted})도
     * 같은 길로 닫는다 — 그때 rev 는 삭제가 정한 값이다. 호출자가 sub 를 잡고 있다.
     */
    private void closeWithReload(Sub s) {
        long rev = s.closeRev >= 0 ? s.closeRev : Math.max(0, Math.max(s.lastRev, s.maxRev.get()));
        s.queue.clear();
        if (send(s, "reload", Map.of("rev", rev))) {
            s.dropped = true;
            completeQuietly(s);
            pinger.execute(() -> drop(s));
        }
    }

    /**
     * 이벤트 하나를 보낸다. 본문은 ErdModelCodec(Jackson 2)으로 만든 JSON 문자열이다 — Spring 의 Jackson 3 변환기를 거치지 않는다.
     * 직렬화 오류는 코드 결함이므로 그대로 던진다. 보내기(IO) 오류만 연결 끊김으로 보고 구독을 지운다. 쓰는 동안 시작 시각을 남겨
     * 감시({@link #dropStuckSenders})가 막힌 쓰기를 찾는다.
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
                s.sendingThread = Thread.currentThread();
                long started = System.nanoTime();
                s.sendingSince = started == 0 ? 1 : started;
                try {
                    s.emitter.send(SseEmitter.event().name(name).data(json));
                } finally {
                    s.sendingSince = 0;
                    s.sendingThread = null;
                }
            }
            return true;
        } catch (Exception e) {
            log.debug("[erd-sse] {} {} 보내기 실패 — 구독 해제: {}", s.modelId, s.session, e.toString());
            boolean first = !s.dropped;
            s.dropped = true;
            Thread.interrupted(); // 감시가 깨운 interrupt 를 이 스레드(풀)에 남기지 않는다
            if (first) completeWithErrorQuietly(s, e);
            // 해제는 다른 구독자에게 presence 를 보내므로, 지금 잡은 잠금 밖(ping 스레드)에서 한다.
            pinger.execute(() -> drop(s));
            return false;
        }
    }

    private static String key(String modelId, String session) {
        return modelId + "\u0000" + session;
    }
}
