package com.dongkuk.dmes.mcm.init.seed;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyIterable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.caravan.console.caravanhubconfig.ConsoleCaravanHubConfigJpaRepository;
import com.dongkuk.caravan.console.host.AppHostJpaRepository;
import java.sql.SQLException;
import java.sql.SQLSyntaxErrorException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.InvalidDataAccessResourceUsageException;
import org.springframework.dao.DataAccessResourceFailureException;

/**
 * CaravanMetaSeeder 의 표 없음 가드 (oracle-1007, 2026-10-07).
 *
 * <p>CARAVANUSER 표는 caravan-hub 기준선 Flyway 가 만든다. 그 기준선이 아직 없는 PDB 에서 저장이 ORA-00942 로 실패하면
 * 시드만 건너뛰고 기동은 이어 간다. 다른 오류는 그대로 던진다.
 */
class CaravanMetaSeederTableMissingTest {

    @Test
    @DisplayName("저장이 ORA-00942(표 없음)로 실패하면 두 시드 모두 건너뛰고 예외를 던지지 않는다")
    void skipsWhenTableMissing() {
        AppHostJpaRepository hosts = mock(AppHostJpaRepository.class);
        ConsoleCaravanHubConfigJpaRepository configs = mock(ConsoleCaravanHubConfigJpaRepository.class);
        when(hosts.saveAll(anyIterable())).thenThrow(oracleError(942, "ORA-00942: table or view \"CARAVANUSER\".\"TB_CARAVAN_APPHOST\" does not exist"));
        when(configs.saveAll(anyIterable())).thenThrow(oracleError(942, "ORA-00942: table or view does not exist"));
        CaravanMetaSeeder seeder = new CaravanMetaSeeder(hosts, configs);

        assertThatCode(seeder::initAppHostData).doesNotThrowAnyException();
        assertThatCode(seeder::initCaravanHubConfigData).doesNotThrowAnyException();
        verify(hosts).saveAll(anyIterable());
        verify(configs).saveAll(anyIterable());
    }

    @Test
    @DisplayName("ORA-00942 가 아닌 오류는 그대로 던진다")
    void propagatesOtherErrors() {
        AppHostJpaRepository hosts = mock(AppHostJpaRepository.class);
        ConsoleCaravanHubConfigJpaRepository configs = mock(ConsoleCaravanHubConfigJpaRepository.class);
        DataAccessResourceFailureException denied = new DataAccessResourceFailureException("ORA-01031",
                new SQLException("ORA-01031: insufficient privileges", "42000", 1031));
        when(hosts.saveAll(anyIterable())).thenThrow(denied);
        when(configs.saveAll(anyIterable())).thenThrow(new IllegalStateException("다른 오류"));
        CaravanMetaSeeder seeder = new CaravanMetaSeeder(hosts, configs);

        assertThatThrownBy(seeder::initAppHostData).isSameAs(denied);
        assertThatThrownBy(seeder::initCaravanHubConfigData).isInstanceOf(IllegalStateException.class);
    }

    /** Spring 이 Oracle 표 없음 오류를 감싸는 모양 — 원인 사슬 끝에 오류 코드 942 의 SQLException. */
    private static RuntimeException oracleError(int code, String message) {
        return new InvalidDataAccessResourceUsageException("could not execute statement",
                new RuntimeException("JDBC exception", new SQLSyntaxErrorException(message, "42000", code)));
    }
}
