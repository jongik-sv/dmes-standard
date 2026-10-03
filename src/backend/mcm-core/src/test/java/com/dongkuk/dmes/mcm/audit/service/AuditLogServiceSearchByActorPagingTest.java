package com.dongkuk.dmes.mcm.audit.service;

import com.dongkuk.dmes.mcm.audit.entity.AuditLog;
import com.dongkuk.dmes.mcm.audit.repository.AuditLogRepository;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.csa.commUserMng.support.CommUserMngFixtures;
import com.dongkuk.dmes.mcm.csa.commUserMng.support.CommUserMngJpaTestConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;

/**
 * {@link AuditLogService#searchByActor} 의 page·size 경로 — 새 동작 고정.
 *
 * <p>page·size 가 없을 때의 기존 동작은 {@link AuditLogServiceSearchByActorTest} 가 고정한다(그 테스트는 그대로 통과해야 한다).
 * page·size 가 있으면 필터 경로(actorUserId → action → 전체)마다 발생 시각 내림차순(같은 시각은 AUDIT_ID 내림차순)으로 그 페이지만 돌려준다.
 */
@SpringJUnitConfig(CommUserMngJpaTestConfig.class)
class AuditLogServiceSearchByActorPagingTest {

    @Autowired AuditLogRepository auditLogRepository;
    @Autowired CommUserMngFixtures fx;

    AuditLogService service;

    static final Instant T0 = Instant.parse("2026-09-01T00:00:00Z");

    @BeforeEach
    void setUp() {
        fx.clearAll();
        service = new AuditLogService(auditLogRepository);
        // 시각 내림차순 전체: a6(60) a4(50) a5(40) a1(30) a3(20) a2(10) — 저장 순서와 섞여 있다.
        log("a1", "USER_SAVE", "admin", 30);
        log("a2", "ROLE_SAVE", "admin", 10);
        log("a3", "USER_SAVE", "kim",   20);
        log("a4", "USER_SAVE", "admin", 50);
        log("a5", "LOGIN",     "kim",   40);
        log("a6", "USER_SAVE", null,    60);
    }

    void log(String id, String action, String actor, long plusSeconds) {
        AuditLog a = new AuditLog();
        a.setAuditId(id);
        a.setAction(action);
        a.setActorUserId(actor);
        a.setOccurredAt(T0.plusSeconds(plusSeconds));
        auditLogRepository.save(a);
    }

    static Map<String, Object> req(Object... kv) {
        Map<String, Object> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    static List<String> ids(List<AuditLog> rows) {
        return rows.stream().map(AuditLog::getAuditId).toList();
    }

    @Test
    @DisplayName("필터 없음 + page·size — 전체를 발생 시각 내림차순으로 잘라 그 페이지만")
    void allPaged() {
        assertThat(ids(service.searchByActor(req("page", 0, "size", 4)))).containsExactly("a6", "a4", "a5", "a1");
        assertThat(ids(service.searchByActor(req("page", 1, "size", 4)))).containsExactly("a3", "a2");
        assertThat(service.searchByActor(req("page", 2, "size", 4))).isEmpty();
    }

    @Test
    @DisplayName("actorUserId + page·size — 그 사용자 로그를 시각 내림차순으로 페이지")
    void actorPaged() {
        assertThat(ids(service.searchByActor(req("actorUserId", "admin", "page", 0, "size", 2)))).containsExactly("a4", "a1");
        assertThat(ids(service.searchByActor(req("actorUserId", "admin", "page", 1, "size", 2)))).containsExactly("a2");
    }

    @Test
    @DisplayName("action + page·size — 그 동작 로그를 시각 내림차순으로 페이지")
    void actionPaged() {
        assertThat(ids(service.searchByActor(req("action", "USER_SAVE", "page", 0, "size", 3)))).containsExactly("a6", "a4", "a1");
        assertThat(ids(service.searchByActor(req("action", "USER_SAVE", "page", 1, "size", 3)))).containsExactly("a3");
    }

    @Test
    @DisplayName("페이지 경로에서도 actorUserId 가 action 보다 우선한다, actorUserId 가 비면 action 으로 넘어간다")
    void precedenceKeptWhenPaged() {
        assertThat(ids(service.searchByActor(req("actorUserId", "admin", "action", "LOGIN", "page", 0, "size", 10))))
                .containsExactly("a4", "a1", "a2");
        assertThat(ids(service.searchByActor(req("actorUserId", " ", "action", "LOGIN", "page", 0, "size", 10))))
                .containsExactly("a5");
    }

    @Test
    @DisplayName("같은 발생 시각은 AUDIT_ID 내림차순 — 페이지를 이어 붙이면 중복·누락이 없다")
    void tieBreakByAuditId() {
        log("b1", "TIE", "tie", 100);
        log("b3", "TIE", "tie", 100);
        log("b2", "TIE", "tie", 100);

        assertThat(ids(service.searchByActor(req("action", "TIE", "page", 0, "size", 2)))).containsExactly("b3", "b2");
        assertThat(ids(service.searchByActor(req("action", "TIE", "page", 1, "size", 2)))).containsExactly("b1");
    }

    @Test
    @DisplayName("한쪽만 주면 page 는 0, size 는 상한(2000) — 숫자 문자열·공백 문자열도 받는다")
    void oneSideAndStringValues() {
        assertThat(ids(service.searchByActor(req("size", 2)))).containsExactly("a6", "a4");
        assertThat(ids(service.searchByActor(req("page", 0)))).containsExactly("a6", "a4", "a5", "a1", "a3", "a2");
        assertThat(service.searchByActor(req("page", 1))).isEmpty();
        assertThat(ids(service.searchByActor(req("page", " 1 ", "size", "2")))).containsExactly("a5", "a1");
        assertThat(ids(service.searchByActor(req("page", 1L, "size", new BigDecimal("2"))))).containsExactly("a5", "a1");
        // 공백 문자열·빈 문자열은 없는 것과 같다 → 둘 다 없으면 기존 경로(findAll, 순서 보지 않음)
        assertThat(ids(service.searchByActor(req("page", " ", "size", ""))))
                .containsExactlyInAnyOrder("a1", "a2", "a3", "a4", "a5", "a6");
    }

    @Test
    @DisplayName("숫자가 아닌 값, 음수 page, 1 보다 작은 size 는 BusinessException")
    void invalidPaging() {
        assertThatThrownBy(() -> service.searchByActor(req("page", "x", "size", 10))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.searchByActor(req("page", 0, "size", 1.5))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.searchByActor(req("page", true))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.searchByActor(req("page", -1, "size", 10))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.searchByActor(req("page", 0, "size", 0))).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("건너뛸 행 수가 int 를 넘는 page, int 범위 밖 정수는 저장소까지 가지 않고 BusinessException")
    void outOfRangePaging() {
        // 오프셋 2000000×2000 = 4e9 — 고치기 전에는 저장소 실행 단계의 일반 예외였다.
        assertThatThrownBy(() -> service.searchByActor(req("page", 2_000_000, "size", 2000))).isInstanceOf(BusinessException.class);
        // 잘린 size 기준으로 판정한다 — size 5000 은 2000 으로 잘린 뒤 같은 오프셋이 된다.
        assertThatThrownBy(() -> service.searchByActor(req("page", 2_000_000, "size", 5000))).isInstanceOf(BusinessException.class);
        // int 범위 밖 정수는 Integer.MAX_VALUE 로 자르지 않는다.
        assertThatThrownBy(() -> service.searchByActor(req("page", 3_000_000_000L))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.searchByActor(req("page", 0, "size", 3_000_000_000L))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.searchByActor(req("page", new BigDecimal("3000000000")))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.searchByActor(req("page", -3.0e9))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.searchByActor(req("page", "3000000000"))).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("문자열은 정수 표기만 받고, 숫자형은 소수부가 0 이면 받는다(현재 규칙 고정)")
    void decimalNotation() {
        assertThatThrownBy(() -> service.searchByActor(req("page", "1.0", "size", 2))).isInstanceOf(BusinessException.class);
        assertThat(ids(service.searchByActor(req("page", 1.0, "size", new BigDecimal("2.0"))))).containsExactly("a5", "a1");
    }

    /** 상한은 저장소에 넘어가는 Pageable 로 확인한다(2001 행을 넣지 않는다). */
    @Nested
    @DisplayName("size 상한 2000 — 저장소에 넘기는 Pageable")
    class SizeCap {

        final AuditLogRepository repo = mock(AuditLogRepository.class);
        final AuditLogService capped = new AuditLogService(repo);

        Pageable captured() {
            ArgumentCaptor<Pageable> c = ArgumentCaptor.forClass(Pageable.class);
            verify(repo).findPage(c.capture());
            verifyNoMoreInteractions(repo);
            return c.getValue();
        }

        @Test
        @DisplayName("size 5000 → 2000 으로 자른다, 정렬은 occurredAt·auditId 내림차순")
        void capsAt2000() {
            capped.searchByActor(req("page", 3, "size", 5000));
            Pageable p = captured();
            assertThat(p.getPageNumber()).isEqualTo(3);
            assertThat(p.getPageSize()).isEqualTo(2000);
            assertThat(p.getSort()).isEqualTo(Sort.by(Sort.Order.desc("occurredAt"), Sort.Order.desc("auditId")));
        }

        @Test
        @DisplayName("size 2000 은 그대로")
        void exactCap() {
            capped.searchByActor(req("page", 0, "size", 2000));
            assertThat(captured().getPageSize()).isEqualTo(2000);
        }

        @Test
        @DisplayName("page 만 주면 size 2000")
        void pageOnlyDefaultsToCap() {
            capped.searchByActor(req("page", 0));
            assertThat(captured().getPageSize()).isEqualTo(2000);
        }

        @Test
        @DisplayName("오프셋 경계 — 1073741×2000 은 int 안이라 넘기고, 1073742×2000 은 넘어서 저장소를 부르지 않는다")
        void offsetBoundary() {
            capped.searchByActor(req("page", 1_073_741, "size", 5000));
            Pageable p = captured();
            assertThat(p.getPageNumber()).isEqualTo(1_073_741);
            assertThat(p.getOffset()).isEqualTo(2_147_482_000L);

            AuditLogRepository r = mock(AuditLogRepository.class);
            AuditLogService s = new AuditLogService(r);
            assertThatThrownBy(() -> s.searchByActor(req("page", 1_073_742, "size", 2000))).isInstanceOf(BusinessException.class);
            verifyNoMoreInteractions(r);
        }

        @Test
        @DisplayName("필터 경로도 같은 Pageable — actorUserId·action 각각 페이지 메서드를 부른다")
        void filterPathsUsePagedMethods() {
            AuditLogRepository r = mock(AuditLogRepository.class);
            AuditLogService s = new AuditLogService(r);
            s.searchByActor(req("actorUserId", "admin", "size", 9999));
            ArgumentCaptor<Pageable> c = ArgumentCaptor.forClass(Pageable.class);
            verify(r).findByActorUserId(eq("admin"), c.capture());
            assertThat(c.getValue().getPageSize()).isEqualTo(2000);

            s.searchByActor(req("action", "LOGIN", "page", 1, "size", 10));
            verify(r).findByAction(eq("LOGIN"), any(Pageable.class));
            verifyNoMoreInteractions(r);
        }

        @Test
        @DisplayName("page·size 가 없으면 페이지 메서드를 부르지 않는다(기존 경로)")
        void noPagingUsesOldMethods() {
            AuditLogRepository r = mock(AuditLogRepository.class);
            AuditLogService s = new AuditLogService(r);
            s.searchByActor(req());
            s.searchByActor(req("actorUserId", "admin"));
            s.searchByActor(req("action", "LOGIN"));
            verify(r).findAll();
            verify(r).findByActorUserIdOrderByOccurredAtDesc("admin");
            verify(r).findByActionOrderByOccurredAtDesc("LOGIN");
            verifyNoMoreInteractions(r);
        }
    }
}
