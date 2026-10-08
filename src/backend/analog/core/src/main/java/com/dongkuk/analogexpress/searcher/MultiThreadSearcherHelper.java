package com.dongkuk.analogexpress.searcher;

import com.dongkuk.analogexpress.comparator.LoggingTimeComparable;
import com.dongkuk.analogexpress.comparator.LoggingTimeComparator;
import com.dongkuk.analogexpress.io.BufferedRandomAccessFile;
import com.dongkuk.analogexpress.io.RandomAccessibleLineReader;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import static com.dongkuk.analogexpress.searcher.RandomAccessFileHelper.endIndex;
import static com.dongkuk.analogexpress.searcher.RandomAccessFileHelper.startIndex;

public class MultiThreadSearcherHelper {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(MultiThreadSearcherHelper.class);

    public static Index getStartEndIndex(File file, LoggingTimeComparator comparator) {
        try (RandomAccessibleLineReader raf = new BufferedRandomAccessFile(file, "r")) {
            long startIndex = startIndex(raf, comparator);
            if (startIndex == -1)
                return new Index(-1, -1);

            long endIndex = endIndex(raf, comparator);
            raf.seek(endIndex);
            raf.readLine();
            return new Index(startIndex, raf.getFilePointer());
        } catch (IOException e) {
            e.printStackTrace();
        }
        return new Index(-1, -1);
    }

    /**
     * [startIndex, endIndex) 를 스레드 수만큼 나눈다. 경계는 항상 시각이 있는 줄(기록의 머리줄) 시작에 두어
     * 여러 줄 SQL·스택 트레이스가 머리줄과 갈라지지 않게 하고, 마지막 범위는 정확히 endIndex 에서 끝난다.
     */
    public static List<Range> getRanges(File file, LoggingTimeComparable comparator, Index index) {
        List<Range> ranges = new ArrayList<>();
        try (RandomAccessibleLineReader raf = new BufferedRandomAccessFile(file, "r")) {
            long startIndex = index.getStartIndex();
            long limitIndex = index.getEndIndex();
            long limitLength = limitIndex - startIndex;

            int threads = getThreadCount(limitLength);

            long rangeStart = startIndex;
            for (int i = 0; i < threads; i++) {
                long rangeEnd = (i == threads - 1)
                        ? limitIndex
                        : nextRecordStart(raf, comparator, startIndex + (limitLength / threads) * (i + 1), rangeStart, limitIndex);
                if (rangeEnd <= rangeStart)
                    continue; // 앞 범위가 이미 이 구간까지 포함했다.

                ranges.add(new Range(rangeStart, rangeEnd - rangeStart));
                rangeStart = rangeEnd;
            }
        } catch (Exception e) {
            log.error(e.getMessage(), e);
        }
        return ranges;
    }

    /** target 이후 처음 나오는 기록 머리줄의 시작 위치. rangeStart 이하이거나 limitIndex 이상이면 limitIndex 를 돌려준다. */
    private static long nextRecordStart(RandomAccessibleLineReader raf, LoggingTimeComparable comparator, long target, long rangeStart, long limitIndex) throws IOException {
        if (target >= limitIndex)
            return limitIndex;

        raf.seek(Math.max(rangeStart, RandomAccessFileHelper.getCurrentLineStartPointer(target, raf)));
        while (true) {
            long start = raf.getFilePointer();
            if (start >= limitIndex)
                return limitIndex;
            String line = raf.readLine();
            if (line == null)
                return limitIndex;
            if (start > rangeStart && comparator.canCompare(line))
                return start;
        }
    }

    public static int getThreadCount(long limitLength) {
        if (limitLength < 1024 * 1024 * 100)
            return 3;
        else if (limitLength < 1024 * 1024 * 120)
            return 5;
        else
            return 7;
    }
}
