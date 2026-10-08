package com.dongkuk.analogexpress.searcher;

import com.dongkuk.analogexpress.comparator.LoggingTimeComparator;
import com.dongkuk.analogexpress.io.BufferedRandomAccessFile;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 시각 없는 줄(여러 줄 SQL·스택 트레이스)이 길게 이어진 로그에서 시간 범위 이진 탐색이 끝나고 정확한지 확인한다.
 * 이전 구현은 이어진 줄이 길면 "무한 루프 탐지" 예외로 끝났다(로그 뷰어 HTTP 500).
 */
class RandomAccessFileHelperMultilineTest {

    private static final String FORMAT = "yyyy-MM-dd HH:mm:ss.SSS";
    private static final LocalDateTime BASE = LocalDateTime.of(2026, 10, 8, 10, 0, 0);

    @TempDir
    Path dir;

    /** 파일에 쓴 줄 하나. minute 가 -1 이면 시각 없는 이어진 줄이다. */
    private record Line(long offset, int minute) {
    }

    private record Written(File file, List<Line> lines, long length) {
    }

    private Written write(String name, int[] continuationsPerRecord, String eol, boolean trailingEol, int leadingGarbage) throws IOException {
        StringBuilder sb = new StringBuilder();
        List<Line> lines = new ArrayList<>();
        for (int i = 0; i < leadingGarbage; i++) {
            lines.add(new Line(sb.length(), -1));
            sb.append("        leftover of a rotated record ").append(i).append(eol);
        }
        for (int minute = 0; minute < continuationsPerRecord.length; minute++) {
            lines.add(new Line(sb.length(), minute));
            sb.append(String.format("2026-10-08 10:%02d:00.000 [scheduling-1] [] [] DEBUG org.hibernate.SQL - ", minute)).append(eol);
            for (int k = 0; k < continuationsPerRecord[minute]; k++) {
                lines.add(new Line(sb.length(), -1));
                sb.append("        wd1_0.COLUMN_").append(k).append(',').append(eol);
            }
        }
        if (!trailingEol)
            sb.setLength(sb.length() - eol.length());
        File file = dir.resolve(name).toFile();
        Files.writeString(file.toPath(), sb.toString(), StandardCharsets.UTF_8);
        return new Written(file, lines, file.length());
    }

    private static LoggingTimeComparator comparator(int fromMinute, int toMinute) {
        return new LoggingTimeComparator(BASE.plusMinutes(fromMinute), BASE.plusMinutes(toMinute), FORMAT, 0, 23);
    }

    /** 선형으로 훑어 구한 기대 위치: [범위 첫 기록 시작, 범위 마지막 기록에 이어진 마지막 줄 시작]. 범위에 기록이 없으면 {-1, -1}. */
    private static long[] expected(Written w, int from, int to) {
        long start = -1;
        long end = -1;
        boolean inRange = false;
        for (Line line : w.lines) {
            if (line.minute >= 0) {
                inRange = line.minute >= from && line.minute <= to;
                if (inRange && start < 0)
                    start = line.offset;
                if (line.minute > to)
                    break;
            }
            if (inRange)
                end = line.offset;
        }
        return new long[]{start, end};
    }

    private static void assertAllRanges(Written w, int records) throws IOException {
        for (int from = 0; from < records; from++) {
            for (int to = from; to < records; to++) {
                LoggingTimeComparator comparator = comparator(from, to);
                long[] expected = expected(w, from, to);
                String range = w.file.getName() + " range=[" + from + "," + to + "]";
                try (BufferedRandomAccessFile raf = new BufferedRandomAccessFile(w.file, "r")) {
                    assertThat(RandomAccessFileHelper.startIndex(raf, comparator)).as("start " + range).isEqualTo(expected[0]);
                    assertThat(RandomAccessFileHelper.endIndex(raf, comparator)).as("end " + range).isEqualTo(expected[1]);
                }
            }
        }
    }

    @Test
    void 이어진_줄이_40줄인_기록_세_개에서_첫_기록만_찾는다() throws IOException {
        // 이전 구현의 최소 재현 사례: 중간 지점이 이어진 줄에 떨어지면 e 가 두 값 사이를 오가며 끝나지 않았다.
        Written w = write("min.log", new int[]{40, 40, 40}, "\n", true, 0);
        LoggingTimeComparator comparator = comparator(0, 0);
        try (BufferedRandomAccessFile raf = new BufferedRandomAccessFile(w.file, "r")) {
            assertThat(RandomAccessFileHelper.startIndex(raf, comparator)).isEqualTo(0);
            assertThat(RandomAccessFileHelper.endIndex(raf, comparator)).isEqualTo(w.lines.get(40).offset);
        }
    }

    @Test
    void 이어진_줄_길이가_제각각이어도_모든_범위가_선형_탐색과_같다() throws IOException {
        Random random = new Random(20261008);
        for (int round = 0; round < 40; round++) {
            int records = 1 + random.nextInt(12);
            int[] continuations = new int[records];
            for (int i = 0; i < records; i++)
                continuations[i] = random.nextInt(4) == 0 ? 0 : random.nextInt(80);
            assertAllRanges(write("random" + round + ".log", continuations, "\n", true, 0), records);
        }
    }

    @Test
    void CRLF_끝줄바꿈_없음_앞쪽_잔여줄이_있어도_같다() throws IOException {
        int[] continuations = {30, 0, 55, 2, 70, 0, 41};
        assertAllRanges(write("crlf.log", continuations, "\r\n", true, 0), continuations.length);
        assertAllRanges(write("no-trailing-eol.log", continuations, "\n", false, 0), continuations.length);
        assertAllRanges(write("leading-garbage.log", continuations, "\n", true, 25), continuations.length);
    }

    @Test
    void 범위에_기록이_없으면_이어진_줄이_길어도_예외없이_음수를_돌려준다() throws IOException {
        Written w = write("empty-range.log", new int[]{40, 40, 40}, "\n", true, 0);
        // 기록이 10:00~10:02 뿐이라 10:30~10:40 에는 기록이 없다.
        LoggingTimeComparator comparator = comparator(30, 40);
        try (BufferedRandomAccessFile raf = new BufferedRandomAccessFile(w.file, "r")) {
            assertThat(RandomAccessFileHelper.startIndex(raf, comparator)).isEqualTo(-1);
            assertThat(RandomAccessFileHelper.endIndex(raf, comparator)).isEqualTo(-1);
        }
        assertThat(MultiThreadSearcherHelper.getStartEndIndex(w.file, comparator)).extracting(Index::getStartIndex, Index::getEndIndex).containsExactly(-1L, -1L);
    }

    @Test
    void 구간은_기록의_여러_줄_SQL_본문을_자르지_않고_한_덩어리로_포함한다() throws IOException {
        Written w = write("block.log", new int[]{40, 40, 40}, "\n", true, 0);
        // 두 번째 기록(10:01)만 요청하면 시작은 그 머리줄, 끝은 이어진 40줄이 모두 끝난 다음 기록 머리줄 직전이다.
        Index index = MultiThreadSearcherHelper.getStartEndIndex(w.file, comparator(1, 1));
        assertThat(index.getStartIndex()).isEqualTo(w.lines.get(41).offset);
        assertThat(index.getEndIndex()).isEqualTo(w.lines.get(82).offset);

        // 마지막 기록은 파일 끝까지 포함한다.
        Index last = MultiThreadSearcherHelper.getStartEndIndex(w.file, comparator(2, 2));
        assertThat(last.getStartIndex()).isEqualTo(w.lines.get(82).offset);
        assertThat(last.getEndIndex()).isEqualTo(w.length);
    }
}
