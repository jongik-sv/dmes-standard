package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.csa.commUserMng.support.CommUserMngFixtures;
import com.dongkuk.dmes.mcm.csa.commUserMng.support.CommUserMngJpaTestConfig;
import com.dongkuk.dmes.mcm.csa.commUserMng.support.RoleChangedEventCollector;
import com.dongkuk.dmes.mcm.repository.SecUserHisRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserPwdRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRollHisRepository;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link CommUserMngService} 특성 테스트 공통 기반 — H2(MSSQLServer 모드) 실제 저장소 + 컴포넌트 스캔한 서비스 빈.
 *
 * <p>테스트는 공개 메서드 시그니처·반환 Map 의 키·값·순서·DB 에 남은 결과만 본다. private 구현과
 * 저장소 호출 횟수(예: 부서 findById, 매핑 deleteById, 행별 updateSsoPwd)는 다음 단계에서 바뀔 것이므로 보지 않는다.
 *
 * <p>서비스 호출 하나는 {@link #inTx(Supplier)} 로 트랜잭션 하나 안에서 돌린다(운영의 BPMN 프로세스 단위 트랜잭션과 같다).
 * 결과 확인은 저장소를 트랜잭션 밖에서 불러 새 영속성 컨텍스트로 다시 읽는다 — JPQL 벌크 UPDATE 가
 * 영속성 컨텍스트를 거치지 않으므로 같은 트랜잭션에서 읽으면 낡은 값이 보일 수 있다.
 */
@SpringJUnitConfig(CommUserMngJpaTestConfig.class)
abstract class CommUserMngJpaTestBase {

    /** 서비스 소스 상수와 같은 값(초기 비밀번호). 반환 INIT_PWD 와 저장 해시로 고정한다. */
    static final String DEFAULT_PASSWORD = "dmesInit!1";

    static final DateTimeFormatter YYYYMMDD = DateTimeFormatter.ofPattern("yyyyMMdd");

    /** 저장 해시 확인용. 같은 bcrypt 이면 salt 가 해시 안에 들어 있어 matches 로 확인된다. */
    static final BCryptPasswordEncoder BCRYPT = new BCryptPasswordEncoder();

    @Autowired CommUserMngService service;
    @Autowired CommUserMngFixtures fx;
    @Autowired RoleChangedEventCollector events;
    @Autowired TransactionTemplate tx;

    @Autowired SecUserRepository secUserRepository;
    @Autowired SecUserMappingRepository secUserMappingRepository;
    @Autowired SecUserPwdRepository secUserPwdRepository;
    @Autowired SecUserHisRepository secUserHisRepository;
    @Autowired SecUserRollHisRepository secUserRollHisRepository;

    @BeforeEach
    void setUpBase() {
        fx.clearAll();
        events.clear();
    }

    /** 서비스 호출 하나 = 트랜잭션 하나. */
    <T> T inTx(Supplier<T> call) {
        return tx.execute(status -> call.get());
    }

    static Map<String, Object> row(Object... kv) {
        return CommUserMngFixtures.row(kv);
    }

    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> grid(Map<String, Object> out, String key) {
        return (List<Map<String, Object>>) out.get(key);
    }

    /** LocalDate.now() 를 쓰는 코드는 시계를 주입할 수 없으므로 호출 전·후 날짜 중 하나면 맞다고 본다. */
    static void assertTodayBetween(LocalDate actual, LocalDate before, LocalDate after) {
        assertThat(actual).isBetween(before, after);
    }

    static String yyyymmdd(LocalDate d) {
        return d.format(YYYYMMDD);
    }
}
