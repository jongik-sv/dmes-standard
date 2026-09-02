package com.dongkuk.analogexpress.searcher;

import com.dongkuk.analogexpress.comparator.LoggingTimeComparator;
import com.dongkuk.analogexpress.io.BufferedRandomAccessFile;
import com.dongkuk.analogexpress.io.DirectRandomAccessFile;
import com.dongkuk.analogexpress.io.RandomAccessibleLineReader;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

import static com.dongkuk.analogexpress.searcher.RandomAccessFileHelper.*;
import static org.junit.jupiter.api.Assertions.assertEquals;

class RandomAccessFileHelperUsingDirectRandomAccessFileTest {
    @Test
    @DisplayName(value = "범위가 파일 시간보다 이전시간")
    /**
     * 범위가 파일 시간보다 이전시간
     */
    public void findStartingPoint() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time.log");
        File file2 = new File("src/test/resources/logs/tiny_time2.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:52:39", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:52:40", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        long startIndex = getStartIndex(file1, comparator);
        Assertions.assertEquals(-1, startIndex);
        long startIndex2 = getStartIndex(file2, comparator);
        Assertions.assertEquals(-1, startIndex2);
    }

    @Test
    /**
     * 범위가 파일 시작부분에 걸쳐짐
     */
    public void findStartingPoint2() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time.log");
        File file2 = new File("src/test/resources/logs/tiny_time2.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:52:39", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:55:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        String expectedLogLine = "2020-07-30 10:54:38,679";

        doStartIndexTest(file1, comparator, expectedLogLine);
        doStartIndexTest(file2, comparator, expectedLogLine);
    }

    @Test
    /**
     * 범위가 파일 범위에 속함, 파일 앞쪽에 분포
     */
    public void findStartingPoint3() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time.log");
        File file2 = new File("src/test/resources/logs/tiny_time2.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:54:39", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:54:39", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        String expectedLogLine = "2020-07-30 10:54:39,679";

        doStartIndexTest(file1, comparator, expectedLogLine);
        doStartIndexTest(file2, comparator, expectedLogLine);
    }

    @Test
    /**
     * 범위가 파일 범위에 속함, 파일 뒤쪽에 분포
     */
    public void findStartingPoint4() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time.log");
        File file2 = new File("src/test/resources/logs/tiny_time2.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:55:27", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:56:24", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        String expectedLogLine = "2020-07-30 10:55:27,680";

        doStartIndexTest(file1, comparator, expectedLogLine);
        doStartIndexTest(file2, comparator, expectedLogLine);
    }

    @Test
    /**
     * 범위가 파일 범위에 속함, 파일 가운데 분포
     */
    public void findStartingPoint5() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time.log");
        File file2 = new File("src/test/resources/logs/tiny_time2.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:54:39", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:56:24", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        String expectedLogLine = "2020-07-30 10:54:39,679";

        doStartIndexTest(file1, comparator, expectedLogLine);
        doStartIndexTest(file2, comparator, expectedLogLine);
    }

    @Test
    /**
     * 범위가 파일 끝부분에 걸쳐짐
     */
    public void findStartingPoint6() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time.log");
        File file2 = new File("src/test/resources/logs/tiny_time2.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:56:24", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 11:57:24", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        String expectedLogLine = "2020-07-30 10:56:24,680";

        doStartIndexTest(file1, comparator, expectedLogLine);
        doStartIndexTest(file2, comparator, expectedLogLine);
    }

    @Test
    /**
     * 범위가 파일 범위와 같음
     */
    public void findStartingPoint7() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time.log");
        File file2 = new File("src/test/resources/logs/tiny_time2.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:54:38", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:57:24", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        String expectedLogLine = "2020-07-30 10:54:38,679";

        doStartIndexTest(file1, comparator, expectedLogLine);
        doStartIndexTest(file2, comparator, expectedLogLine);
    }

    @Test
    @DisplayName(value = "범위가 파일 시간보다 이후시간")
    /**
     * 범위가 파일 시간보다 이후시간
     */
    public void findStartingPoint8() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time.log");
        File file2 = new File("src/test/resources/logs/tiny_time2.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:59:40", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 11:52:40", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        long startIndex = getStartIndex(file1, comparator);
        Assertions.assertEquals(-1, startIndex);
        long startIndex2 = getStartIndex(file2, comparator);
        Assertions.assertEquals(-1, startIndex2);
    }

    @Test
    /**
     * 범위가 파일 범위를 포함함
     */
    public void findStartingPoint9() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time.log");
        File file2 = new File("src/test/resources/logs/tiny_time2.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:51:38", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:59:24", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        String expectedLogLine = "2020-07-30 10:54:38,679";

        doStartIndexTest(file1, comparator, expectedLogLine);
        doStartIndexTest(file2, comparator, expectedLogLine);
    }

    @Test
    /**
     * 파일에 같은 시각으로 대부분을 차지함
     */
    public void findStartingPoint10() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time3.log");
        File file2 = new File("src/test/resources/logs/tiny_time4.log");
        File file3 = new File("src/test/resources/logs/tiny_time5.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:54:38", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:54:38", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        String expectedLogLine = "2020-07-30 10:54:38,677";

        doStartIndexTest(file1, comparator, expectedLogLine);
        doStartIndexTest(file2, comparator, expectedLogLine);
        doStartIndexTest(file3, comparator, expectedLogLine);
    }

    @Test
    /**
     * 로그가 2라인 인 경우
     */
    public void findStartingPoint11() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time6.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:53:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:55:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        String expectedLogLine = "2020-07-30 10:54:37,677";

        doStartIndexTest(file1, comparator, expectedLogLine);
    }

    @Test
    /**
     * 로그가 1라인 인 경우
     */
    public void findStartingPoint12() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time7.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:53:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:55:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        String expectedLogLine = "2020-07-30 10:54:37,677";

        doStartIndexTest(file1, comparator, expectedLogLine);
    }

    @Test
    /**
     * 로그가 0라인 인 경우
     */
    public void findStartingPoint13() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time8.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:53:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:55:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);
        long startIndex = getStartIndex(file1, comparator);
        Assertions.assertEquals(-1, startIndex);
    }

    @Test
    /**
     * 로그가 공백라인 인 경우
     */
    public void findStartingPoint14() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time9.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:53:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:55:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);
        long startIndex = getStartIndex(file1, comparator);
        Assertions.assertEquals(-1, startIndex);
    }

    @Test
    /**
     * 로그가 공백과 의미없는 값 인 경우
     */
    public void findStartingPoint15() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time10.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:53:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:55:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);
        long startIndex = getStartIndex(file1, comparator);
        Assertions.assertEquals(-1, startIndex);
    }
//----------------------------------------------------


    @Test
    @DisplayName(value = "범위가 파일 시간보다 이전시간")
    /**
     * 범위가 파일 시간보다 이전시간
     */
    public void findEndingPoint() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time.log");
        File file2 = new File("src/test/resources/logs/tiny_time2.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:52:39", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:52:40", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        long endIndex = getEndIndex(file1, comparator);
        Assertions.assertEquals(-1, endIndex);
        long endIndex2 = getStartIndex(file2, comparator);
        Assertions.assertEquals(-1, endIndex2);
    }

    @Test
    /**
     * 범위가 파일 시작부분에 걸쳐짐
     */
    public void findEndingPoint2() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time.log");
        File file2 = new File("src/test/resources/logs/tiny_time2.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:52:39", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:55:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        String expectedLogLine = "2020-07-30 10:55:27,680";

        doEndIndexTest(file1, comparator, expectedLogLine);
        doEndIndexTest(file2, comparator, expectedLogLine);
    }

    @Test
    /**
     * 범위가 파일 범위에 속함, 파일 앞쪽에 분포
     */
    public void findEndingPoint3() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time.log");
        File file2 = new File("src/test/resources/logs/tiny_time2.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:54:39", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:54:39", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        String expectedLogLine = "2020-07-30 10:54:39,680";

        doEndIndexTest(file1, comparator, expectedLogLine);
        doEndIndexTest(file2, comparator, expectedLogLine);
    }

    @Test
    /**
     * 범위가 파일 범위에 속함, 파일 뒤쪽에 분포
     */
    public void findEndingPoint4() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time.log");
        File file2 = new File("src/test/resources/logs/tiny_time2.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:55:27", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:56:24", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        doEndIndexTest(file1, comparator, "fff");
        doEndIndexTest(file2, comparator, "2020-07-30 10:56:24,680");
    }

    @Test
    /**
     * 범위가 파일 범위에 속함, 파일 가운데 분포
     */
    public void findEndingPoint5() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time.log");
        File file2 = new File("src/test/resources/logs/tiny_time2.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:54:39", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:56:24", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        doEndIndexTest(file1, comparator, "fff");
        doEndIndexTest(file2, comparator, "2020-07-30 10:56:24,680");
    }

    @Test
    /**
     * 범위가 파일 끝부분에 걸쳐짐
     */
    public void findEndingPoint6() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time.log");
        File file2 = new File("src/test/resources/logs/tiny_time2.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:56:24", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 11:57:24", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        doEndIndexTest(file1, comparator, "zzz");
        doEndIndexTest(file2, comparator, "2020-07-30 10:57:24,680");
    }

    @Test
    /**
     * 범위가 파일 범위와 같음
     */
    public void findEndingPoint7() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time.log");
        File file2 = new File("src/test/resources/logs/tiny_time2.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:54:38", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:57:24", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        doEndIndexTest(file1, comparator, "zzz");
        doEndIndexTest(file2, comparator, "2020-07-30 10:57:24,680");
    }

    @Test
    @DisplayName(value = "범위가 파일 시간보다 이후시간")
    /**
     * 범위가 파일 시간보다 이후시간
     */
    public void findEndingPoint8() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time.log");
        File file2 = new File("src/test/resources/logs/tiny_time2.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:59:40", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 11:52:40", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        long endIndex = getStartIndex(file1, comparator);
        Assertions.assertEquals(-1, endIndex);
        long endIndex2 = getStartIndex(file2, comparator);
        Assertions.assertEquals(-1, endIndex2);
    }

    @Test
    /**
     * 범위가 파일 범위를 포함함
     */
    public void findEndingPoint9() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time.log");
        File file2 = new File("src/test/resources/logs/tiny_time2.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:51:38", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:59:24", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        doEndIndexTest(file1, comparator, "zzz");
        doEndIndexTest(file2, comparator, "2020-07-30 10:57:24,680");
    }

    @Test
    /**
     * 파일에 같은 시각으로 대부분을 차지함
     */
    public void findEndingPoint10() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time3.log");
        File file2 = new File("src/test/resources/logs/tiny_time4.log");
        File file3 = new File("src/test/resources/logs/tiny_time5.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:54:38", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:54:38", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        String expectedLogLine = "2020-07-30 10:54:38,681";

        doEndIndexTest(file1, comparator, expectedLogLine);
        doEndIndexTest(file2, comparator, expectedLogLine);
        doEndIndexTest(file3, comparator, expectedLogLine);
    }

    @Test
    /**
     * 로그량이 2라인 이하 인 경우
     */
    public void findEndingPoint11() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time6.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:53:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:55:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        String expectedLogLine = "2020-07-30 10:54:37,679";

        doEndIndexTest(file1, comparator, expectedLogLine);
    }

    @Test
    /**
     * 로그가 1라인 인 경우
     */
    public void findEndingPoint12() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time7.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:53:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:55:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        String expectedLogLine = "2020-07-30 10:54:37,677";

        doStartIndexTest(file1, comparator, expectedLogLine);
    }

    @Test
    /**
     * 로그가 0라인 인 경우
     */
    public void findEndingPoint13() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time8.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:53:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:55:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);
        long startIndex = getStartIndex(file1, comparator);
        Assertions.assertEquals(-1, startIndex);
    }

    @Test
    /**
     * 로그가 공백라인 인 경우
     */
    public void findEndingPoint14() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time9.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:53:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:55:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);
        long startIndex = getStartIndex(file1, comparator);
        Assertions.assertEquals(-1, startIndex);
    }

    @Test
    /**
     * 로그가 공백과 의미없는 값 인 경우
     */
    public void findEndingPoint15() throws IOException {
        File file1 = new File("src/test/resources/logs/tiny_time10.log");

        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:53:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:55:37", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);
        long startIndex = getStartIndex(file1, comparator);
        Assertions.assertEquals(-1, startIndex);
    }

    //------------------------------------------------------
    @Test
    public void findNextLineStartIndex() {
        int numberOfThreads = 3;
        long[] startPoint = new long[numberOfThreads];
        startPoint[0] = 0;

//        File srcFile = new File("src/test/resources/logs/tiny.log");
        File srcFile = new File("src/test/resources/logs/mpr_app_20200803_14.log");
        try (RandomAccessFile file = new RandomAccessFile(srcFile, "r")) {
            long l = file.length() / numberOfThreads;
            for (int i = 1; i < numberOfThreads; i++) {
                startPoint[i] = l * i - 1;
            }

            for (int i = 1; i < startPoint.length; i++) {
                file.seek(startPoint[i]);

                long filePointer;
                file.readLine();
                filePointer = file.getFilePointer();
                startPoint[i] = filePointer;
            }

            for (long l1 : startPoint) {

                if (l1 != 0)
                    file.seek(l1 - 2);
                else
                    file.seek(l1);
                System.out.println("-------------");
                System.out.println(file.read());
                System.out.println(file.read());
                System.out.println(file.read());
                System.out.println(file.read());
                System.out.println("++++++++++++++");
            }


        } catch (FileNotFoundException e) {
            e.printStackTrace();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    @Test
    public void findCurrentLineStartIndex() throws Exception {
        int numberOfThreads = 3;
        long[] startPoint = new long[numberOfThreads];
        startPoint[0] = 0;

//        File srcFile = new File("src/test/resources/logs/tiny.log");
        File srcFile = new File("src/test/resources/logs/tiny.log");
        try (RandomAccessibleLineReader file = new DirectRandomAccessFile(srcFile, "r")) {
            long l = file.length() / numberOfThreads;
            for (int i = 1; i < numberOfThreads; i++) {
                startPoint[i] = l * i - 1;
            }

            for (int i = 1; i < startPoint.length; i++) {
                long filePointer = getCurrentLineStartPointer(startPoint[i], file);
                startPoint[i] = filePointer;
            }

            for (long l1 : startPoint) {

                if (l1 != 0)
                    file.seek(l1 - 2);
                else
                    file.seek(l1);
                System.out.println("-------------");
                System.out.println(file.read());
                System.out.println(file.read());
                System.out.println(file.read());
                System.out.println(file.read());
                System.out.println("++++++++++++++");
            }


        } catch (FileNotFoundException e) {
            e.printStackTrace();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    public void createSampleFileCrLf() throws IOException {
        RandomAccessFile file = new RandomAccessFile("src/test/resources/logs/tiny_crlf.log", "rw");
        file.write(98);
        file.write(99);
        file.write(100);
        file.write(13);
        file.write(10);
        file.write(13);
        file.write(10);
        file.write(13);
        file.write(10);
        file.write(101);
        file.write(102);
        file.write(103);
        file.close();
    }

    public void createSampleFileLf() throws IOException {
        RandomAccessFile file = new RandomAccessFile("src/test/resources/logs/tiny_lf.log", "rw");
        file.write(98);
        file.write(99);
        file.write(100);
        file.write(10);
        file.write(10);
        file.write(10);
        file.write(101);
        file.write(102);
        file.write(103);
        file.close();
    }

    public void createSampleFileCr() throws IOException {
        RandomAccessFile file = new RandomAccessFile("src/test/resources/logs/tiny_cr.log", "rw");
        file.write(98);
        file.write(99);
        file.write(100);
        file.write(13);
        file.write(13);
        file.write(13);
        file.write(101);
        file.write(102);
        file.write(103);
        file.close();
    }

    @Test
    public void whenNewlineStartThenFindForward_CR() throws IOException {
        createSampleFileCr();
        Map<Integer, Long> map = new HashMap<>();
        map.put(0, 0L);
        map.put(1, 0L);
        map.put(2, 0L);
        map.put(3, 0L);
        map.put(4, 4L);
        map.put(5, 5L);
        map.put(6, 6L);
        map.put(7, 6L);
        map.put(8, 6L);
        File srcFile = new File("src/test/resources/logs/tiny_cr.log");
        printFile(srcFile);
        try (RandomAccessibleLineReader file = new DirectRandomAccessFile(srcFile, "r")) {
            for (int i = 0; i < file.length(); i++) {
                long currentLineStartPointer = getCurrentLineStartPointer(i, file);
                if (currentLineStartPointer > 1)
                    file.seek(currentLineStartPointer - 2);
                else
                    file.seek(currentLineStartPointer);
                System.out.println("-------------index:" + i + "----startPosision" + currentLineStartPointer);
                Assertions.assertEquals(map.get(i), currentLineStartPointer);
            }
        }
    }

    @Test
    public void whenNewlineStartThenFindForward_LF() throws IOException {
        createSampleFileLf();
        Map<Integer, Long> map = new HashMap<>();
        map.put(0, 0L);
        map.put(1, 0L);
        map.put(2, 0L);
        map.put(3, 0L);
        map.put(4, 4L);
        map.put(5, 5L);
        map.put(6, 6L);
        map.put(7, 6L);
        map.put(8, 6L);
        File srcFile = new File("src/test/resources/logs/tiny_lf.log");
        printFile(srcFile);
        try (RandomAccessibleLineReader file = new DirectRandomAccessFile(srcFile, "r")) {
            for (int i = 0; i < file.length(); i++) {
                long currentLineStartPointer = getCurrentLineStartPointer(i, file);
                if (currentLineStartPointer > 1)
                    file.seek(currentLineStartPointer - 2);
                else
                    file.seek(currentLineStartPointer);
                System.out.println("-------------index:" + i + "----startPosision" + currentLineStartPointer);
                Assertions.assertEquals(map.get(i), currentLineStartPointer);
            }
        }
    }

    @Test
    public void whenNewlineStartThenFindForward_CRLF() throws Exception {
        createSampleFileCrLf();
        Map<Integer, Long> map = new HashMap<>();
        map.put(0, 0L);
        map.put(1, 0L);
        map.put(2, 0L);
        map.put(3, 0L);
        map.put(4, 0L);
        map.put(5, 5L);
        map.put(6, 5L);
        map.put(7, 7L);
        map.put(8, 7L);
        map.put(9, 9L);
        map.put(10, 9L);
        map.put(11, 9L);
        File srcFile = new File("src/test/resources/logs/tiny_crlf.log");
        printFile(srcFile);
        System.out.println(srcFile.length());
        try (RandomAccessibleLineReader file = new DirectRandomAccessFile(srcFile, "r")) {
            for (int i = 0; i < file.length(); i++) {
                long currentLineStartPointer = getCurrentLineStartPointer(i, file);
                if (currentLineStartPointer > 1)
                    file.seek(currentLineStartPointer - 2);
                else
                    file.seek(currentLineStartPointer);
                System.out.println("-------------index:" + i + "----startPosision" + currentLineStartPointer);
                Assertions.assertEquals(map.get(i), currentLineStartPointer);
            }
        }
    }

    private void printFile(File srcFile) throws IOException {
        try (RandomAccessFile file = new RandomAccessFile(srcFile, "r")) {
            int data = 0;
            while ((data = file.read()) != -1) {
                System.out.print(data + " ");
            }
        }
        System.out.println("");
    }
    private long getStartIndex(File srcFile, LoggingTimeComparator filter) throws IOException {
        long startIndex = 0;

        try (RandomAccessibleLineReader file = new DirectRandomAccessFile(srcFile, "r")) {
            startIndex = startIndex(file, filter);
        }
        return startIndex;
    }

    private long getEndIndex(File srcFile, LoggingTimeComparator filter) throws IOException {
        long endIndex = 0;

        try (RandomAccessibleLineReader file = new DirectRandomAccessFile(srcFile, "r")) {
            endIndex = endIndex(file, filter);
        }
        return endIndex;
    }

    private void assertLogLine(File file, long index, String logLine) throws IOException {
        try (RandomAccessibleLineReader raf = new DirectRandomAccessFile(file, "r")) {
            raf.seek(index);
            assertEquals(logLine, raf.readLine());
        }
    }

    private void doStartIndexTest(File file, LoggingTimeComparator comparator, String logLine) throws IOException {
        long index = getStartIndex(file, comparator);
        assertLogLine(file, index, logLine);
    }

    private void doEndIndexTest(File file, LoggingTimeComparator comparator, String logLine) throws IOException {
        long index = getEndIndex(file, comparator);
        assertLogLine(file, index, logLine);
    }

}