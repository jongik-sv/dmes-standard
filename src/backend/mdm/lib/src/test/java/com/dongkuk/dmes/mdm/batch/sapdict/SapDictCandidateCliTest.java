package com.dongkuk.dmes.mdm.batch.sapdict;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * TSK-04-05 design.md §3.6 — {@link SapDictCandidateCli#run} 의 파일 경계와 종료 코드(불변 규칙 I3·I4·I17·I18).
 * 출력은 {@code --out} 의 다섯 파일뿐이고, 입력은 바뀌지 않으며, 입력 오류면 출력을 하나도 만들지 않는다.
 */
class SapDictCandidateCliTest {

    private static final Set<String> OUTPUT_NAMES = Set.of(
            "term-candidates.csv", "domain-candidates.csv", "column-candidates.csv",
            "column-system-candidates.csv", "unmatched-fields.csv");

    @TempDir
    Path temp;

    Path in;
    Path out;
    final ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    final ByteArrayOutputStream stderr = new ByteArrayOutputStream();

    @BeforeEach
    void copySample() throws Exception {
        in = Files.createDirectory(temp.resolve("in"));
        out = temp.resolve("out");
        Path sample = Path.of(getClass().getResource("/sap-dict/sample").toURI());
        for (String name : List.of("DD03L.csv", "DD04L.csv", "DD04T.csv", "DD01L.csv")) {
            Files.copy(sample.resolve(name), in.resolve(name));
        }
    }

    private int run(String... args) {
        stdout.reset();
        stderr.reset();
        return SapDictCandidateCli.run(args,
                new PrintStream(stdout, true, StandardCharsets.UTF_8), new PrintStream(stderr, true, StandardCharsets.UTF_8));
    }

    private int runSample() {
        return run("--in", in.toString(), "--out", out.toString());
    }

    private static Set<String> names(Path dir) throws IOException {
        if (!Files.exists(dir)) {
            return Set.of();
        }
        try (Stream<Path> files = Files.list(dir)) {
            return files.map(p -> p.getFileName().toString()).collect(Collectors.toSet());
        }
    }

    private static Map<String, String> sha256(Path dir) throws Exception {
        Map<String, String> digests = new TreeMap<>();
        try (Stream<Path> files = Files.list(dir)) {
            for (Path p : files.toList()) {
                digests.put(p.getFileName().toString(),
                        HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(p))));
            }
        }
        return digests;
    }

    @Test
    void 출력은_out_디렉터리의_다섯_파일뿐이다() throws Exception {
        assertFalse(Files.exists(out));

        assertEquals(0, runSample(), stderr.toString(StandardCharsets.UTF_8));

        assertEquals(OUTPUT_NAMES, names(out));
        assertEquals(Set.of("in", "out"), names(temp), "out 밖에 다른 파일을 만들지 않는다");
    }

    @Test
    void out_의_다른_파일은_건드리지_않는다() throws Exception {
        Files.createDirectory(out);
        Path keep = Files.writeString(out.resolve("keep.txt"), "keep me");
        FileTime keptAt = FileTime.fromMillis(1_000_000_000_000L);
        Files.setLastModifiedTime(keep, keptAt);
        Files.writeString(out.resolve("term-candidates.csv"), "old content");

        assertEquals(0, runSample(), stderr.toString(StandardCharsets.UTF_8));

        assertEquals("keep me", Files.readString(keep));
        assertEquals(keptAt, Files.getLastModifiedTime(keep));
        assertFalse(Files.readString(out.resolve("term-candidates.csv"), StandardCharsets.UTF_8).contains("old content"),
                "같은 이름의 기존 출력은 덮어쓴다");
        Set<String> expected = new HashSet<>(OUTPUT_NAMES);
        expected.add("keep.txt");
        assertEquals(expected, names(out));
    }

    @Test
    void 입력_파일은_바뀌지_않는다() throws Exception {
        Map<String, String> before = sha256(in);

        assertEquals(0, runSample(), stderr.toString(StandardCharsets.UTF_8));

        assertEquals(before, sha256(in));
    }

    @ParameterizedTest
    @ValueSource(strings = {"missing-header", "duplicate-key", "non-numeric-leng", "missing-file"})
    void 입력_오류면_출력_파일을_하나도_만들지_않는다(String kind) throws Exception {
        switch (kind) {
            case "missing-header" -> Files.writeString(in.resolve("DD04L.csv"),
                    "ROLLNAME,DOMNAME,DATATYPE,LENG\nMANDT,MANDT,CLNT,000003\n");
            case "duplicate-key" -> Files.writeString(in.resolve("DD01L.csv"),
                    Files.readString(in.resolve("DD01L.csv")) + "MANDT,A,CLNT,000003,000000,000003,\n");
            case "non-numeric-leng" -> Files.writeString(in.resolve("DD04L.csv"),
                    Files.readString(in.resolve("DD04L.csv")) + "ZZDE_BAD,A,,CHAR,1O,000000\n");
            case "missing-file" -> Files.delete(in.resolve("DD04T.csv"));
            default -> throw new IllegalArgumentException(kind);
        }

        assertEquals(1, runSample());

        assertEquals(Set.of(), names(out), "새 출력 디렉터리에 아무것도 없어야 한다");
        assertFalse(stderr.toString(StandardCharsets.UTF_8).isBlank(), "오류 메시지를 err 로 알린다");
    }

    @Test
    void 입력_오류면_기존_출력_파일도_바뀌지_않는다() throws Exception {
        Files.createDirectory(out);
        Files.writeString(out.resolve("unmatched-fields.csv"), "previous run");
        Files.writeString(in.resolve("DD03L.csv"), "TABNAME,ROLLNAME\nZTPP_COIL,MANDT\n");

        assertEquals(1, runSample());

        assertEquals(Set.of("unmatched-fields.csv"), names(out));
        assertEquals("previous run", Files.readString(out.resolve("unmatched-fields.csv")));
    }

    @Test
    void 같은_입력으로_두_번_실행하면_바이트가_같다() throws Exception {
        Path out2 = temp.resolve("out2");

        assertEquals(0, runSample());
        assertEquals(0, run("--in", in.toString(), "--out", out2.toString()));

        for (String name : OUTPUT_NAMES) {
            assertArrayEquals(Files.readAllBytes(out.resolve(name)), Files.readAllBytes(out2.resolve(name)), name);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"no-in", "no-out", "unknown-option", "no-args", "bad-charset"})
    void 인자가_없거나_모르는_옵션이면_종료_코드_2_와_사용법을_출력한다(String kind) throws Exception {
        String[] args = switch (kind) {
            case "no-in" -> new String[] {"--out", out.toString()};
            case "no-out" -> new String[] {"--in", in.toString()};
            case "unknown-option" -> new String[] {"--in", in.toString(), "--out", out.toString(), "--xyz"};
            case "no-args" -> new String[0];
            case "bad-charset" -> new String[] {"--in", in.toString(), "--out", out.toString(), "--charset", "NO-SUCH-CS"};
            default -> throw new IllegalArgumentException(kind);
        };

        assertEquals(2, run(args));

        assertTrue(stderr.toString(StandardCharsets.UTF_8).contains("Usage:"), stderr.toString(StandardCharsets.UTF_8));
        assertEquals(Set.of(), names(out));
    }

    @Test
    void 성공하면_요약을_출력한다() {
        assertEquals(0, runSample());

        String summary = stdout.toString(StandardCharsets.UTF_8);
        for (String line : List.of(
                "term-candidates.csv 15행", "domain-candidates.csv 7행", "column-candidates.csv 11행",
                "column-system-candidates.csv 9행", "unmatched-fields.csv 8행",
                "NO_DATA_ELEMENT 1행", "DATA_ELEMENT_NOT_FOUND 1행", "UNSUPPORTED_TYPE 1행",
                "NO_KOREAN_LABEL 3행", "FIELD_NAME_CONFLICT 4행")) {
            assertTrue(summary.contains(line), "요약에 '" + line + "' 이(가) 없다:\n" + summary);
        }
    }

    /** 설계 I17 — {@code --charset} 은 입력에만 적용하고 출력은 항상 UTF-8(BOM)이다. Build 에서 더한 테스트. */
    @Test
    void charset_옵션은_입력에만_적용되고_출력은_UTF8_이다() throws Exception {
        Charset ms949 = Charset.forName("MS949");
        for (String name : List.of("DD03L.csv", "DD04L.csv", "DD04T.csv", "DD01L.csv")) {
            String text = Files.readString(in.resolve(name), StandardCharsets.UTF_8).replace("\uFEFF", "");
            Files.write(in.resolve(name), text.getBytes(ms949));
        }

        assertEquals(0, run("--in", in.toString(), "--out", out.toString(), "--charset", "MS949"));

        byte[] bytes = Files.readAllBytes(out.resolve("column-candidates.csv"));
        assertArrayEquals(new byte[] {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF}, Arrays.copyOf(bytes, 3));
        String text = new String(bytes, StandardCharsets.UTF_8);
        assertTrue(text.contains("ZZDE_COIL_THK,코일 두께,코일;두께"), text);
    }
}
