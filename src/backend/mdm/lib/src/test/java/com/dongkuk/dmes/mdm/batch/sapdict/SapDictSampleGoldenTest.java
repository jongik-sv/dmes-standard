package com.dongkuk.dmes.mdm.batch.sapdict;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * TSK-04-05 design.md §3.5 — 가상 샘플 추출 파일(사례 S1~S17)로 끝에서 끝까지 돌려 다섯 출력이 구현 전에 손으로 쓴
 * {@code expected/*.csv} 와 행 목록 단위로 같은지 확인한다(spec 수용 기준 1). 입력은 클래스패스의 샘플을 그대로 읽는다.
 * 바이트가 아니라 파싱 결과를 비교한다 — BOM·줄끝은 {@link SapCsvTest}, 바이트 결정성은 {@link SapDictCandidateCliTest} 가 맡는다.
 */
class SapDictSampleGoldenTest {

    @TempDir
    Path out;

    private static Path resource(String path) throws Exception {
        return Path.of(SapDictSampleGoldenTest.class.getResource("/sap-dict/" + path).toURI());
    }

    private void runSample() throws Exception {
        ByteArrayOutputStream stdout = new ByteArrayOutputStream();
        ByteArrayOutputStream stderr = new ByteArrayOutputStream();
        int code = SapDictCandidateCli.run(
                new String[] {"--in", resource("sample").toString(), "--out", out.toString()},
                new PrintStream(stdout, true, StandardCharsets.UTF_8), new PrintStream(stderr, true, StandardCharsets.UTF_8));
        assertEquals(0, code, stderr.toString(StandardCharsets.UTF_8));
    }

    private static List<List<String>> parse(Path file) throws Exception {
        return SapCsv.parse(Files.readString(file, StandardCharsets.UTF_8));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "term-candidates.csv", "domain-candidates.csv", "column-candidates.csv",
            "column-system-candidates.csv", "unmatched-fields.csv"})
    void 샘플_출력이_손으로_쓴_기대_출력과_행_단위로_같다(String file) throws Exception {
        runSample();

        assertEquals(parse(resource("expected/" + file)), parse(out.resolve(file)));
    }

    @Test
    void 미대응_사유_분포가_샘플_사례와_같다() throws Exception {
        runSample();

        List<List<String>> unmatched = parse(out.resolve("unmatched-fields.csv"));
        Map<String, Integer> byReason = new TreeMap<>();
        for (List<String> row : unmatched.subList(1, unmatched.size())) {
            for (String reason : row.get(3).split(";")) {
                byReason.merge(reason, 1, Integer::sum);
            }
        }
        assertEquals(8, unmatched.size() - 1);
        assertEquals(Map.of(
                "NO_DATA_ELEMENT", 1,          // S7
                "DATA_ELEMENT_NOT_FOUND", 1,   // S9
                "UNSUPPORTED_TYPE", 1,         // S8
                "NO_KOREAN_LABEL", 3,          // S10 ×2, S12
                "FIELD_NAME_CONFLICT", 4),     // S10 ×2, S11 ×2
                byReason);
    }

    @Test
    void 샘플에서도_대상_행은_후보와_미대응_중_정확히_한_곳에_들어간다() throws Exception {
        runSample();

        // 대상 행 = 활성(AS4LOCAL=A)·비구조 DD03L 행. 샘플 22행 − 구조 2행(S13) − 비활성 1행(S14) = 19행
        List<List<String>> dd03l = parse(resource("sample/DD03L.csv"));
        List<String> header = dd03l.get(0);
        int tab = header.indexOf("TABNAME");
        int field = header.indexOf("FIELDNAME");
        int local = header.indexOf("AS4LOCAL");
        List<List<String>> targets = dd03l.subList(1, dd03l.size()).stream()
                .filter(r -> r.get(local).equals("A") && !r.get(field).startsWith("."))
                .toList();
        assertEquals(19, targets.size());

        Set<String> candidateNames = new HashSet<>();
        List<List<String>> candidates = parse(out.resolve("column-system-candidates.csv"));
        candidates.subList(1, candidates.size()).forEach(r -> candidateNames.add(r.get(1)));
        Set<List<String>> unmatchedKeys = new HashSet<>();
        List<List<String>> unmatched = parse(out.resolve("unmatched-fields.csv"));
        unmatched.subList(1, unmatched.size()).forEach(r -> unmatchedKeys.add(List.of(r.get(0), r.get(1))));

        long inCandidates = targets.stream().filter(r -> candidateNames.contains(r.get(field))).count();
        assertEquals(targets.size(), unmatchedKeys.size() + inCandidates);
        for (List<String> r : targets) {
            boolean inCandidate = candidateNames.contains(r.get(field));
            boolean inUnmatched = unmatchedKeys.contains(List.of(r.get(tab), r.get(field)));
            assertEquals(true, inCandidate ^ inUnmatched, r.toString());
        }
    }
}
