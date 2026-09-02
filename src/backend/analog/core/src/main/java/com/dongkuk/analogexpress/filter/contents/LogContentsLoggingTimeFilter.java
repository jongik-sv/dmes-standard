package com.dongkuk.analogexpress.filter.contents;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class LogContentsLoggingTimeFilter implements LogContentsFilter {
    private final String fromDateTime;
    private final String toDateTime;
    private final int beginIndexOfDateTime;
    private final int endIndexOfDateTime;

    public LogContentsLoggingTimeFilter(LocalDateTime fromDateTime, LocalDateTime toDateTime, String dateTimeFormat, int beginIndexOfDateTime, int endIndexOfDateTime) {
        this.fromDateTime = fromDateTime.format(DateTimeFormatter.ofPattern(dateTimeFormat));
        this.toDateTime = toDateTime.format(DateTimeFormatter.ofPattern(dateTimeFormat));
        this.beginIndexOfDateTime = beginIndexOfDateTime;
        this.endIndexOfDateTime = endIndexOfDateTime;
    }

    /**
     * 로그 헤더의 시간과 조회 조건의 시작, 끝 시간에 포함되면 True를 반환한다.
     *
     * @param content 비교할 라인
     * @return 비교 결과
     */
    @Override
    public boolean accept(String content) {
        if (content.length() < endIndexOfDateTime - beginIndexOfDateTime) return false;
        return fromDateTime.compareTo(content.substring(beginIndexOfDateTime, endIndexOfDateTime)) <= 0
                &&
                toDateTime.compareTo(content.substring(beginIndexOfDateTime, endIndexOfDateTime)) >= 0;
    }
}
