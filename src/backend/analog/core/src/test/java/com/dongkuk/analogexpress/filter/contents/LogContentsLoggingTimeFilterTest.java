package com.dongkuk.analogexpress.filter.contents;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

class LogContentsLoggingTimeFilterTest {
    @Test
    public void formatTest() {
        LocalDateTime localDateTime = LocalDateTime.of(2020, 8, 8, 20, 17);
        LogContentsLoggingTimeFilter filter = new LogContentsLoggingTimeFilter(
                localDateTime.minusMinutes(10),
                localDateTime,
                "yyyy-MM-dd HH:mm:ss",
                0, 19);

        Assertions.assertTrue(filter.accept("2020-08-08 20:16:35,858 TH-67 ${ctx:SERVICE"));
        Assertions.assertFalse(filter.accept("2020-08-08 20:17:35,858 TH-67 ${ctx:SERVICE"));
        Assertions.assertFalse(filter.accept("2020-08-08 20:05:35,858 TH-67 ${ctx:SERVICE"));
    }

}