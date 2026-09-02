package com.dongkuk.analogexpress.searcher;

import com.dongkuk.analogexpress.filter.contents.LogContentsFilter;
import com.dongkuk.analogexpress.io.LimitedFileInputStream;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.RandomAccessFile;

public class RangeTextSearcher extends TextSearcher {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(RangeTextSearcher.class);

    private final long startIndex;
    private final long limitLength;
    private final String charsetName;

    public RangeTextSearcher(SearchResult searchResult, LogContentsFilter[] logContentsFilters, ContextualNewLineInspector contextualNewLineInspector, long startIndex, long limitLength) {
        this(searchResult, logContentsFilters, contextualNewLineInspector, startIndex, limitLength, "utf-8");
    }
    public RangeTextSearcher(SearchResult searchResult, LogContentsFilter[] logContentsFilters, ContextualNewLineInspector contextualNewLineInspector, long startIndex, long limitLength, String charsetName) {
        super(searchResult, logContentsFilters, contextualNewLineInspector);
        this.startIndex = startIndex;
        this.limitLength = limitLength;
        this.charsetName = charsetName;
    }

    @Override
    public void run() {
        log.info("범위별 검색 시작/" + System.currentTimeMillis());

        if (startIndex < 0) {
            log.info("범위에 없음");
            searchResult.setFinished(true);
        } else {
            try (RandomAccessFile raf = new RandomAccessFile(searchResult.getFile(), "r")) {
                raf.seek(startIndex);
                try (LimitedFileInputStream fis = new LimitedFileInputStream(raf.getFD(), limitLength);
                     BufferedInputStream bis = new BufferedInputStream(fis);
                     BufferedReader reader = new BufferedReader(new InputStreamReader(bis, charsetName))) {
                    readAndFilter(reader);
                }
            } catch (Exception e) {
                log.error(e.getMessage(), e);
            } finally {
                searchResult.setFinished(true);
            }
        }
        log.info("범위별 검색 완료/" + System.currentTimeMillis());
    }


}
