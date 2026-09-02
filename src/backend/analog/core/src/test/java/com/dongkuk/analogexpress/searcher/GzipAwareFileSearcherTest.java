package com.dongkuk.analogexpress.searcher;

import com.dongkuk.analogexpress.comparator.SortStrategy;
import com.dongkuk.analogexpress.filter.file.CaseInsensitiveFileNameRangeFilter;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.io.FileFilter;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.zip.GZIPOutputStream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link GzipAwareFileSearcher} — gz 아카이브 인지 후보 수집 검증.
 * 픽스처는 전부 {@link TempDir} 에 프로그램적으로 생성한다 (디스크 픽스처 추가 없음).
 */
class GzipAwareFileSearcherTest {

    private static final long NO_LIMIT = 1024L * 1024 * 1024;

    @TempDir
    Path baseDir;

    private Path cacheDir() {
        return baseDir.resolve(".analog-unzip-cache");
    }

    /** gz 파일을 만들고 mtime 을 과거(now-60s)로 박아 캐시 mtime 판정을 결정적으로 만든다. */
    private File writeGz(String name, String content) throws IOException {
        Path gz = baseDir.resolve(name);
        try (OutputStream out = new GZIPOutputStream(Files.newOutputStream(gz))) {
            out.write(content.getBytes(StandardCharsets.UTF_8));
        }
        File file = gz.toFile();
        assertThat(file.setLastModified(System.currentTimeMillis() - 60_000)).isTrue();
        return file;
    }

    private File writePlain(String name, String content) throws IOException {
        Path plain = baseDir.resolve(name);
        Files.writeString(plain, content, StandardCharsets.UTF_8);
        return plain.toFile();
    }

    private FileFilter rangeFilter(String from, String to) {
        return new CaseInsensitiveFileNameRangeFilter(from, to);
    }

    private File[] find(FileFilter filter) {
        return GzipAwareFileSearcher.findFile(
                baseDir.toString(), NO_LIMIT, filter, SortStrategy.ascendingSortByFileName, cacheDir().toFile());
    }

    @Test
    void gzArchive_isUnzippedIntoCache_andGzItselfNeverIncluded() throws IOException {
        writeGz("app.2026-05-14.0.log.gz", "gz inside content\n");

        File[] files = find(rangeFilter("app.2026-05-14.0.log", "app.2026-05-14.999999999.log"));

        assertThat(files).hasSize(1);
        assertThat(files[0].getName()).isEqualTo("app.2026-05-14.0.log");
        // .gz 원본이 아닌 캐시의 해제본이어야 한다
        assertThat(files[0].getParentFile().toPath()).isEqualTo(cacheDir());
        assertThat(Files.readString(files[0].toPath())).isEqualTo("gz inside content\n");
        assertThat(Arrays.stream(files).map(File::getName)).noneMatch(n -> n.endsWith(".gz"));
    }

    @Test
    void plainFileWithSameName_winsOverGz_noDuplicate() throws IOException {
        writePlain("app.2026-05-14.0.log", "plain version\n");
        writeGz("app.2026-05-14.0.log.gz", "gz version\n");

        File[] files = find(rangeFilter("app.2026-05-14.0.log", "app.2026-05-14.999999999.log"));

        assertThat(files).hasSize(1);
        assertThat(files[0].getParentFile().toPath()).isEqualTo(baseDir);
        assertThat(Files.readString(files[0].toPath())).isEqualTo("plain version\n");
        // 불필요한 해제도 없어야 한다
        assertThat(cacheDir().resolve("app.2026-05-14.0.log")).doesNotExist();
    }

    @Test
    void cacheIsReused_whenCacheIsFresh() throws IOException {
        writeGz("app.2026-05-14.0.log.gz", "original content\n");
        FileFilter filter = rangeFilter("app.2026-05-14.0.log", "app.2026-05-14.999999999.log");

        find(filter); // 1차 — 해제
        Path cached = cacheDir().resolve("app.2026-05-14.0.log");
        assertThat(cached).exists();

        // 캐시 파일을 marker 로 교체(mtime 은 현재 = gz(now-60s) 보다 최신 유지).
        // 2차 호출이 재해제한다면 marker 가 원문으로 되돌아간다.
        Files.writeString(cached, "marker-not-reunzipped\n", StandardCharsets.UTF_8);

        File[] second = find(filter);

        assertThat(second).hasSize(1);
        assertThat(Files.readString(second[0].toPath())).isEqualTo("marker-not-reunzipped\n");
    }

    @Test
    void cacheIsRefreshed_whenGzIsNewerThanCache() throws IOException {
        File gz = writeGz("app.2026-05-14.0.log.gz", "v1 content\n");
        FileFilter filter = rangeFilter("app.2026-05-14.0.log", "app.2026-05-14.999999999.log");

        find(filter); // 1차 — v1 해제
        Path cached = cacheDir().resolve("app.2026-05-14.0.log");
        assertThat(Files.readString(cached)).isEqualTo("v1 content\n");

        // gz 갱신 + mtime 을 캐시보다 미래로 — stale 캐시는 재해제되어야 한다
        try (OutputStream out = new GZIPOutputStream(Files.newOutputStream(gz.toPath()))) {
            out.write("v2 content\n".getBytes(StandardCharsets.UTF_8));
        }
        assertThat(gz.setLastModified(cached.toFile().lastModified() + 5_000)).isTrue();

        File[] second = find(filter);

        assertThat(second).hasSize(1);
        assertThat(Files.readString(second[0].toPath())).isEqualTo("v2 content\n");
    }

    @Test
    void corruptGz_isSkipped_withoutFailingWholeSearch() throws IOException {
        writePlain("app.2026-05-14.0.log", "good plain line\n");
        // gzip 헤더 매직만 흉내낸 손상 파일
        Files.write(baseDir.resolve("app.2026-05-15.0.log.gz"),
                new byte[]{0x1f, (byte) 0x8b, 0x08, 0x00, 0x13, 0x37, (byte) 0xde, (byte) 0xad});

        File[] files = find(rangeFilter("app.2026-05-14.0.log", "app.2026-05-15.999999999.log"));

        assertThat(files).hasSize(1);
        assertThat(files[0].getName()).isEqualTo("app.2026-05-14.0.log");
        assertThat(cacheDir().resolve("app.2026-05-15.0.log")).doesNotExist();
    }

    @Test
    void sizeLimit_isAppliedOnUnzippedPlainLength() throws IOException {
        // 고압축 내용 — 평문 200KB, gz 는 수백 byte
        String big = "x".repeat(200 * 1024);
        writeGz("app.2026-05-14.0.log.gz", big);
        writeGz("app.2026-05-15.0.log.gz", big);

        // 한도 300KB — gz(압축) 크기 기준이면 둘 다 통과했을 것.
        // 평문 크기 기준이면 2번째에서 누적 400KB ≥ 300KB → 첫 파일 1개만.
        File[] files = GzipAwareFileSearcher.findFile(
                baseDir.toString(), 300L * 1024,
                rangeFilter("app.2026-05-14.0.log", "app.2026-05-15.999999999.log"),
                SortStrategy.ascendingSortByFileName, cacheDir().toFile());

        assertThat(files).hasSize(1);
        assertThat(files[0].getName()).isEqualTo("app.2026-05-14.0.log");
    }

    @Test
    void gzOutsideNameRange_isNotUnzippedAtAll() throws IOException {
        writeGz("app.2026-05-20.0.log.gz", "out of range\n");

        File[] files = find(rangeFilter("app.2026-05-14.0.log", "app.2026-05-15.999999999.log"));

        assertThat(files).isEmpty();
        // 필터 미통과 gz 는 해제 자체를 하지 않는다
        assertThat(cacheDir().resolve("app.2026-05-20.0.log")).doesNotExist();
    }
}
