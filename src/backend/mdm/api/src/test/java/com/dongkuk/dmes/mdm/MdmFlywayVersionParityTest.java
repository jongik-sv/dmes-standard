package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * 불변 규칙 4(design.md §5) — sqlite/mssql 두 마이그레이션 디렉터리의 Flyway 버전 번호 집합이
 * 항상 같은지 자동 비교한다. classpath 리소스로 두 디렉터리를 찾아 파일명에서 {@code V\d+(_\d+)?}
 * 버전 토큰만 뽑아 집합을 비교한다.
 */
class MdmFlywayVersionParityTest {

    private static final Pattern VERSION_TOKEN = Pattern.compile("^V(\\d+(?:_\\d+)?)__.*\\.sql$");

    @Test
    void sqlite_와_mssql_의_버전_집합이_같다() throws IOException, URISyntaxException {
        Set<String> sqliteVersions = versionsOf("db/migration/mdm/sqlite");
        Set<String> mssqlVersions = versionsOf("db/migration/mdm/mssql");

        assertFalse(sqliteVersions.isEmpty(), "sqlite 마이그레이션 디렉터리가 비어 있다");
        assertFalse(mssqlVersions.isEmpty(), "mssql 마이그레이션 디렉터리가 비어 있다");
        assertEquals(sqliteVersions, mssqlVersions,
                "sqlite/mssql 버전 번호 집합이 다르다 — 불변 규칙 4 위반");
        // TSK-01-02 design.md §5 I8 — V2(TB_MDM_SYSTEM)가 두 방언 모두에 있어야 한다.
        assertTrue(sqliteVersions.containsAll(Set.of("1", "2")), "sqlite 에 V1·V2 가 없다: " + sqliteVersions);
        assertTrue(mssqlVersions.containsAll(Set.of("1", "2")), "mssql 에 V1·V2 가 없다: " + mssqlVersions);
    }

    private Set<String> versionsOf(String classpathDir) throws IOException, URISyntaxException {
        URI uri = getClass().getClassLoader().getResource(classpathDir).toURI();
        Path dir = Paths.get(uri);
        Set<String> versions = new HashSet<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir, "V*.sql")) {
            for (Path file : stream) {
                Matcher matcher = VERSION_TOKEN.matcher(file.getFileName().toString());
                if (matcher.matches()) {
                    versions.add(matcher.group(1));
                }
            }
        }
        return versions;
    }
}
