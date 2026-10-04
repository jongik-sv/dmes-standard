package com.dongkuk.analogexpress.searcher;

import com.dongkuk.analogexpress.comparator.LoggingTimeComparator;
import com.dongkuk.analogexpress.filter.contents.LogContentsFilter;
import com.dongkuk.analogexpress.filter.contents.LogContentsKeywordFilter;
import org.junit.jupiter.api.BeforeAll;
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

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 검색 러너 특성 테스트 — 2026-10-04 리팩토링(요청마다 만들던 스레드 풀 → 공유 풀) 직전의
 * 범위 분할·결과 순서를 고정한다. 기대값은 바꾸기 전 코드로 뽑은 값이다.
 */
class RangeSearchCharacterizationTest {

    private static final String FORMAT = "yyyy-MM-dd HH:mm:ss.SSS";
    private static final LocalDateTime FROM = LocalDateTime.of(2026, 5, 15, 9, 10, 0);
    private static final LocalDateTime TO = LocalDateTime.of(2026, 5, 15, 9, 40, 0);

    @TempDir
    static Path dir;
    static File logFile;

    /** 09:00~09:59 1분 간격 60줄. 3의 배수 줄에 keyword, 5의 배수 줄에 이어진 줄(스택) 2줄. */
    @BeforeAll
    static void writeLog() throws IOException {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 60; i++) {
            // 바이트 위치(710/2957 등)를 고정하므로 OS 와 상관없이 줄바꿈은 \n 으로 쓴다.
            sb.append(String.format("2026-05-15 09:%02d:00.000 [main] INFO  c.d.Foo - line %02d%s\n", i, i, i % 3 == 0 ? " keyword" : ""));
            if (i % 5 == 0) {
                sb.append("\tat c.d.Foo.bar(Foo.java:").append(i).append(")\n");
                sb.append("\tat c.d.Foo.baz(Foo.java:").append(i).append(") keyword\n");
            }
        }
        logFile = dir.resolve("dmes-test.log").toFile();
        Files.writeString(logFile.toPath(), sb.toString(), StandardCharsets.UTF_8);
    }

    private static LoggingTimeComparator comparator() {
        return new LoggingTimeComparator(FROM, TO, FORMAT, 0, 23);
    }

    private static LogContentsFilter[] keywordFilter() {
        return new LogContentsFilter[]{new LogContentsKeywordFilter("keyword")};
    }

    private static List<String> rangesOf(List<Range> ranges) {
        List<String> out = new ArrayList<>();
        for (Range r : ranges) out.add(r.getStartIndex() + "+" + r.getLimitLength());
        return out;
    }

    /** 바꾸기 전 코드로 뽑은 기대 결과 — 09:10~09:40 사이에서 keyword 가 든 논리 줄(이어진 줄 포함), 파일 순서. */
    private static List<String> expectedLines() {
        List<String> out = new ArrayList<>();
        String nl = System.lineSeparator(); // TextSearcher 가 이어진 줄을 System.lineSeparator() 로 붙인다.
        for (int i = 10; i <= 40; i++) {
            if (i % 3 != 0 && i % 5 != 0) continue;
            String head = String.format("2026-05-15 09:%02d:00.000 [main] INFO  c.d.Foo - line %02d%s", i, i, i % 3 == 0 ? " keyword" : "");
            if (i % 5 == 0) {
                head += nl + "\tat c.d.Foo.bar(Foo.java:" + i + ")" + nl + "\tat c.d.Foo.baz(Foo.java:" + i + ") keyword";
            }
            out.add(head);
        }
        return out;
    }

    @Test
    void 이진검색_구간과_스레드별_범위_분할은_고정되어_있다() {
        Index index = MultiThreadSearcherHelper.getStartEndIndex(logFile, comparator());
        List<Range> ranges = MultiThreadSearcherHelper.getRanges(logFile, comparator(), index);

        assertThat(index.getStartIndex()).isEqualTo(710);
        assertThat(index.getEndIndex()).isEqualTo(2957);
        // 100MB 미만은 3 등분을 시도하지만, 줄 경계로 밀다가 끝에 닿으면 남은 조각이 없어 2개가 된다.
        assertThat(rangesOf(ranges)).containsExactly("710+890", "1600+1412");
    }

    @Test
    void 멀티스레드_러너는_범위_순서대로_결과를_합친다() {
        Index index = MultiThreadSearcherHelper.getStartEndIndex(logFile, comparator());
        List<Range> ranges = MultiThreadSearcherHelper.getRanges(logFile, comparator(), index);

        SearchResult result = new SearchResult(logFile);
        new MultiThreadRangeSearcherRunner(result, keywordFilter(), new StartsStringContextualNewLineInspector("20"), ranges).run();

        assertThat(result.getResult()).containsExactlyElementsOf(expectedLines());
    }

    @Test
    void 멀티스레드_러너_결과는_단일_범위_검색과_같다() {
        Index index = MultiThreadSearcherHelper.getStartEndIndex(logFile, comparator());
        List<Range> ranges = MultiThreadSearcherHelper.getRanges(logFile, comparator(), index);

        SearchResult multi = new SearchResult(logFile);
        new MultiThreadRangeSearcherRunner(multi, keywordFilter(), new StartsStringContextualNewLineInspector("20"), ranges).run();
        SearchResult single = new SearchResult(logFile);
        new RangeTextSearcher(single, keywordFilter(), new StartsStringContextualNewLineInspector("20"),
                index.getStartIndex(), index.getEndIndex() - index.getStartIndex()).run();

        assertThat(multi.getResult()).containsExactlyElementsOf(single.getResult());
    }

    @Test
    void 검색_전략_이진검색_멀티스레드_경로() {
        SearchStrategy strategy = new SearchStrategy(logFile, "UTF-8");
        strategy.makeStrategy(FROM, TO, comparator(), FORMAT, 0, 23, "keyword", false,
                99999, 0, new StartsStringContextualNewLineInspector("20"));

        assertThat(strategy.getTextSearcher()).isInstanceOf(MultiThreadRangeSearcherRunner.class);
        strategy.getTextSearcher().run();
        assertThat(strategy.getSearchResult().getResult()).containsExactlyElementsOf(expectedLines());
    }

    @Test
    void 검색_전략_풀스캔_멀티스레드_경로() {
        SearchStrategy strategy = new SearchStrategy(logFile, "UTF-8");
        strategy.makeStrategy(FROM, TO, comparator(), FORMAT, 0, 23, "keyword", false,
                0, 0, new StartsStringContextualNewLineInspector("20"));

        assertThat(strategy.getTextSearcher()).isInstanceOf(MultiThreadRangeSearcherRunner.class);
        strategy.getTextSearcher().run();
        // 기존 결함 고정: 파일 전체를 범위로 나누면 경계에 걸린 논리 줄(line 20 + 이어진 줄)이 빠진다.
        // getRanges 의 경계 계산 문제로, 스레드 풀 정리와 무관하다(이 작업 범위 밖 — 바뀌면 이 기대값도 함께 고친다).
        List<String> expected = new ArrayList<>(expectedLines());
        expected.removeIf(s -> s.startsWith("2026-05-15 09:20:00.000"));
        assertThat(strategy.getSearchResult().getResult()).containsExactlyElementsOf(expected);
    }
}
