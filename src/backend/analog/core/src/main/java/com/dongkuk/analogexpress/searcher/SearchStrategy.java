package com.dongkuk.analogexpress.searcher;


import com.dongkuk.analogexpress.comparator.LoggingTimeComparable;
import com.dongkuk.analogexpress.comparator.LoggingTimeComparator;
import com.dongkuk.analogexpress.filter.contents.IgnoreCaseLogContentsKeywordFilter;
import com.dongkuk.analogexpress.filter.contents.LogContentsFilter;
import com.dongkuk.analogexpress.filter.contents.LogContentsKeywordFilter;
import com.dongkuk.analogexpress.filter.contents.LogContentsLoggingTimeFilter;

import java.io.File;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import static com.dongkuk.analogexpress.searcher.MultiThreadSearcherHelper.getRanges;
import static com.dongkuk.analogexpress.searcher.MultiThreadSearcherHelper.getStartEndIndex;

public class SearchStrategy {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(SearchStrategy.class);
    private final File file;
    private final SearchResult searchResult;
    private final String charsetName;
    private TextSearcher textSearcher;

    public SearchStrategy(File file) {
        this(file, "utf-8");
    }

    public SearchStrategy(File file, String charsetName) {
        this.file = file;
        searchResult = new SearchResult(file);
        this.charsetName = charsetName;
    }

    public File getFile() {
        return this.file;
    }

    public SearchResult getSearchResult() {
        return this.searchResult;
    }

    public TextSearcher getTextSearcher() {
        return this.textSearcher;
    }

    public void setTextSearcher(TextSearcher textSearcher) {
        this.textSearcher = textSearcher;
    }

    public void makeStrategy(LocalDateTime fromTime,
                             LocalDateTime toTime,
                             LoggingTimeComparator comparator,
                             String dateTimeFormat,
                             int beginIndexOfDateTime,
                             int endIndexOfDateTime,
                             String keyword,
                             boolean ignoreCase,
                             int minMinutesForBinarySearch,
                             long minMegaBytesForMultiThread,
                             ContextualNewLineInspector contextualNewLineInspector
    ) {
        makeStrategy(fromTime,
                toTime,
                comparator,
                dateTimeFormat,
                beginIndexOfDateTime,
                endIndexOfDateTime,
                keyword,
                ignoreCase,
                minMinutesForBinarySearch,
                minMegaBytesForMultiThread,
                contextualNewLineInspector,
                null);
    }

    public void makeStrategy(LocalDateTime fromTime,
                             LocalDateTime toTime,
                             LoggingTimeComparator comparator,
                             String dateTimeFormat,
                             int beginIndexOfDateTime,
                             int endIndexOfDateTime,
                             String keyword,
                             boolean ignoreCase,
                             int minMinutesForBinarySearch,
                             long minMegaBytesForMultiThread,
                             ContextualNewLineInspector contextualNewLineInspector,
                             Iterable<LogContentsFilter> customContentFilters) {
        List<LogContentsFilter> logContentsFilters = new ArrayList<>();

        Index index;
        boolean fullScan = false;

        long until = fromTime.until(toTime, ChronoUnit.MINUTES);

        if (until < minMinutesForBinarySearch) {
            index = getStartEndIndex(file, comparator);
            log.info("구간 검색 결정 완료 - 이진검색");
        } else {
            index = new Index(0, file.length());
            logContentsFilters.add(new LogContentsLoggingTimeFilter(fromTime, toTime, dateTimeFormat, beginIndexOfDateTime, endIndexOfDateTime));
            fullScan = true;
            log.info("구간 검색 결정 완료 - 풀스캔");
        }

        if (ignoreCase)
            logContentsFilters.add(new IgnoreCaseLogContentsKeywordFilter(keyword));
        else
            logContentsFilters.add(new LogContentsKeywordFilter(keyword));

        if (customContentFilters != null) {
            for (LogContentsFilter customContentFilter : customContentFilters) {
                logContentsFilters.add(customContentFilter);
            }
        }

        List<Range> ranges;
        if ((index.getEndIndex() - index.getStartIndex()) > (minMegaBytesForMultiThread * 1024 * 1024)) {
            ranges = getRanges(file, comparator, index);
            setTextSearcher(new MultiThreadRangeSearcherRunner(getSearchResult(), logContentsFilters.toArray(new LogContentsFilter[0]), contextualNewLineInspector, ranges, charsetName));
            log.info("스레드별 검색 영역 설정 완료 - 멀티스래드");
        } else {
            ranges = new ArrayList<>();
            ranges.add(new Range(index.getStartIndex(), index.getEndIndex() - index.getStartIndex()));
            if (fullScan) {
                setTextSearcher(new FullScanTextSearcher(getSearchResult(), logContentsFilters.toArray(new LogContentsFilter[0]), contextualNewLineInspector, charsetName));
                log.info("스레드별 검색 영역 설정 완료 - 단일스레드 FullScan");
            } else {
                setTextSearcher(new RangeTextSearcher(getSearchResult(), logContentsFilters.toArray(new LogContentsFilter[0]), contextualNewLineInspector,
                        ranges.get(0).getStartIndex(), ranges.get(0).getLimitLength(), charsetName));
                log.info("스레드별 검색 영역 설정 완료 - 단일스레드 RangeScan");
            }
        }
    }

    public void makeStrategy(LoggingTimeComparable comparator,
                             String keyword,
                             boolean ignoreCase,
                             long minMegaBytesForMultiThread,
                             ContextualNewLineInspector contextualNewLineInspector) {
        List<LogContentsFilter> logContentsFilters = new ArrayList<>();
        if (ignoreCase)
            logContentsFilters.add(new IgnoreCaseLogContentsKeywordFilter(keyword));
        else
            logContentsFilters.add(new LogContentsKeywordFilter(keyword));

        Index index = new Index(0, file.length());

        List<Range> ranges;
        if ((index.getEndIndex() - index.getStartIndex()) > (minMegaBytesForMultiThread * 1024 * 1024)) {
            ranges = getRanges(file, comparator, index);
            setTextSearcher(new MultiThreadRangeSearcherRunner(getSearchResult(), logContentsFilters.toArray(new LogContentsFilter[0]), contextualNewLineInspector, ranges, charsetName));
            log.info("스레드별 검색 영역 설정 완료 - 멀티스래드");
        } else {
            setTextSearcher(new FullScanTextSearcher(getSearchResult(), logContentsFilters.toArray(new LogContentsFilter[0]), contextualNewLineInspector, charsetName));
            log.info("스레드별 검색 영역 설정 완료 - 단일스레드 FullScan");
        }
    }
}
