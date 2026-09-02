package com.dongkuk.analogexpress.searcher;

import com.dongkuk.analogexpress.filter.contents.LogContentsFilter;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MultiThreadRangeSearcherRunner extends TextSearcher {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(MultiThreadRangeSearcherRunner.class);
    private final List<Range> ranges;
    private final String charsetName;

    public MultiThreadRangeSearcherRunner(SearchResult searchResult,
                                          LogContentsFilter[] logContentsFilters,
                                          ContextualNewLineInspector contextualNewLineInspector,
                                          List<Range> ranges) {
        this(searchResult, logContentsFilters, contextualNewLineInspector, ranges, "utf-8");
    }
    public MultiThreadRangeSearcherRunner(SearchResult searchResult,
                                          LogContentsFilter[] logContentsFilters,
                                          ContextualNewLineInspector contextualNewLineInspector,
                                          List<Range> ranges,
                                          String charsetName) {
        super(searchResult, logContentsFilters, contextualNewLineInspector);
        this.ranges = ranges;
        this.charsetName = charsetName;
    }
    @Override
    public void run() {
        if (ranges.size() == 1) {
            RangeTextSearcher rangeTextSearcher = new RangeTextSearcher(searchResult, logContentsFilters, contextualNewLineInspector, ranges.get(0).getStartIndex(), ranges.get(0).getLimitLength(), charsetName);
            rangeTextSearcher.run();
            log.info("단일 파일 검색 완료 - no multi thread/" + System.currentTimeMillis());
        } else {
            List<SearchResult> searchResults = new ArrayList<>();
            ExecutorService executorService = Executors.newFixedThreadPool(ranges.size());

            for (int i = 0; i < ranges.size(); i++) {
                SearchResult searchResult = new SearchResult(this.searchResult.getFile());
                searchResults.add(searchResult);
                Runnable searcher = new RangeTextSearcher(searchResult, logContentsFilters, contextualNewLineInspector, ranges.get(i).getStartIndex(), ranges.get(i).getLimitLength(), charsetName);
                executorService.execute(searcher);
            }
            executorService.shutdown();

            while (!executorService.isTerminated()) {
                try {
                    Thread.sleep(10);
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }

            for (SearchResult searchResult : searchResults) {
                for (String s : searchResult.getResult()) {
                    this.searchResult.addResultLine(s);
                }
            }
            log.info("단일 파일 검색 완료 - multi thread/" + System.currentTimeMillis());
        }
    }
}
