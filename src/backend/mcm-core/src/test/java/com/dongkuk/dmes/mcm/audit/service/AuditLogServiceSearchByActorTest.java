package com.dongkuk.dmes.mcm.audit.service;

import com.dongkuk.dmes.mcm.audit.entity.AuditLog;
import com.dongkuk.dmes.mcm.audit.repository.AuditLogRepository;
import com.dongkuk.dmes.mcm.csa.commUserMng.support.CommUserMngFixtures;
import com.dongkuk.dmes.mcm.csa.commUserMng.support.CommUserMngJpaTestConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * {@link AuditLogService#searchByActor} 특성 테스트 — H2 실제 저장소({@code TB_SEC_AUDIT_LOG}).
 *
 * <p>현재 동작을 그대로 기대값으로 고정한다. 필터 우선순위는 actorUserId → action → 전체 순이며,
 * 둘 다 주어지면 action 은 무시된다(AND 결합이 아니다). 반환은 Map 이 아니라 {@link AuditLog} 엔티티 목록이다.
 * 결과 확인은 반환 목록의 auditId 순서로만 한다(저장소 호출은 보지 않는다).
 */
@SpringJUnitConfig(CommUserMngJpaTestConfig.class)
class AuditLogServiceSearchByActorTest {

    @Autowired AuditLogRepository auditLogRepository;
    @Autowired CommUserMngFixtures fx;

    AuditLogService service;

    static final Instant T0 = Instant.parse("2026-09-01T00:00:00Z");

    @BeforeEach
    void setUp() {
        fx.clearAll();
        service = new AuditLogService(auditLogRepository);
        // 발생 시각은 초 단위로 서로 다르게 둔다(동률·나노초 절삭 영향 배제). 저장 순서와 시각 순서를 일부러 섞는다.
        log("a1", "USER_SAVE",   "admin", 30);
        log("a2", "ROLE_SAVE",   "admin", 10);
        log("a3", "USER_SAVE",   "kim",   20);
        log("a4", "USER_SAVE",   "admin", 50);
        log("a5", "LOGIN",       "kim",   40);
        log("a6", "USER_SAVE",   null,    60);
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
    @DisplayName("actorUserId — 그 사용자의 감사 로그만, 발생 시각 내림차순")
    void byActor() {
        List<AuditLog> rows = service.searchByActor(req("actorUserId", "admin"));
        assertThat(ids(rows)).containsExactly("a4", "a1", "a2");
        assertThat(rows).allSatisfy(r -> assertThat(r.getActorUserId()).isEqualTo("admin"));

        assertThat(ids(service.searchByActor(req("actorUserId", "kim")))).containsExactly("a5", "a3");
        // 완전 일치(=) — 부분 문자열은 0건. 대소문자 구분은 DB 콜레이션에 따르므로 고정하지 않는다.
        assertThat(service.searchByActor(req("actorUserId", "adm"))).isEmpty();
    }

    @Test
    @DisplayName("action — 그 동작의 감사 로그만(행위자 null 포함), 발생 시각 내림차순")
    void byAction() {
        assertThat(ids(service.searchByActor(req("action", "USER_SAVE")))).containsExactly("a6", "a4", "a1", "a3");
        assertThat(ids(service.searchByActor(req("action", "LOGIN")))).containsExactly("a5");
        assertThat(service.searchByActor(req("action", "NONE"))).isEmpty();
    }

    @Test
    @DisplayName("둘 다 주어지면 actorUserId 만 적용되고 action 은 무시된다")
    void actorWinsOverAction() {
        // 결함 의심 여부와 무관하게 현재 동작: AND 가 아니라 actorUserId 우선.
        assertThat(ids(service.searchByActor(req("actorUserId", "admin", "action", "LOGIN"))))
                .containsExactly("a4", "a1", "a2");
    }

    @Test
    @DisplayName("actorUserId 가 빈 문자열·공백·null 이면 action 필터로 넘어간다")
    void blankActorFallsThroughToAction() {
        assertThat(ids(service.searchByActor(req("actorUserId", " ", "action", "ROLE_SAVE")))).containsExactly("a2");
        assertThat(ids(service.searchByActor(req("actorUserId", "", "action", "ROLE_SAVE")))).containsExactly("a2");
        assertThat(ids(service.searchByActor(req("actorUserId", null, "action", "ROLE_SAVE")))).containsExactly("a2");
    }

    @Test
    @DisplayName("둘 다 없거나 비면 전체 반환 — 정렬 없음(findAll)이라 순서는 보지 않는다")
    void neitherReturnsAll() {
        List<String> all = List.of("a1", "a2", "a3", "a4", "a5", "a6");
        assertThat(ids(service.searchByActor(req()))).containsExactlyInAnyOrderElementsOf(all);
        assertThat(ids(service.searchByActor(req("actorUserId", " ", "action", "")))).containsExactlyInAnyOrderElementsOf(all);
        // 모르는 키는 무시된다
        assertThat(ids(service.searchByActor(req("from", "2026-01-01T00:00:00Z")))).containsExactlyInAnyOrderElementsOf(all);
    }

    @Test
    @DisplayName("데이터가 없으면 빈 목록")
    void empty() {
        fx.clearAll();
        assertThat(service.searchByActor(req())).isEmpty();
        assertThat(service.searchByActor(req("actorUserId", "admin"))).isEmpty();
    }

    @Test
    @DisplayName("요청이 null 이면 NullPointerException, 값이 문자열이 아니면 ClassCastException (현재 동작)")
    void invalidRequest() {
        // 결함 의심: 입력 검증 없이 Map 을 바로 읽고 (String) 으로 형변환한다.
        assertThatThrownBy(() -> service.searchByActor(null)).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> service.searchByActor(req("actorUserId", 123))).isInstanceOf(ClassCastException.class);
        assertThatThrownBy(() -> service.searchByActor(req("action", 1))).isInstanceOf(ClassCastException.class);
    }
}
