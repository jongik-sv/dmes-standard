package com.dongkuk.dmes.mdm.batch.sapdict;

import com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.UnmatchedField;
import com.dongkuk.dmes.mdm.batch.sapdict.SapDictCandidates.UnmatchedReason;
import java.io.IOException;
import java.io.PrintStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/**
 * SAP 데이터 엘리먼트 후보 추출 배치의 진입점(TSK-04-05 design.md D1, 불변 규칙 I19). Spring 컨텍스트 없이 돈다.
 * 실행: {@code cd src/backend/mdm && ../gradlew :lib:sapDictCandidates --args="--in <dir> --out <dir>"}.
 *
 * <p>종료 코드: 0 성공, 1 입력 오류(출력 파일을 하나도 쓰지 않는다, I4), 2 인자 오류, 3 출력 쓰기 실패.
 */
public final class SapDictCandidateCli {

    static final String USAGE = "Usage: SapDictCandidateCli --in <입력 디렉터리> --out <출력 디렉터리>"
            + " [--charset <입력 문자셋, 기본 UTF-8>]";

    private SapDictCandidateCli() {
    }

    public static void main(String[] args) {
        System.exit(run(args, System.out, System.err));
    }

    static int run(String[] args, PrintStream out, PrintStream err) {
        Path in = null;
        Path outDir = null;
        Charset charset = StandardCharsets.UTF_8;
        for (int i = 0; i < args.length; i++) {
            String option = args[i];
            if (!List.of("--in", "--out", "--charset").contains(option)) {
                return usage(err, "모르는 인자: " + option);
            }
            if (i + 1 >= args.length) {
                return usage(err, option + " 에 값이 없다");
            }
            String value = args[++i];
            switch (option) {
                case "--in" -> in = Path.of(value);
                case "--out" -> outDir = Path.of(value);
                default -> {
                    try {
                        charset = Charset.forName(value);
                    } catch (IllegalArgumentException e) {
                        return usage(err, "모르는 문자셋: " + value);
                    }
                }
            }
        }
        if (in == null || outDir == null) {
            return usage(err, "--in 과 --out 은 필수다");
        }

        // 읽기·변환·렌더링을 모두 끝낸 뒤에만 쓰기를 시작한다(I4)
        SapDictCandidates candidates;
        Map<String, byte[]> files;
        try {
            candidates = SapDictCandidateExtractor.extract(SapDdicReader.read(in, charset));
            files = SapDictCandidateWriter.render(candidates);
        } catch (SapDictInputException e) {
            err.println("입력 오류: " + e.getMessage());
            return 1;
        } catch (IOException e) {
            err.println("입력을 읽지 못했다: " + e);
            return 1;
        }
        try {
            SapDictCandidateWriter.write(files, outDir);
        } catch (IOException e) {
            err.println("출력을 쓰지 못했다: " + e);
            return 3;
        }
        printSummary(out, outDir, candidates);
        return 0;
    }

    private static int usage(PrintStream err, String message) {
        err.println(message);
        err.println(USAGE);
        return 2;
    }

    private static void printSummary(PrintStream out, Path outDir, SapDictCandidates candidates) {
        out.println("SAP 데이터 엘리먼트 후보 추출 완료: " + outDir.toAbsolutePath());
        out.println("  " + SapDictCandidateWriter.TERMS + " " + candidates.terms().size() + "행");
        out.println("  " + SapDictCandidateWriter.DOMAINS + " " + candidates.domains().size() + "행");
        out.println("  " + SapDictCandidateWriter.COLUMNS + " " + candidates.columns().size() + "행");
        out.println("  " + SapDictCandidateWriter.COLUMN_SYSTEMS + " " + candidates.columnSystems().size() + "행");
        out.println("  " + SapDictCandidateWriter.UNMATCHED + " " + candidates.unmatched().size() + "행");
        out.println("미대응 사유별 행 수:");
        for (UnmatchedReason reason : UnmatchedReason.values()) {
            long count = candidates.unmatched().stream().map(UnmatchedField::reasons).filter(r -> r.contains(reason)).count();
            out.println("  " + reason.name() + " " + count + "행");
        }
    }
}
