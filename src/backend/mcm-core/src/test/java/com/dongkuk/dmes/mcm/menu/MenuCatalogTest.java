package com.dongkuk.dmes.mcm.menu;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.dongkuk.dmes.mcm.common.event.MenuChangedEvent;
import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.repository.SecMenuRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** {@link MenuCatalog} 캐시 — 적재·적중·TTL·이벤트 무효화·예외 삼킴·동시 적재·불변. */
class MenuCatalogTest {

    static final Duration TTL = Duration.ofMinutes(5);

    final SecMenuRepository menuRepo = mock(SecMenuRepository.class);
    final SecObjRepository objRepo = mock(SecObjRepository.class);
    final MutableClock clock = new MutableClock(Instant.parse("2026-10-04T00:00:00Z"));
    MenuCatalog catalog;

    ListAppender<ILoggingEvent> logs;
    Logger catalogLogger;

    @BeforeEach
    void setUp() {
        when(menuRepo.findAll()).thenReturn(List.of(menu("M1", "csa", "commMenuMng", "메뉴 관리")));
        when(objRepo.findAll()).thenReturn(List.of(obj("commMenuMng", "MCM")));
        catalog = new MenuCatalog(menuRepo, objRepo, clock, TTL);

        catalogLogger = (Logger) LoggerFactory.getLogger(MenuCatalog.class);
        logs = new ListAppender<>();
        logs.start();
        catalogLogger.addAppender(logs);
    }

    @AfterEach
    void tearDown() {
        catalogLogger.detachAppender(logs);
    }

    @Test
    @DisplayName("첫 호출이 두 테이블을 한 번씩 읽고, 두 번째 호출은 캐시에서 준다")
    void firstCallLoadsSecondHits() {
        MenuCatalog.Snapshot first = catalog.snapshot();
        MenuCatalog.Snapshot second = catalog.snapshot();
        catalog.menus();
        catalog.objects();

        assertThat(second).isSameAs(first);
        assertThat(first.menus()).extracting(SecMenu::getMenuId).containsExactly("M1");
        assertThat(first.objectsById()).containsOnlyKeys("commMenuMng");
        assertThat(first.menusById()).containsOnlyKeys("M1");
        verify(menuRepo, times(1)).findAll();
        verify(objRepo, times(1)).findAll();
    }

    @Test
    @DisplayName("TTL 이 지나면 다시 읽는다 — 지나기 전에는 읽지 않는다")
    void reloadsAfterTtl() {
        catalog.snapshot();
        clock.advance(TTL.minusSeconds(1));
        catalog.snapshot();
        verify(menuRepo, times(1)).findAll();

        clock.advance(Duration.ofSeconds(1));
        catalog.snapshot();
        verify(menuRepo, times(2)).findAll();
        verify(objRepo, times(2)).findAll();
    }

    @Test
    @DisplayName("MenuChangedEvent 를 받으면(즉시·커밋 뒤 모두) 다음 호출이 다시 읽는다")
    void menuChangedEventInvalidates() {
        catalog.snapshot();
        catalog.onChanged(new MenuChangedEvent(MenuChangedEvent.MENU));
        catalog.snapshot();
        verify(menuRepo, times(2)).findAll();

        catalog.onChangedAfterCommit(new MenuChangedEvent(MenuChangedEvent.OBJECT));
        catalog.snapshot();
        verify(menuRepo, times(3)).findAll();
        verify(objRepo, times(3)).findAll();
    }

    @Test
    @DisplayName("RoleChangedEvent 를 받으면(즉시·커밋 뒤 모두) 다음 호출이 다시 읽는다")
    void roleChangedEventInvalidates() {
        catalog.snapshot();
        catalog.onChanged(new RoleChangedEvent(Set.of("SYSADMIN")));
        catalog.snapshot();
        verify(menuRepo, times(2)).findAll();

        catalog.onChangedAfterCommit(new RoleChangedEvent(Set.of("SYSADMIN")));
        catalog.snapshot();
        verify(menuRepo, times(3)).findAll();
    }

    @Test
    @DisplayName("커밋 뒤 리스너는 무효화 예외를 밖으로 던지지 않고 WARN 로그만 남긴다")
    void afterCommitListenerSwallowsAndWarns() {
        MenuCatalog failing = spy(new MenuCatalog(menuRepo, objRepo, clock, TTL));
        doThrow(new IllegalStateException("boom")).when(failing).invalidate();

        assertThatCode(() -> failing.onChangedAfterCommit(new MenuChangedEvent(MenuChangedEvent.MENU)))
                .doesNotThrowAnyException();
        assertThatCode(() -> failing.onChanged(new RoleChangedEvent(Set.of("R1"))))
                .doesNotThrowAnyException();

        List<ILoggingEvent> warns = logs.list.stream().filter(e -> e.getLevel() == Level.WARN).toList();
        assertThat(warns).hasSize(2);
        assertThat(warns.get(0).getFormattedMessage()).contains("커밋 뒤").contains("무효화 실패");
        assertThat(warns.get(0).getThrowableProxy().getMessage()).isEqualTo("boom");
        assertThat(warns.get(1).getFormattedMessage()).contains("즉시");
    }

    @Test
    @DisplayName("여러 요청이 동시에 비어 있는 캐시를 읽어도 두 테이블은 한 번씩만 읽는다")
    void concurrentCallsLoadOnce() throws Exception {
        CountDownLatch loading = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(menuRepo.findAll()).thenAnswer(inv -> {
            loading.countDown();
            assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
            return List.of(menu("M1", "csa", "commMenuMng", "메뉴 관리"));
        });
        int threads = 8;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            List<Future<MenuCatalog.Snapshot>> results = new ArrayList<>();
            for (int i = 0; i < threads; i++) results.add(pool.submit(catalog::snapshot));
            assertThat(loading.await(5, TimeUnit.SECONDS)).isTrue();
            Thread.sleep(100); // 나머지 스레드가 잠금 앞에 모일 시간
            release.countDown();
            MenuCatalog.Snapshot first = results.get(0).get(5, TimeUnit.SECONDS);
            for (Future<MenuCatalog.Snapshot> f : results) assertThat(f.get(5, TimeUnit.SECONDS)).isSameAs(first);
        } finally {
            pool.shutdownNow();
        }
        verify(menuRepo, times(1)).findAll();
        verify(objRepo, times(1)).findAll();
    }

    @Test
    @DisplayName("읽는 도중 무효화가 오면 그 결과는 그 호출에만 주고 캐시에 남기지 않는다")
    void invalidationDuringLoadIsNotLost() {
        when(menuRepo.findAll()).thenAnswer(inv -> {
            catalog.invalidate(); // 다른 요청이 저장 이벤트를 낸 상황
            return List.of(menu("M1", "csa", "commMenuMng", "옛 이름"));
        });
        assertThat(catalog.menus()).extracting(SecMenu::getMenuNm).containsExactly("옛 이름");

        when(menuRepo.findAll()).thenReturn(List.of(menu("M1", "csa", "commMenuMng", "새 이름")));
        assertThat(catalog.menus()).extracting(SecMenu::getMenuNm).containsExactly("새 이름");
        verify(menuRepo, times(2)).findAll();
    }

    @Test
    @DisplayName("돌려주는 목록·맵은 고칠 수 없다")
    void returnedCollectionsAreImmutable() {
        MenuCatalog.Snapshot s = catalog.snapshot();

        assertThatThrownBy(() -> s.menus().add(new SecMenu())).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> s.objects().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> s.menusById().put("X", new SecMenu())).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> s.objectsById().remove("commMenuMng")).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> catalog.menus().remove(0)).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    @DisplayName("MENU_ID 가 겹치면 맵은 처음 행, OBJECT_ID 맵은 마지막 행 — 기존 호출부의 putIfAbsent·put 과 같다")
    void duplicateIdsKeepCallerSemantics() {
        SecMenu first = menu("M1", "csa", "a", "처음");
        SecMenu second = menu("M1", "csa", "b", "나중");
        SecObj objA = obj("O1", "A");
        SecObj objB = obj("O1", "B");
        MenuCatalog.Snapshot s = MenuCatalog.Snapshot.of(List.of(first, second), List.of(objA, objB));

        assertThat(s.menusById().get("M1")).isSameAs(first);
        assertThat(s.objectsById().get("O1")).isSameAs(objB);
        assertThat(s.menus()).containsExactly(first, second);
    }

    static SecMenu menu(String menuId, String parent, String objectId, String nm) {
        SecMenu m = new SecMenu();
        m.setMenuId(menuId);
        m.setParentMenuId(parent);
        m.setObjectId(objectId);
        m.setMenuNm(nm);
        m.setUseTp("Y");
        m.setMenuViewYn("Y");
        return m;
    }

    static SecObj obj(String objectId, String systemCode) {
        SecObj o = new SecObj();
        o.setObjectId(objectId);
        o.setSystemCode(systemCode);
        return o;
    }

    /** 시험용 시계 — 앞으로 돌릴 수 있다. */
    static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant start) {
            this.now = start;
        }

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
