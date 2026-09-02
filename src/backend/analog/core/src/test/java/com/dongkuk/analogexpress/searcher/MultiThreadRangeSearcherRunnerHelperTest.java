package com.dongkuk.analogexpress.searcher;

import com.dongkuk.analogexpress.comparator.LoggingTimeComparator;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

class MultiThreadRangeSearcherRunnerHelperTest {
    @Test
    public void getRange(){
        File file1 = new File("src/test/resources/logs/tiny_time.log");
        LocalDateTime start = LocalDateTime.parse("2020-07-30 10:54:38", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-07-30 10:57:24", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);
        List<Range> ranges = MultiThreadSearcherHelper.getRanges(file1, comparator, new Index(0, file1.length()));

    }
}