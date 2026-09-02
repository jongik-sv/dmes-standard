package com.dongkuk.caravan.hub.poc;

import java.io.File;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * PoC 메인 진입점 (bootRun / 실행). WAR 진입점은 별도 {@link ServletInitializer}.
 * 듀얼 DataSource 수동 구성 → DataSourceAutoConfiguration 제외.
 */
@SpringBootApplication(exclude = {
        org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration.class
})
public class PocApplication {

    /** SQLite 파일이 놓일 디렉터리를 미리 생성(부모 디렉터리 자동생성 안 됨). WildFly cwd 무관. */
    static void ensureDataDir() {
        new File(System.getProperty("user.home"), "camel-hub-poc-data").mkdirs();
    }

    public static void main(String[] args) {
        ensureDataDir();
        SpringApplication.run(PocApplication.class, args);
    }
}
