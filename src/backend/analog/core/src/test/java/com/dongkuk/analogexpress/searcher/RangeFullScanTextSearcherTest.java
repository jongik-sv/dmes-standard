package com.dongkuk.analogexpress.searcher;

import com.dongkuk.analogexpress.comparator.LoggingTimeComparator;
import com.dongkuk.analogexpress.filter.contents.LogContentsFilter;
import com.dongkuk.analogexpress.filter.contents.LogContentsKeywordFilter;
import com.dongkuk.analogexpress.filter.contents.LogContentsLoggingTimeFilter;
import com.dongkuk.analogexpress.io.BufferedRandomAccessFile;
import com.dongkuk.analogexpress.io.DirectRandomAccessFile;
import com.dongkuk.analogexpress.io.RandomAccessibleLineReader;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

import static com.dongkuk.analogexpress.searcher.RandomAccessFileHelper.endIndex;
import static com.dongkuk.analogexpress.searcher.RandomAccessFileHelper.startIndex;

class RangeFullScanTextSearcherTest {


    @Test
    public void performanceCheckForRangeTextNarrowRange() {
        LocalDateTime startDate = LocalDateTime.parse("2020-08-11 16:00:01", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime endDate = LocalDateTime.parse("2020-08-11 16:00:56", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator loggingTimeComparator = new LoggingTimeComparator(startDate, endDate, "yyyy-MM-dd HH:mm:ss", 0, 19);

        String keyword = "현재시간";
        File file = new File(System.getProperty("user.home"), "Desktop/dmes_prd_log/dmes_prd_log/mpp_app_20200811_16.log");
//        File file = new File(System.getProperty("user.home"), "Desktop/dmes_prd_log/dmes_prd_log/mpp_app_20200805_10.log");
        SearchResult searchResult = new SearchResult(file);
        long startIndex = -1;
        long limitLength = -1;
        try (RandomAccessibleLineReader raf = new DirectRandomAccessFile(searchResult.getFile(), "r")) {
            startIndex = startIndex(raf, loggingTimeComparator);
            long endIndex = endIndex(raf, loggingTimeComparator);

            if (startIndex == -1)
                return;

            raf.seek(endIndex);
            raf.readLine();
            long limitIndex = raf.getFilePointer();
            limitLength = limitIndex - startIndex;

        } catch (Exception e) {
        }

        RangeTextSearcher textSearcher = new RangeTextSearcher(searchResult, new LogContentsFilter[]{new LogContentsKeywordFilter(keyword)}, new YearFirstContextualNewLineInspector(), startIndex, limitLength);

        long start = System.currentTimeMillis();
        textSearcher.run();
        long end = System.currentTimeMillis();
        String resultAsString = searchResult.getResultAsString(1000);
        System.out.println(resultAsString);

        System.out.println(end - start);
        //1551
    }
    @Test
    public void performanceCheckForTextNarrowRange() {
        LocalDateTime startDate = LocalDateTime.parse("2020-08-11 16:00:01", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime endDate = LocalDateTime.parse("2020-08-11 16:00:56", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        String keyword = "현재시간";
        File file = new File(System.getProperty("user.home"), "Desktop/dmes_prd_log/dmes_prd_log/mpp_app_20200811_16.log");
//        File file = new File(System.getProperty("user.home"), "Desktop/dmes_prd_log/dmes_prd_log/mpp_app_20200805_10.log");
        LogContentsFilter[] logContentsFilters = {new LogContentsLoggingTimeFilter(startDate, endDate, "yyyy-MM-dd HH:mm:ss", 0, 19), new LogContentsKeywordFilter(keyword)};

        SearchResult searchResult = new SearchResult(file);
        FullScanTextSearcher fullScanTextSearcher = new FullScanTextSearcher(searchResult, logContentsFilters, new YearFirstContextualNewLineInspector());

        long start = System.currentTimeMillis();
        fullScanTextSearcher.run();
        long end = System.currentTimeMillis();
        String resultAsString = searchResult.getResultAsString(1000);
        System.out.println(resultAsString);

        System.out.println(end - start);
    }

    @Test
    public void performanceCheckForRangeTextWideRange() {
        LocalDateTime startDate = LocalDateTime.parse("2020-08-01 16:00:01", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime endDate = LocalDateTime.parse("2020-08-12 16:00:56", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        LoggingTimeComparator loggingTimeComparator = new LoggingTimeComparator(startDate, endDate, "yyyy-MM-dd HH:mm:ss", 0, 19);

        String keyword = "현재시간";
        File file = new File(System.getProperty("user.home"), "Desktop/dmes_prd_log/dmes_prd_log/mpp_app_20200811_16.log");
//        File file = new File(System.getProperty("user.home"), "Desktop/dmes_prd_log/dmes_prd_log/mpp_app_20200805_10.log");
        SearchResult searchResult = new SearchResult(file);
        long startIndex = -1;
        long limitLength = -1;
        try (RandomAccessibleLineReader raf = new DirectRandomAccessFile(searchResult.getFile(), "r")) {
            startIndex = startIndex(raf, loggingTimeComparator);
            long endIndex = endIndex(raf, loggingTimeComparator);

            if (startIndex == -1)
                return;

            raf.seek(endIndex);
            raf.readLine();
            long limitIndex = raf.getFilePointer();
            limitLength = limitIndex - startIndex;

        } catch (Exception e) {
        }
        RangeTextSearcher textSearcher = new RangeTextSearcher(searchResult, new LogContentsFilter[]{new LogContentsKeywordFilter(keyword)}, new YearFirstContextualNewLineInspector(), startIndex, limitLength);

        long start = System.currentTimeMillis();
        textSearcher.run();
        long end = System.currentTimeMillis();
        String resultAsString = searchResult.getResultAsString(1000);
        System.out.println(resultAsString);

        System.out.println(end - start);
        //1551
    }


    @Test
    public void performanceCheckForTextWideRange() {
        LocalDateTime startDate = LocalDateTime.parse("2020-08-01 16:00:01", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime endDate = LocalDateTime.parse("2020-08-12 16:00:56", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        String keyword = "현재시간";
        File file = new File(System.getProperty("user.home"), "Desktop/dmes_prd_log/dmes_prd_log/mpp_app_20200811_16.log");
//        File file = new File(System.getProperty("user.home"), "Desktop/dmes_prd_log/dmes_prd_log/mpp_app_20200805_10.log");
        LogContentsFilter[] logContentsFilters = {new LogContentsLoggingTimeFilter(startDate, endDate, "yyyy-MM-dd HH:mm:ss", 0, 19), new LogContentsKeywordFilter(keyword)};

        SearchResult searchResult = new SearchResult(file);
        FullScanTextSearcher fullScanTextSearcher = new FullScanTextSearcher(searchResult, logContentsFilters, new YearFirstContextualNewLineInspector());

        long start = System.currentTimeMillis();
        fullScanTextSearcher.run();
        long end = System.currentTimeMillis();
        String resultAsString = searchResult.getResultAsString(1000);
        System.out.println(resultAsString);

        System.out.println(end - start);
    }

    @Test
    public void performanceCheckForTextNarrowRangeEucKr() {
        LocalDateTime startDate = LocalDateTime.parse("2020-10-19 23:58:00", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        LocalDateTime endDate = LocalDateTime.parse("2020-10-19 23:58:10", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        String keyword = "작업지시조회";
        File file = new File(System.getProperty("user.home"), "Desktop/uniup_prd_log/2020-10-19/m47/m47.log2020-10-19-23-58.UBIUPMA1");
        LogContentsFilter[] logContentsFilters = {new LogContentsLoggingTimeFilter(startDate, endDate, "yyyy-MM-dd HH:mm:ss, SSS", 1, 25), new LogContentsKeywordFilter(keyword)};

        SearchResult searchResult = new SearchResult(file);
        FullScanTextSearcher fullScanTextSearcher = new FullScanTextSearcher(searchResult, logContentsFilters, new StartsStringContextualNewLineInspector("[20"), "euc-kr");

        long start = System.currentTimeMillis();
        fullScanTextSearcher.run();
        long end = System.currentTimeMillis();
        String resultAsString = searchResult.getResultAsString(1000);
        System.out.println(resultAsString);

        System.out.println(end - start);
    }
}