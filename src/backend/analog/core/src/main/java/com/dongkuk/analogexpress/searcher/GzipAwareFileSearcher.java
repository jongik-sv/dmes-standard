package com.dongkuk.analogexpress.searcher;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.FileFilter;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.zip.GZIPInputStream;

/**
 * gzip 아카이브({@code .gz}) 를 인지하는 파일 후보 수집기 — {@link FileSearcher} 의 gz 확장판.
 *
 * <p>원칙 — 엔진(TextSearcher 계열)은 평문 파일만 읽는다. {@code .gz} 는 절대 원본 그대로
 * 후보에 넣지 않는다(바이너리를 텍스트로 통독하면 조용히 0건 + 사이즈 한도 잠식).
 * 압축본을 읽어야 하면 먼저 캐시 디렉터리에 해제하고, 풀린 평문 파일을 기존 엔진으로 읽는다
 * (RandomAccessFile 이진탐색 능력 보존).
 *
 * <ul>
 *     <li>파일명 필터는 꼬리 {@code .gz} 를 뗀 이름으로 평가한다 — 필터를 통과한 아카이브만 해제.
 *         (필터는 파일명 기반이어야 한다. lastModified 류 속성 필터는 gz 평가 시
 *         존재하지 않는 이름 프록시 File 을 보므로 지원하지 않는다.)</li>
 *     <li>같은 이름의 평문 파일이 base 디렉터리에 이미 있으면(아직 압축 전) 그 평문이 우선 —
 *         gz 중복 해제 없음.</li>
 *     <li>캐시 재사용 — 캐시 파일이 존재하고 mtime ≥ gz mtime 이면 재해제 생략.</li>
 *     <li>동시 요청 대비 — 임시파일에 해제 후 원자적 rename(ATOMIC_MOVE) 으로 반파일 읽기 방지.</li>
 *     <li>해제 실패(손상 gz 등)는 WARN 로그 후 해당 파일만 스킵 — 전체 검색을 실패시키지 않는다.</li>
 *     <li>사이즈 한도({@code limitByte}) 는 해제 후 평문 크기 기준으로 계산한다.</li>
 * </ul>
 */
public class GzipAwareFileSearcher {
    private static final Logger log = LoggerFactory.getLogger(GzipAwareFileSearcher.class);

    private static final String GZ_SUFFIX = ".gz";

    /**
     * 조건에 맞는 평문 파일 배열을 반환한다. 찾은 파일이 없으면 길이 0 배열.
     *
     * @param baseDirectory 파일을 찾을 Base 디렉터리
     * @param limitByte     파일크기 제한(해제 후 평문 크기 기준). 무조건 파일 1개는 조건에 상관없음
     * @param fileFilter    파일명 기반 필터 — gz 는 {@code .gz} 를 뗀 이름으로 평가된다
     * @param sort          정렬 전략 (null 허용)
     * @param unzipCacheDir gz 해제 캐시 디렉터리 (없으면 생성)
     * @return 조건에 맞는 평문 파일 배열 (gz 는 해제본으로 편입)
     */
    public static File[] findFile(String baseDirectory, long limitByte, FileFilter fileFilter,
                                  Comparator<File> sort, File unzipCacheDir) {
        File dir = new File(baseDirectory);
        File[] entries = dir.listFiles();
        if (entries == null)
            return new File[]{};

        List<File> candidates = new ArrayList<>();

        // 1) 평문 파일 — 기존과 동일하게 필터 평가. 디렉터리(캐시 디렉터리 포함) 는 제외.
        for (File entry : entries) {
            if (!entry.isFile())
                continue;
            if (isGz(entry))
                continue; // .gz 원본은 어떤 경우에도 직접 후보 금지
            if (fileFilter.accept(entry))
                candidates.add(entry);
        }

        // 2) gz 아카이브 — .gz 뗀 이름으로 필터 평가 후, 통과분만 캐시에 해제해 편입.
        for (File entry : entries) {
            if (!entry.isFile() || !isGz(entry))
                continue;
            String plainName = entry.getName().substring(0, entry.getName().length() - GZ_SUFFIX.length());
            File plainTwin = new File(dir, plainName);
            if (plainTwin.isFile())
                continue; // 같은 이름 평문이 base 에 이미 존재 — 그 평문이 우선
            if (!fileFilter.accept(plainTwin))
                continue; // 필터 미통과 gz 는 해제하지 않는다
            File unzipped = unzipToCache(entry, unzipCacheDir, plainName);
            if (unzipped != null)
                candidates.add(unzipped);
        }

        File[] files = candidates.toArray(new File[0]);
        if (sort != null)
            Arrays.sort(files, sort);

        // FileSearcher.findFile 과 동일한 누적 사이즈 컷 — 여기서 length() 는 해제 후 평문 크기다.
        long accFileLength = 0;
        for (int i = 0; i < files.length; i++) {
            accFileLength += files[i].length();
            if (accFileLength >= limitByte) {
                if (i <= 1) {
                    return Arrays.copyOf(files, 1);
                } else {
                    return Arrays.copyOf(files, i);
                }
            }
        }
        return files;
    }

    private static boolean isGz(File file) {
        return file.getName().toLowerCase().endsWith(GZ_SUFFIX);
    }

    /**
     * gz 를 캐시 디렉터리에 해제한다. 캐시가 최신(mtime ≥ gz mtime)이면 재해제 생략.
     * 실패 시 WARN 후 {@code null} 반환 — 호출측은 해당 파일만 스킵한다.
     */
    private static File unzipToCache(File gzFile, File cacheDir, String plainName) {
        File cached = new File(cacheDir, plainName);
        if (cached.isFile() && cached.lastModified() >= gzFile.lastModified()) {
            return cached; // 캐시 재사용
        }
        Path tmp = null;
        try {
            Files.createDirectories(cacheDir.toPath());
            tmp = Files.createTempFile(cacheDir.toPath(), plainName + ".", ".unzip-tmp");
            try (InputStream in = new GZIPInputStream(Files.newInputStream(gzFile.toPath()));
                 OutputStream out = Files.newOutputStream(tmp)) {
                in.transferTo(out);
            }
            try {
                // 동시 요청이 같은 gz 를 풀어도 완전한 파일끼리 원자적으로 교체된다 — 반파일 읽기 없음.
                Files.move(tmp, cached.toPath(), StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp, cached.toPath(), StandardCopyOption.REPLACE_EXISTING);
            }
            log.info("gz 해제 완료: {} -> {}", gzFile.getName(), cached.getAbsolutePath());
            return cached;
        } catch (IOException e) {
            log.warn("gz 해제 실패 — 해당 파일만 검색에서 제외: {}", gzFile.getAbsolutePath(), e);
            if (tmp != null) {
                try {
                    Files.deleteIfExists(tmp);
                } catch (IOException ignore) {
                    // 임시파일 정리 실패는 무시 — 캐시 판정(정확한 이름 매칭)에 영향 없음
                }
            }
            return null;
        }
    }
}
