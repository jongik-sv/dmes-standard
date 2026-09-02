package com.dongkuk.analogexpress.comparator;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;

/**
 * logLine의 시간이 범위보다 미래이면 1.
 * 포함이면 0.
 * 과거이면 -1
 */
public class LoggingTimeComparator implements LoggingTimeComparable {
    private final String fromDateTime;
    private final String toDateTime;
    private final int beginIndexOfDateTime;
    private final int endIndexOfDateTime;
    private final LocalDateTime fromDate;
    private final LocalDateTime toDate;
    private final String minFromDateTime;
    private final String maxFromDateTime;

    public LoggingTimeComparator(LocalDateTime fromDateTime, LocalDateTime toDateTime, String dateTimeFormat, int beginIndexOfDateTime, int endIndexOfDateTime) {
        this.fromDateTime = fromDateTime.format(DateTimeFormatter.ofPattern(dateTimeFormat));
        this.toDateTime = toDateTime.format(DateTimeFormatter.ofPattern(dateTimeFormat));
        if (this.fromDateTime.compareTo(this.toDateTime) > 0)
            throw new IllegalArgumentException("fromDateTime must be past then toDateTime.");
        this.beginIndexOfDateTime = beginIndexOfDateTime;
        this.endIndexOfDateTime = endIndexOfDateTime;
        this.fromDate = fromDateTime;
        this.toDate = toDateTime;
        this.minFromDateTime = LocalDateTime.of(1900, 1, 1, 00, 00, 00).format(DateTimeFormatter.ofPattern(dateTimeFormat));
        this.maxFromDateTime = LocalDateTime.of(9999, 12, 31, 23, 59, 59).format(DateTimeFormatter.ofPattern(dateTimeFormat));
    }

    @Override
    public boolean canCompare(String logLine) {
        if (logLine == null)
            return false;
        if (logLine.length() < beginIndexOfDateTime + endIndexOfDateTime)
            return false;

        return logLine.substring(beginIndexOfDateTime, endIndexOfDateTime).compareTo(minFromDateTime) >= 0 && logLine.substring(beginIndexOfDateTime, endIndexOfDateTime).compareTo(maxFromDateTime) <= 0;
    }

    public long getFromToDateGap() {
        return fromDate.until(toDate, ChronoUnit.MINUTES);
    }

    public int compare(String logLine) {
        String substring = logLine.substring(beginIndexOfDateTime, endIndexOfDateTime);
        if (substring.compareTo(fromDateTime) >= 0 && substring.compareTo(toDateTime) <= 0)
            return 0;
        else if (substring.compareTo(toDateTime) > 0)
            return 1;
        else if (substring.compareTo(fromDateTime) < 0)
            return -1;
        throw new RuntimeException("[" + logLine + "]");
    }
}
