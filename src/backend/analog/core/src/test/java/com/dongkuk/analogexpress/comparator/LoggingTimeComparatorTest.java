package com.dongkuk.analogexpress.comparator;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

import static org.junit.jupiter.api.Assertions.assertEquals;

class LoggingTimeComparatorTest {
    LocalDateTime start = LocalDateTime.parse("2020-07-30 10:52:30", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    LocalDateTime end = LocalDateTime.parse("2020-07-30 10:52:40", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    LoggingTimeComparator comparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

    @Test
    public void future() {
        String contentLine = "2020-07-30 10:52:45";
        Assertions.assertEquals(1, comparator.compare(contentLine));
    }

    @Test
    public void contain() {
        String contentLine = "2020-07-30 10:52:35";
        Assertions.assertEquals(0, comparator.compare(contentLine));
    }

    @Test
    public void past() {
        String contentLine = "2020-07-30 10:52:15";
        Assertions.assertEquals(-1, comparator.compare(contentLine));
    }

    @Test
    public void upperBoundary() {
        String contentLine = "2020-07-30 10:52:40";
        Assertions.assertEquals(0, comparator.compare(contentLine));
    }

    @Test
    public void lowerBoundary() {
        String contentLine = "2020-07-30 10:52:30";
        Assertions.assertEquals(0, comparator.compare(contentLine));
    }

    @Test
    public void stringCompare() {
        String contentLine1 = "2020-07-30 10:52:25";
        String contentLine2 = "2020-07-30 10:52:30";
        Assertions.assertEquals(-1, contentLine1.compareTo(contentLine2));
        Assertions.assertEquals(1, contentLine2.compareTo(contentLine1));
    }

    @Test
    public void compare() {
        LocalDateTime start = LocalDateTime.parse("2020-08-11 16:00:53", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime end = LocalDateTime.parse("2020-08-11 16:00:56", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator loggingTimeComparator = new LoggingTimeComparator(start, end, "yyyy-MM-dd HH:mm:ss", 0, 19);

        int compare = loggingTimeComparator.compare("2020-08-11 16:00:53");
        Assertions.assertEquals(0, compare);
        int compare2 = loggingTimeComparator.compare("2020-08-11 16:01:53");
        Assertions.assertEquals(1, compare2);
        int compare3 = loggingTimeComparator.compare("2020-08-11 15:01:53");
        Assertions.assertEquals(-1, compare3);
    }
}