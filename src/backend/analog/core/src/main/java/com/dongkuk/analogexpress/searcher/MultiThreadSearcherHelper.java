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
            long endIndex = endIndex(raf, comparator);

            if (startIndex == -1)
                return new Index(-1, -1);

            raf.seek(endIndex);
            raf.readLine();
            return new Index(startIndex, raf.getFilePointer());
        } catch (IOException e) {
            e.printStackTrace();
        }
        return new Index(-1, -1);
    }

    public static List<Range> getRanges(File file, LoggingTimeComparable comparator, Index index) {
        List<Range> ranges = new ArrayList<>();
        try (RandomAccessibleLineReader raf = new BufferedRandomAccessFile(file, "r")) {
            long startIndex = index.getStartIndex();
            long limitIndex = index.getEndIndex();
            long limitLength = limitIndex - startIndex;

            int threads = getThreadCount(limitLength);


            long tmpStartIndex = startIndex;
            long tmpEndIndex = -1;
            for (int i = 0; i < threads; i++) {
                tmpEndIndex = (limitLength / threads) * (i + 1) + tmpStartIndex;
                if (tmpEndIndex > limitIndex)
                    tmpEndIndex = limitIndex;
                raf.seek(tmpEndIndex);

                while (true) {
                    String line = "";
                    line = raf.readLine();
                    if (line == null)
                        break;
                    if (comparator.canCompare(line))
                        break;
                }
                tmpEndIndex = raf.getFilePointer();

                long tmpLimitLength = tmpEndIndex - tmpStartIndex;
                if (tmpLimitLength == 0)
                    break;

                ranges.add(new Range(tmpStartIndex, tmpLimitLength));
                tmpStartIndex = tmpEndIndex;
            }
        } catch (Exception e) {
            log.error(e.getMessage(), e);
        }
        return ranges;
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
