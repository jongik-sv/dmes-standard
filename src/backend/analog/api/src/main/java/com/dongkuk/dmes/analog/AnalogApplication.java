package com.dongkuk.dmes.analog;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration;
import org.springframework.boot.jdbc.autoconfigure.JdbcTemplateAutoConfiguration;

/**
 * DB 뷰어용 읽기전용 데이터소스는 {@code DbViewerDataConfig} 가
 * {@code analog.db.url} 설정 시에만 직접 만든다 (ADR-0002 D5).
 * Boot 기본 DataSource 자동구성은 제외한다 — 미설정 시 기동 실패를 막기 위함.
 */
@SpringBootApplication(exclude = {DataSourceAutoConfiguration.class, JdbcTemplateAutoConfiguration.class})
public class AnalogApplication {
    public static void main(String[] args) {
        SpringApplication.run(AnalogApplication.class, args);
    }
}
