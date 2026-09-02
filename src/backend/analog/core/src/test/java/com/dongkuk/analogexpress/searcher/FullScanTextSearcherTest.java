package com.dongkuk.analogexpress.searcher;

import com.dongkuk.analogexpress.filter.contents.LogContentsFilter;
import com.dongkuk.analogexpress.filter.contents.LogContentsKeywordFilter;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import java.io.File;

class FullScanTextSearcherTest {

    @Test
    public void givenTextMatchedSqlThenItThreatAsOneLine() {
        String keyword = "생산중량";
        File file = new File("src/test/resources/logs/mpr_app_20200730_10.log");
        SearchResult searchResult = new SearchResult(file);
        FullScanTextSearcher fullScanTextSearcher = new FullScanTextSearcher(searchResult, new LogContentsFilter[]{new LogContentsKeywordFilter(keyword)}, new YearFirstContextualNewLineInspector());
        fullScanTextSearcher.run();

        Assertions.assertEquals(3, searchResult.getResult().size());
    }

    @Test
    public void performanceCheck() {
        long start = System.currentTimeMillis();
        String keyword = "현재시간";
        File file = new File("C:/Users/USER/Desktop/dmes_prd_log/dmes_prd_log/mpp_app_20200811_16.log");
//        File file = new File("C:/Users/USER/Desktop/dmes_prd_log/dmes_prd_log/mpp_app_20200805_10.log");
        SearchResult searchResult = new SearchResult(file);
        FullScanTextSearcher fullScanTextSearcher = new FullScanTextSearcher(searchResult, new LogContentsFilter[]{new LogContentsKeywordFilter(keyword)}, new YearFirstContextualNewLineInspector());
        fullScanTextSearcher.run();
        String resultAsString = searchResult.getResultAsString(100000000);
//        System.out.println(resultAsString);

        long end = System.currentTimeMillis();
        System.out.println(end - start);
        //1551
    }

    @Test
    public void textCompareExample() {
        String logText = "2020-08-08 20:17:33,350 TH-44 ${ctx:SERVICEID}[";
        String baseTimeText31 = "2020-08-08 20:17:31";
        String baseTimeText33 = "2020-08-08 20:17:33";
        String baseTimeText35 = "2020-08-08 20:17:35";
        String logTimeText = logText.substring(0, 19);

        Assertions.assertFalse(baseTimeText31.compareTo(logTimeText) > 0);
        Assertions.assertEquals(0, baseTimeText33.compareTo(logTimeText));
        Assertions.assertTrue(baseTimeText35.compareTo(logTimeText) > 0);
    }
}