package com.dongkuk.dmes.mls.testdb;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * mls 서비스 시험용 SQLite 파일 — 작업 트리의 {@code ../data/mls.db} 를 건드리지 않도록 임시 파일을 쓴다.
 *
 * <p>클래스마다 {@code @TempDir} 을 쓰면 캐시된 스프링 컨텍스트가 지워진 파일을 가리키게 되므로, JVM 안에서 한 번만 만들고
 * 끝날 때 지운다. 이 클래스를 상속한 시험끼리 컨텍스트 하나를 나눠 쓰며, 각 시험은 {@code @Transactional} 롤백으로 서로
 * 격리한다. 컨텍스트가 처음 뜰 때 Flyway 가 V1~V3 를 새 파일에 적용한다.
 */
public abstract class MlsTestDb {

    private static final Path FILE;

    static {
        try {
            Path dir = Files.createTempDirectory("mls-test-db");
            FILE = dir.resolve("mls-test.db");
            dir.toFile().deleteOnExit();
            FILE.toFile().deleteOnExit();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @DynamicPropertySource
    static void mlsTestDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + FILE);
    }
}
