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
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * {@link AuditLogService#searchByPeriod} 특성 테스트와 두 조회 메서드의 "페이징 없음" 고정 — H2 실제 저장소({@code TB_SEC_AUDIT_LOG}).
 *
 * <p>현재 동작: {@code from} 이 없으면 {@link Instant#EPOCH}, {@code to} 가 없으면 호출 시각({@link Instant#now()}).
 * BETWEEN 이라 양 끝을 포함하고, 발생 시각 내림차순이다. 반환은 엔티티가 아니라 9 키 고정 순서의 Map 이며
 * {@code occurredAt} 은 {@link Instant#toString()} 문자열이다.
 *
 * <p>시각은 모두 초 단위(나노초 0)로 둔다 — toString 비교와 BETWEEN 경계를 정확히 하기 위해서다.
 * {@code to} 기본값이 실제 현재 시각이므로 기준 시각도 고정 날짜가 아니라 {@code now} 에서 과거로 잡는다.
 */
@SpringJUnitConfig(CommUserMngJpaTestConfig.class)
class AuditLogServiceSearchByPeriodTest {

    @Autowired AuditLogRepository auditLogRepository;
    @Autowired CommUserMngFixtures fx;

    AuditLogService service;

    /** 기준 시각 — 지금보다 10일 전, 초 단위. */
    Instant base;

    @BeforeEach
    void setUp() {
        fx.clearAll();
        service = new AuditLogService(auditLogRepository);
        base = Instant.now().truncatedTo(ChronoUnit.SECONDS).minus(10, ChronoUnit.DAYS);
    }

    static AuditLog entity(String id, Instant occurredAt) {
        AuditLog a = new AuditLog();
        a.setAuditId(id);
        a.setAction("ACT");
        a.setActorUserId("actor");
        a.setOccurredAt(occurredAt);
        return a;
    }

    void log(String id, Instant occurredAt) {
        auditLogRepository.save(entity(id, occurredAt));
    }

    static Map<String, Object> req(Object... kv) {
        Map<String, Object> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    static List<Object> ids(List<Map<String, Object>> rows) {
        return rows.stream().map(r -> r.get("auditId")).toList();
    }

    @Test
    @DisplayName("from·to 가 주어지면 BETWEEN — 양 끝 포함, 1초 밖은 제외, 발생 시각 내림차순")
    void inclusiveBoundsAndDescOrder() {
        Instant from = base;
        Instant to = base.plusSeconds(100);
        // 저장 순서와 시각 순서를 일부러 섞는다.
        log("mid", base.plusSeconds(50));
        log("atFrom", from);
        log("beforeFrom", from.minusSeconds(1));
        log("atTo", to);
        log("afterTo", to.plusSeconds(1));
        log("early", base.plusSeconds(10));

        List<Map<String, Object>> rows = service.searchByPeriod(req("from", from.toString(), "to", to.toString()));

        assertThat(ids(rows)).containsExactly("atTo", "mid", "early", "atFrom");
    }

    @Test
    @DisplayName("from 이 없으면 EPOCH — 정확히 EPOCH 인 행은 포함, 그 1초 전은 제외")
    void fromDefaultsToEpoch() {
        log("atEpoch", Instant.EPOCH);
        log("beforeEpoch", Instant.EPOCH.minusSeconds(1));
        log("recent", base);

        List<Map<String, Object>> rows = service.searchByPeriod(req("to", base.toString()));

        assertThat(ids(rows)).containsExactly("recent", "atEpoch");
    }

    @Test
    @DisplayName("to 가 없으면 호출 시각 — 과거 행은 포함, 미래(지금+1일) 행은 제외")
    void toDefaultsToNow() {
        log("past", base);
        log("justPast", Instant.now().truncatedTo(ChronoUnit.SECONDS).minusSeconds(60));
        log("future", Instant.now().truncatedTo(ChronoUnit.SECONDS).plus(1, ChronoUnit.DAYS));

        assertThat(ids(service.searchByPeriod(req("from", base.toString())))).containsExactly("justPast", "past");
        // 둘 다 없으면 EPOCH ~ 지금
        log("atEpoch", Instant.EPOCH);
        assertThat(ids(service.searchByPeriod(req()))).containsExactly("justPast", "past", "atEpoch");
    }

    @Test
    @DisplayName("행 Map — 9 키 고정 순서, occurredAt 은 Instant.toString() 문자열, 빈 컬럼은 null 값으로 들어 있다")
    void rowShape() {
        AuditLog full = new AuditLog();
        full.setAuditId("full");
        full.setAction("USER_SAVE");
        full.setTargetType("USER");
        full.setTargetId("u1");
        full.setActorUserId("admin");
        full.setBeforeJson("{\"a\":1}");
        full.setAfterJson("{\"a\":2}");
        full.setClientIp("10.0.0.1");
        full.setOccurredAt(base.plusSeconds(5));
        auditLogRepository.save(full);
        AuditLog sparse = new AuditLog();
        sparse.setAuditId("sparse");
        sparse.setAction("LOGIN");
        sparse.setOccurredAt(base);
        auditLogRepository.save(sparse);

        List<Map<String, Object>> rows = service.searchByPeriod(req());

        assertThat(rows).hasSize(2);
        Map<String, Object> r = rows.get(0);
        assertThat(r.keySet()).containsExactly(
                "auditId", "action", "targetType", "targetId", "actorUserId",
                "beforeJson", "afterJson", "clientIp", "occurredAt");
        assertThat(r.values()).containsExactly(
                "full", "USER_SAVE", "USER", "u1", "admin",
                "{\"a\":1}", "{\"a\":2}", "10.0.0.1", base.plusSeconds(5).toString());
        assertThat(r.get("occurredAt")).isInstanceOf(String.class);

        Map<String, Object> s = rows.get(1);
        assertThat(s.keySet()).containsExactly(
                "auditId", "action", "targetType", "targetId", "actorUserId",
                "beforeJson", "afterJson", "clientIp", "occurredAt");
        assertThat(s.values()).containsExactly(
                "sparse", "LOGIN", null, null, null, null, null, null, base.toString());
    }

    @Test
    @DisplayName("occurredAt 이 null 인 엔티티는 occurredAt 값 null — DB 로는 만들 수 없어 저장소 대역으로 확인")
    void nullOccurredAtMapsToNull() {
        // OCCURRED_AT 은 NOT NULL 컬럼이고 BETWEEN 은 NULL 과 일치하지 않으므로 DB 경로로는 이 분기에 닿지 않는다.
        // 이 테스트만 저장소 메서드(findByPeriod)에 묶여 있다 — 저장소 메서드가 바뀌면 대역 설정만 고친다.
        AuditLogRepository stub = mock(AuditLogRepository.class);
        when(stub.findByPeriod(any(), any())).thenReturn(List.of(entity("noTime", null)));

        List<Map<String, Object>> rows = new AuditLogService(stub).searchByPeriod(req());

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0)).containsEntry("auditId", "noTime").containsEntry("occurredAt", null);
        assertThat(rows.get(0).keySet()).containsExactly(
                "auditId", "action", "targetType", "targetId", "actorUserId",
                "beforeJson", "afterJson", "clientIp", "occurredAt");
    }

    @Test
    @DisplayName("from 이 to 보다 늦으면 빈 목록, 데이터가 없어도 빈 목록")
    void reversedRangeAndEmpty() {
        assertThat(service.searchByPeriod(req())).isEmpty();
        log("x", base);
        assertThat(service.searchByPeriod(req("from", base.plusSeconds(1).toString(), "to", base.minusSeconds(1).toString())))
                .isEmpty();
    }

    @Test
    @DisplayName("잘못된 입력 — 요청 null 은 NullPointerException, 날짜 형식 오류는 DateTimeParseException, 문자열이 아니면 ClassCastException (현재 동작)")
    void invalidRequest() {
        // 결함 의심: 입력 검증 없이 Map 을 바로 읽고 Instant.parse 한다.
        assertThatThrownBy(() -> service.searchByPeriod(null)).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> service.searchByPeriod(req("from", "2026-01-01"))).isInstanceOf(DateTimeParseException.class);
        assertThatThrownBy(() -> service.searchByPeriod(req("to", 1))).isInstanceOf(ClassCastException.class);
    }

    @Test
    @DisplayName("페이징 없음 — 기본 페이지 크기(20·100·1000·2000)보다 많은 2001건을 인자 없는 조회가 모두 돌려준다")
    void noImplicitPaging() {
        int n = 2001;
        List<AuditLog> bulk = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            AuditLog a = new AuditLog();
            a.setAuditId(String.format("bulk%05d", i));
            a.setAction("BULK");
            a.setActorUserId("bulkActor");
            a.setOccurredAt(base.plusSeconds(i));
            bulk.add(a);
        }
        auditLogRepository.saveAll(bulk);

        // searchByActor — 필터 없는 findAll 경로와 행위자·동작 필터 경로
        assertThat(service.searchByActor(req())).hasSize(n);
        assertThat(service.searchByActor(req("actorUserId", "bulkActor"))).hasSize(n);
        assertThat(service.searchByActor(req("action", "BULK"))).hasSize(n);

        // searchByPeriod — 인자 없이 EPOCH ~ 지금
        List<Map<String, Object>> rows = service.searchByPeriod(req());
        assertThat(rows).hasSize(n);
        assertThat(rows.get(0)).containsEntry("auditId", "bulk02000");
        assertThat(rows.get(n - 1)).containsEntry("auditId", "bulk00000");
    }
}
