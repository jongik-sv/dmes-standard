package com.dongkuk.dmes.mdm.common.version;

import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.security.MdmStewardDirectory;
import com.dongkuk.dmes.mdm.common.testdb.SharedContextResettable;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionDiff;
import com.dongkuk.dmes.mdm.contract.version.VersionDraftDeletionSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.function.Consumer;

/**
 * TSK-01-03 design.md §3.2 — 시나리오 테스트의 가짜 빈 모음(seed-only 테스트 전용).
 * 역할 조회와 SPI 호출을 한 기록({@link Events})에 남겨 검사 순서(불변 규칙 I10)를 단언할 수 있게 한다.
 */
public final class VersionScenarioFakes {

    private VersionScenarioFakes() {
    }

    /** 역할 조회·SPI 호출 순서 기록. */
    public static final class Events {
        private final List<String> log = Collections.synchronizedList(new ArrayList<>());

        public void add(String event) {
            log.add(event);
        }

        public List<String> snapshot() {
            return List.copyOf(log);
        }

        public void clear() {
            log.clear();
        }
    }

    /** 테스트가 옮길 수 있는 시계(Asia/Seoul). */
    public static final class MutableClock extends Clock implements SharedContextResettable {
        private final ZoneId zone;
        private final LocalDateTime initial;
        private volatile Instant instant;

        public MutableClock(ZoneId zone, LocalDateTime initial) {
            this.zone = zone;
            this.initial = initial;
            setLocal(initial);
        }

        @Override
        public void resetForTestClass() {
            setLocal(initial);
        }

        public void setLocal(LocalDateTime local) {
            this.instant = local.atZone(zone).toInstant();
        }

        @Override
        public ZoneId getZone() {
            return zone;
        }

        @Override
        public Clock withZone(ZoneId other) {
            return Clock.fixed(instant, other);
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }

    /** 요청 사용자 가짜. roleIds() 를 부를 때마다 "roles" 를 기록한다. */
    public static final class FakeCurrentUser implements MdmCurrentUser {
        private final Events events;
        private volatile String userId;
        private volatile Set<String> roles = Set.of();

        public FakeCurrentUser(Events events) {
            this.events = events;
        }

        public void set(String userId, Set<String> roles) {
            this.userId = userId;
            this.roles = Set.copyOf(roles);
        }

        @Override
        public String userId() {
            return userId;
        }

        @Override
        public Set<String> roleIds() {
            events.add("roles");
            return roles;
        }
    }

    /** 담당자 ID 집합을 받는 디렉터리 가짜. */
    public static final class FakeStewardDirectory implements MdmStewardDirectory, SharedContextResettable {
        private volatile Set<String> stewards = Set.of();

        @Override
        public void resetForTestClass() {
            this.stewards = Set.of();
        }

        public void set(Set<String> stewards) {
            this.stewards = Set.copyOf(stewards);
        }

        @Override
        public boolean isSteward(String userId) {
            return userId != null && stewards.contains(userId);
        }
    }

    /** 확정 검사 SPI 가짜. errors·warnings·검사 중 행위를 테스트가 심는다. */
    public static final class FakeConfirmCheck implements VersionConfirmCheckSpi {
        private final VersionTarget target;
        private final Events events;
        private final List<ConfirmCheckRequest> calls = Collections.synchronizedList(new ArrayList<>());
        private volatile List<MdmCheckIssue> errors = List.of();
        private volatile List<MdmCheckIssue> warnings = List.of();
        private volatile Consumer<ConfirmCheckRequest> during = request -> { };

        public FakeConfirmCheck(VersionTarget target, Events events) {
            this.target = target;
            this.events = events;
        }

        public void reset() {
            calls.clear();
            errors = List.of();
            warnings = List.of();
            during = request -> { };
        }

        public void errors(List<MdmCheckIssue> errors) {
            this.errors = List.copyOf(errors);
        }

        public void warnings(List<MdmCheckIssue> warnings) {
            this.warnings = List.copyOf(warnings);
        }

        public void during(Consumer<ConfirmCheckRequest> during) {
            this.during = during;
        }

        public List<ConfirmCheckRequest> calls() {
            return List.copyOf(calls);
        }

        @Override
        public VersionTarget target() {
            return target;
        }

        @Override
        public VersionDiff diff(VersionRef draft) {
            throw new AssertionError("공통 서비스는 SPI 의 diff 를 부르지 않는다(불변 규칙 I14)");
        }

        @Override
        public ConfirmCheckResult check(ConfirmCheckRequest request) {
            events.add("spi:" + target);
            calls.add(request);
            during.accept(request);
            return new ConfirmCheckResult(errors, warnings);
        }
    }

    /** DRAFT 삭제 훅 가짜. 호출 기록·호출 중 행위·던지기를 테스트가 심는다. */
    public static final class FakeDraftDeletion implements VersionDraftDeletionSpi {
        private final VersionTarget target;
        private final List<VersionRef> calls = Collections.synchronizedList(new ArrayList<>());
        private volatile Consumer<VersionRef> during = ref -> { };
        private volatile RuntimeException failure;

        public FakeDraftDeletion(VersionTarget target) {
            this.target = target;
        }

        public void reset() {
            calls.clear();
            during = ref -> { };
            failure = null;
        }

        public void during(Consumer<VersionRef> during) {
            this.during = during;
        }

        public void failWith(RuntimeException failure) {
            this.failure = failure;
        }

        public List<VersionRef> calls() {
            return List.copyOf(calls);
        }

        @Override
        public VersionTarget target() {
            return target;
        }

        @Override
        public void beforeDraftDelete(VersionRef draft) {
            calls.add(draft);
            during.accept(draft);
            if (failure != null) {
                throw failure;
            }
        }
    }
}
