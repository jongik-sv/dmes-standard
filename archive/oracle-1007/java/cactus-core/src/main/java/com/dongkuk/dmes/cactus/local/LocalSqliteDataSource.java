package com.dongkuk.dmes.cactus.local;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.Profiles;

/**
 * Resolves local SQLite files to the shared src/backend/data directory.
 */
public final class LocalSqliteDataSource {

    private LocalSqliteDataSource() {
    }

    public static void configure(SpringApplication application, String databaseFileName) {
        application.addInitializers(context -> configure(context, databaseFileName));
    }

    private static void configure(ConfigurableApplicationContext context, String databaseFileName) {
        ConfigurableEnvironment environment = context.getEnvironment();
        // local 단독 active 시에만 sqlite URL 강제 override.
        // 외부 DB 프로파일 동시 active 시 해당 프로파일 yml 의 spring.datasource 값을 그대로 사용 (sqlite override 회피).
        // 프로파일 개편 (2026-07-07 JNDI 전환 설계): 직결 local-ph/local-kp, WildFly JNDI dev/prod/wildfly 추가.
        //   구 mssql 은 폐기됐지만 잔존 launch config fail-fast 를 위해 제외 목록에 유지.
        // acceptsProfiles 사용 — spring.profiles.default 폴백(active 비어있고 default=local)도 local 로 인식.
        boolean localProfile = environment.acceptsProfiles(Profiles.of("local"));
        boolean externalDbProfile = environment.acceptsProfiles(
                Profiles.of("mssql", "local-ph", "local-kp", "dev", "prod", "wildfly"));
        if (!localProfile || externalDbProfile) {
            return;
        }

        Path dataDir = resolveBackendDataDir();
        createDataDir(dataDir);
        String jdbcUrl = "jdbc:sqlite:" + dataDir.resolve(databaseFileName);
        environment.getPropertySources().addFirst(new MapPropertySource(
            "localSqliteDataSource",
            Map.of("spring.datasource.url", jdbcUrl)
        ));
    }

    public static Path resolveBackendDataDir() {
        Path current = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        for (Path path = current; path != null; path = path.getParent()) {
            Path fromRepositoryRoot = path.resolve("src/backend/data").normalize();
            if (Files.isDirectory(fromRepositoryRoot)) {
                return fromRepositoryRoot;
            }

            Path fromBackendRoot = path.resolve("data").normalize();
            if (Files.isDirectory(fromBackendRoot) && "backend".equals(fileName(path))) {
                return fromBackendRoot;
            }

            Path fromModuleRoot = path.resolve("../data").normalize();
            if (Files.isDirectory(fromModuleRoot) && "backend".equals(fileName(fromModuleRoot.getParent()))) {
                return fromModuleRoot;
            }
        }

        return current.resolve("../data").normalize();
    }

    private static void createDataDir(Path dataDir) {
        try {
            Files.createDirectories(dataDir);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to create local SQLite data directory: " + dataDir, e);
        }
    }

    private static String fileName(Path path) {
        Path fileName = path == null ? null : path.getFileName();
        return fileName == null ? "" : fileName.toString();
    }
}
