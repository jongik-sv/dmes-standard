package com.dongkuk.analogexpress.io;

import com.dongkuk.analogexpress.comparator.LoggingTimeComparator;
import org.assertj.core.api.Condition;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

import static com.dongkuk.analogexpress.searcher.RandomAccessFileHelper.startIndex;
import static org.assertj.core.api.Assertions.anyOf;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;

class BufferedRandomAccessFileTest {
    @Test
    public void bufferedPerformanceTest() throws Exception {
        File file1 = new File("src/test/resources/logs/tiny_interface.log");
//        File file1 = new File(System.getProperty("user.home"), "Desktop/dmes_prd_log/dmes_prd_log/mpp_app_20200826_14.log");

        LocalDateTime start = LocalDateTime.parse("2020-08-26 14:20:02", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-08-26 14:40:02", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        long s;
        long e;

        long startIndex;

        try (RandomAccessibleLineReader file = new BufferedRandomAccessFile(file1, "r", 2048)) {
            s = System.currentTimeMillis();
            startIndex = startIndex(file, comparator);
            e = System.currentTimeMillis();
        }
        System.out.println(e - s);
        System.out.println(startIndex);
        //211
        //34948082
        try (RandomAccessibleLineReader file = new DirectRandomAccessFile(file1, "r")) {
            s = System.currentTimeMillis();
            startIndex = startIndex(file, comparator);
            e = System.currentTimeMillis();
        }
        System.out.println(e - s);
        System.out.println(startIndex);
        //488
        //34948082
    }


    @Test
    public void fuc() throws IOException {
        File file = new File("src/test/resources/logs/tiny.log");
        BufferedRandomAccessFile braf = new BufferedRandomAccessFile(file, "r", 2);
        assertEquals(0, braf.getFilePointer());
        String s = braf.readLine();
        Assertions.assertEquals("abc", s);
        Long filePointer = braf.getFilePointer();
        Condition<Long> pointer4 = new Condition<>(aLong -> aLong == 4L, "long4");
        Condition<Long> pointer5 = new Condition<>(aLong -> aLong == 5L, "long5");

        assertThat(filePointer).is(anyOf(pointer4, pointer5));

        int read = braf.read();
        Assertions.assertEquals(100, read);
    }

}