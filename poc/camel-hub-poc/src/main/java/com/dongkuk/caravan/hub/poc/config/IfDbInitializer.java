package com.dongkuk.caravan.hub.poc.config;

import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * PoC-3 용 테스트 테이블(IF_* 모사)을 <b>ifDataSource</b> 에 생성·시드.
 *
 * <p>3건을 {@code IF_FLAG='N'} 으로 넣고 {@code C_AT} 오름차순으로 순서 확인이 되게 한다.
 * DbInboundRoute 가 폴링→onConsume 으로 {@code 'N'→'Y'} 갱신하는지 검증.</p>
 */
@Component
public class IfDbInitializer implements CommandLineRunner {

    private final JdbcTemplate ifJdbc;

    public IfDbInitializer(@Qualifier("ifDataSource") DataSource ifDataSource) {
        this.ifJdbc = new JdbcTemplate(ifDataSource);
    }

    @Override
    public void run(String... args) {
        ifJdbc.execute("""
                CREATE TABLE IF NOT EXISTS T_POC_INBOUND (
                    IF_SEQ            INTEGER PRIMARY KEY AUTOINCREMENT,
                    TRANSACTION_CODE  TEXT,
                    INTERFACE_MSG     TEXT,
                    IF_FLAG           TEXT DEFAULT 'N',
                    U_AT              TEXT,
                    C_AT              TEXT
                )""");
        ifJdbc.update("DELETE FROM T_POC_INBOUND");
        for (int i = 1; i <= 3; i++) {
            ifJdbc.update(
                    "INSERT INTO T_POC_INBOUND(TRANSACTION_CODE, INTERFACE_MSG, IF_FLAG, U_AT, C_AT) "
                            + "VALUES (?, ?, 'N', ?, ?)",
                    "TC" + i, "poc-msg-" + i, "u" + i, "2026-07-01 00:00:0" + i);
        }
    }
}
