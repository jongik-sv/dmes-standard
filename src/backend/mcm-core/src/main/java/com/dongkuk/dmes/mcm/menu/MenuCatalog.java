package com.dongkuk.dmes.mcm.menu;

import com.dongkuk.dmes.mcm.common.event.MenuChangedEvent;
import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.repository.SecMenuRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 메뉴 카탈로그 — {@code TB_MCM_SEC_MENU}·{@code TB_MCM_SEC_OBJ} 전수 목록을 한 곳에서 읽고 캐시한다.
 *
 * <p>내 메뉴({@code SecUserService.getMyMenus})·즐겨찾기·기본 화면·화면 사용 통계가 요청마다 두 테이블을
 * {@code findAll()} 하던 것을 이 빈 하나로 모았다. 사용자별 권한 필터는 호출부가 요청마다 그대로 한다 —
 * 여기 담기는 것은 사용자와 무관한 전수 목록뿐이다. 메뉴 폴더({@code TB_MCM_SEC_MENU_FLD})는 담지 않는다.
 *
 * <p><b>캐시</b> — 의존 추가 없이 {@code volatile} 불변 스냅샷(List.copyOf·수정 불가 맵) + TTL({@value #TTL_MINUTES}분)
 * ({@code widget.ext.ExchangeAllowList} 관례). 만료·무효화 뒤 첫 호출이 두 테이블을 한 번씩 읽어 다시 채운다.
 * 동시에 여러 요청이 들어와도 다시 읽기는 한 번만 한다(잠금). 읽는 도중 무효화가 오면 읽은 결과를 그 호출에만
 * 돌려주고 저장하지 않는다(세대 번호) — 무효화가 묻히지 않게 하기 위해서다. 무효화는 잠금을 잡지 않으므로 세대 확인과
 * 저장 사이에 끼어들 수 있다. 그래서 저장한 스냅샷에도 적재 때의 세대를 담고, 읽을 때 현재 세대와 다르면 버린다 —
 * 무효화 뒤에 늦게 써진 옛 스냅샷도 다음 읽기에서 다시 읽힌다.
 *
 * <p><b>무효화</b> — {@link MenuChangedEvent}(메뉴·폴더·OBJECT 저장)와 {@link RoleChangedEvent} 를 받으면 비운다.
 * <ol>
 *   <li>발행 즉시 한 번({@code @EventListener}).</li>
 *   <li>트랜잭션 커밋 뒤 한 번 더({@code @TransactionalEventListener(AFTER_COMMIT, fallbackExecution = true)}).
 *       업무 서비스는 {@code @Transactional} 없이 OASIS 가 BPMN 프로세스 단위로 트랜잭션을 감싸므로 이벤트는 커밋 전에 나간다.
 *       1번과 커밋 사이에 다른 요청이 옛 데이터로 다시 채울 수 있어 커밋 뒤에 한 번 더 비운다.
 *       트랜잭션이 없으면(fallback) 발행 즉시 실행된다.</li>
 * </ol>
 * 두 리스너 모두 예외를 밖으로 던지지 않는다 — WARN 로그만 남긴다. 커밋 뒤 리스너의 예외가 밖으로 나가면 DB 는 이미
 * 커밋됐는데 OASIS 응답은 S001 실패로 나가기 때문이다. 이벤트는 같은 JVM 안에서만 전달되므로 다른 인스턴스·운영자의
 * 직접 SQL·DataInitializer 시드는 TTL 로만 반영된다.
 *
 * <p><b>캐시된 엔티티는 읽기 전용이다.</b> 반환하는 {@link SecMenu}·{@link SecObj} 는 모든 요청이 함께 쓰는 같은
 * 인스턴스이며, 처음 읽은 요청의 영속성 컨텍스트에서 나온 것이다. 호출부는 setter 를 부르거나 {@code save} 하지 않는다
 * ({@code McmAuditListener} 가 걸려 있어 다시 저장하면 감사 컬럼까지 바뀐다). 메뉴·OBJECT 를 쓰는 서비스
 * ({@code CommMenuMngService}·{@code CommObjMngService})는 이 카탈로그로 읽지 않고 저장소로 직접 읽는다 — 같은
 * 트랜잭션 안에서는 {@code findById} 가 캐시된 인스턴스 자체를 돌려줄 수 있기 때문이다. 목록·맵은 불변이다.
 *
 * <p>패키지 — {@code mcm.common} 아래에 두면 {@code common → repository → common} 슬라이스 사이클이 생겨
 * 첫 단계 패키지 {@code mcm.menu} 에 둔다. 이 패키지는 entity·repository·common 만 쓴다.
 */
@Component
public class MenuCatalog {

    static final long TTL_MINUTES = 5;
    static final Duration TTL = Duration.ofMinutes(TTL_MINUTES);

    private static final Logger log = LoggerFactory.getLogger(MenuCatalog.class);

    /**
     * 한 시점의 전수 목록 — 모두 불변. 같은 스냅샷 안의 메뉴·OBJECT 는 같은 적재에서 나왔다.
     *
     * @param menus       TB_MCM_SEC_MENU 전 행 ({@code findAll} 순서)
     * @param objects     TB_MCM_SEC_OBJ 전 행 ({@code findAll} 순서)
     * @param menusById   MENU_ID → 메뉴 (같은 MENU_ID 가 여럿이면 처음 행)
     * @param objectsById OBJECT_ID → OBJECT
     */
    public record Snapshot(List<SecMenu> menus,
                           List<SecObj> objects,
                           Map<String, SecMenu> menusById,
                           Map<String, SecObj> objectsById) {

        /**
         * 두 목록으로 불변 스냅샷을 만든다. ID 가 null 인 행은 맵에서 뺀다(목록에는 남긴다).
         * 맵은 {@link Map#copyOf} 대신 수정 불가 뷰로 감싼다 — 호출부가 {@code get(null)} 을 부를 수 있어
         * (이전 {@code HashMap} 과 같이) null 을 돌려줘야 하기 때문이다. 원본 맵은 여기서만 만들고 밖에 내보내지 않는다.
         */
        public static Snapshot of(Collection<SecMenu> menus, Collection<SecObj> objects) {
            Map<String, SecMenu> menuById = new HashMap<>();
            for (SecMenu m : menus) {
                if (m.getMenuId() != null) menuById.putIfAbsent(m.getMenuId(), m);
            }
            Map<String, SecObj> objById = new HashMap<>();
            for (SecObj o : objects) {
                if (o.getObjectId() != null) objById.put(o.getObjectId(), o);
            }
            return new Snapshot(List.copyOf(menus), List.copyOf(objects),
                    Collections.unmodifiableMap(menuById), Collections.unmodifiableMap(objById));
        }
    }

    /** 저장된 스냅샷 — {@code gen} 은 적재를 시작할 때의 세대. 현재 세대와 다르면 그 사이 무효화가 있었으므로 버린다. */
    private record Cached(Snapshot snapshot, Instant expiresAt, long gen) {}

    private final SecMenuRepository secMenuRepository;
    private final SecObjRepository secObjRepository;
    private final Clock clock;
    private final Duration ttl;
    private final Object loadLock = new Object();
    /**
     * 무효화할 때마다 1 증가 — 적재 중 무효화가 오면 그 적재 결과는 저장하지 않고, 이미 저장된 것도 세대가 다르면 쓰지 않는다.
     * 패키지 공개는 시험이 경쟁 뒤 상태(세대만 오르고 옛 스냅샷이 남은 상태)를 만들기 위해서다.
     */
    final AtomicLong generation = new AtomicLong();
    private volatile Cached cached;

    @Autowired
    public MenuCatalog(SecMenuRepository secMenuRepository, SecObjRepository secObjRepository) {
        this(secMenuRepository, secObjRepository, Clock.systemUTC(), TTL);
    }

    MenuCatalog(SecMenuRepository secMenuRepository, SecObjRepository secObjRepository, Clock clock, Duration ttl) {
        this.secMenuRepository = secMenuRepository;
        this.secObjRepository = secObjRepository;
        this.clock = clock;
        this.ttl = ttl;
    }

    /** 현재 스냅샷 — 메뉴·OBJECT 를 함께 쓸 때는 이것 하나를 받아 쓴다(두 목록이 같은 적재에서 나온다). */
    public Snapshot snapshot() {
        Cached c = cached;
        if (isUsable(c, clock.instant())) return c.snapshot();
        synchronized (loadLock) {
            c = cached;
            Instant now = clock.instant();
            if (isUsable(c, now)) return c.snapshot();
            long gen = generation.get();
            Snapshot loaded = Snapshot.of(secMenuRepository.findAll(), secObjRepository.findAll());
            if (generation.get() == gen) {
                cached = new Cached(loaded, now.plus(ttl), gen);
            }
            return loaded;
        }
    }

    /** 저장된 스냅샷이 현재 세대이고 만료 전이면 쓴다. */
    private boolean isUsable(Cached c, Instant now) {
        return c != null && c.gen() == generation.get() && now.isBefore(c.expiresAt());
    }

    /** TB_MCM_SEC_MENU 전 행 (불변, 읽기 전용 엔티티). */
    public List<SecMenu> menus() {
        return snapshot().menus();
    }

    /** TB_MCM_SEC_OBJ 전 행 (불변, 읽기 전용 엔티티). */
    public List<SecObj> objects() {
        return snapshot().objects();
    }

    /** 다음 호출이 두 테이블을 다시 읽게 한다. */
    public void invalidate() {
        generation.incrementAndGet();
        cached = null;
    }

    /** 메뉴·폴더·OBJECT·역할 변경 — 발행 즉시 비운다. 예외는 밖으로 던지지 않는다. */
    @EventListener(classes = {MenuChangedEvent.class, RoleChangedEvent.class})
    public void onChanged(Object event) {
        safeInvalidate(event, "즉시");
    }

    /** 같은 변경 — 커밋 뒤 한 번 더 비운다(트랜잭션이 없으면 즉시). 예외는 밖으로 던지지 않는다. */
    @TransactionalEventListener(classes = {MenuChangedEvent.class, RoleChangedEvent.class},
            phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onChangedAfterCommit(Object event) {
        safeInvalidate(event, "커밋 뒤");
    }

    private void safeInvalidate(Object event, String when) {
        try {
            invalidate();
        } catch (RuntimeException e) {
            log.warn("[menuCatalog] {} 무효화 실패 — TTL({}) 뒤 다시 읽는다 event={}", when, ttl, event, e);
        }
    }
}
