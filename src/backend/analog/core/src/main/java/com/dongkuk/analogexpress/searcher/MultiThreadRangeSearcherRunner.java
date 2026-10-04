package com.dongkuk.analogexpress.searcher;

import com.dongkuk.analogexpress.filter.contents.LogContentsFilter;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MultiThreadRangeSearcherRunner extends TextSearcher {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(MultiThreadRangeSearcherRunner.class);
    private final List<Range> ranges;
    private final String charsetName;
    /**
     * 범위별 검색을 돌릴 공유 실행기. null 이면 실행마다 범위 수만큼의 임시 풀을 만들고 닫는다(라이브러리 단독 사용용).
     * 파일 단위 검색(바깥 작업)이 이 실행기의 범위 작업(안쪽 작업)을 기다리므로, 바깥 작업이 도는 풀과 같은 풀을 넘기면
     * 안 된다 — 바깥 작업이 풀을 다 차지하면 안쪽 작업이 돌 자리가 없어 교착된다.
     */
    private final Executor rangeExecutor;

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
        this(searchResult, logContentsFilters, contextualNewLineInspector, ranges, charsetName, null);
    }
    public MultiThreadRangeSearcherRunner(SearchResult searchResult,
                                          LogContentsFilter[] logContentsFilters,
                                          ContextualNewLineInspector contextualNewLineInspector,
                                          List<Range> ranges,
                                          String charsetName,
                                          Executor rangeExecutor) {
        super(searchResult, logContentsFilters, contextualNewLineInspector);
        this.ranges = ranges;
        this.charsetName = charsetName;
        this.rangeExecutor = rangeExecutor;
    }
    @Override
    public void run() {
        if (ranges.size() == 1) {
            RangeTextSearcher rangeTextSearcher = new RangeTextSearcher(searchResult, logContentsFilters, contextualNewLineInspector, ranges.get(0).getStartIndex(), ranges.get(0).getLimitLength(), charsetName);
            rangeTextSearcher.run();
            log.info("단일 파일 검색 완료 - no multi thread/" + System.currentTimeMillis());
        } else {
            List<SearchResult> searchResults;
            if (rangeExecutor != null) {
                searchResults = searchRanges(rangeExecutor);
            } else {
                // 공유 실행기가 없으면 예전처럼 범위 수만큼의 풀을 쓰고, close() 가 모든 작업이 끝날 때까지 기다린다.
                try (ExecutorService executorService = Executors.newFixedThreadPool(ranges.size())) {
                    searchResults = searchRanges(executorService);
                }
            }

            // 범위 순서대로 합친다 — 결과 줄 순서가 파일 순서와 같다.
            for (SearchResult searchResult : searchResults) {
                for (String s : searchResult.getResult()) {
                    this.searchResult.addResultLine(s);
                }
            }
            log.info("단일 파일 검색 완료 - multi thread/" + System.currentTimeMillis());
        }
    }

    /** 범위마다 검색 작업을 넣고 모두 끝날 때까지 기다린다(sleep 으로 도는 대신 Future 완료를 기다림). */
    private List<SearchResult> searchRanges(Executor executor) {
        List<SearchResult> searchResults = new ArrayList<>();
        List<CompletableFuture<Void>> futures = new ArrayList<>();
        for (int i = 0; i < ranges.size(); i++) {
            SearchResult searchResult = new SearchResult(this.searchResult.getFile());
            searchResults.add(searchResult);
            Runnable searcher = new RangeTextSearcher(searchResult, logContentsFilters, contextualNewLineInspector, ranges.get(i).getStartIndex(), ranges.get(i).getLimitLength(), charsetName);
            futures.add(CompletableFuture.runAsync(searcher, executor));
        }
        for (CompletableFuture<Void> future : futures) {
            try {
                // join 은 인터럽트에 끊기지 않는다 — 예전 바쁜 대기처럼 모든 범위가 끝날 때까지 기다린다.
                future.join();
            } catch (CompletionException e) {
                // 한 범위가 실패해도 나머지 범위 결과는 살린다(예전: 실패한 작업만 빠지고 나머지는 합쳐짐).
                log.error("범위 검색 실패 - " + this.searchResult.getFile(), e.getCause());
            }
        }
        return searchResults;
    }
}
