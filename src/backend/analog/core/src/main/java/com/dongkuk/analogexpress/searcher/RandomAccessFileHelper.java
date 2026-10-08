package com.dongkuk.analogexpress.searcher;

import com.dongkuk.analogexpress.comparator.LoggingTimeComparator;
import com.dongkuk.analogexpress.io.RandomAccessibleLineReader;

import java.io.IOException;
import java.util.function.IntPredicate;

public class RandomAccessFileHelper {
    public static final byte LINE_FEED = 0x0A;
    public static byte CARRIAGE_RETURN = 0x0D;

    /**
     * 시간 범위에 속하는 첫 로그 기록의 시작 위치를 돌려준다. 범위에 속한 기록이 없으면 -1 이다.
     * 기록의 첫 줄만 시각을 가지며, 시각이 없는 줄(여러 줄 SQL·스택 트레이스)은 앞 기록에 이어진 줄로 본다.
     */
    public static long startIndex(RandomAccessibleLineReader file, LoggingTimeComparator comparator) throws IOException {
        Record first = firstRecordMatching(file, comparator, compare -> compare >= 0);
        if (first == null || comparator.compare(first.line) != 0)
            return -1;
        return first.start;
    }

    /**
     * 시간 범위에 속하는 마지막 로그 기록의 마지막 줄 시작 위치를 돌려준다(이어진 줄 포함). 범위에 속한 기록이 없으면 -1 이다.
     */
    public static long endIndex(RandomAccessibleLineReader file, LoggingTimeComparator comparator) throws IOException {
        Record first = firstRecordMatching(file, comparator, compare -> compare >= 0);
        if (first == null || comparator.compare(first.line) != 0)
            return -1;

        // 범위를 넘는 첫 기록 직전까지가 범위 안의 마지막 기록(과 이어진 줄)이다.
        Record beyond = firstRecordMatching(file, comparator, compare -> compare > 0);
        long boundary = beyond == null ? file.length() : beyond.start;
        return getCurrentLineStartPointer(boundary - 1, file);
    }

    private record Record(long start, long end, String line) {
    }

    /**
     * 시각이 있는 기록 중 조건을 만족하는 첫 기록을 이진 탐색으로 찾는다. 없으면 null 이다.
     * 기록의 시각은 파일 앞에서 뒤로 갈수록 작아지지 않으므로 조건은 파일을 따라 한 번만 거짓에서 참으로 바뀐다.
     * 탐색 위치가 시각 없는 줄 묶음 안에 떨어져도 다음 기록을 앞으로 찾아 그 기록으로 판정하므로,
     * 매 회 lo 가 커지거나 hi 가 작아져 반드시 끝난다.
     */
    private static Record firstRecordMatching(RandomAccessibleLineReader file, LoggingTimeComparator comparator, IntPredicate condition) throws IOException {
        long lo = 0; // lo 앞의 기록은 모두 조건을 만족하지 않는다. 항상 줄의 시작 위치다.
        long hi = file.length(); // 조건을 만족하는 첫 기록은 hi 앞에서 시작한다.
        Record found = null;

        while (lo < hi) {
            long mid = lo + (hi - lo) / 2;
            long lineStart = Math.max(lo, getCurrentLineStartPointer(mid, file));
            Record record = nextRecord(file, lineStart, comparator);

            if (record == null || record.start >= hi) {
                // lineStart 부터 hi 까지는 기록의 시작이 없다.
                hi = lineStart;
            } else if (condition.test(comparator.compare(record.line))) {
                found = record;
                hi = record.start;
            } else {
                lo = record.end;
            }
        }
        return found;
    }

    /** position(줄의 시작 위치) 이후 처음 나오는 시각이 있는 줄을 읽는다. 없으면 null 이다. */
    private static Record nextRecord(RandomAccessibleLineReader file, long position, LoggingTimeComparator comparator) throws IOException {
        file.seek(position);
        while (true) {
            long start = file.getFilePointer();
            String line = file.readLine();
            if (line == null)
                return null;
            if (comparator.canCompare(line))
                return new Record(start, file.getFilePointer(), line);
        }
    }

    public static long getCurrentLineStartPointer(long pos, RandomAccessibleLineReader file) throws IOException {
        file.seek(pos);
        long filePointer;
        int read = 0;
        int beforeRead = 0;
        while (file.getFilePointer() > 0) {
            read = file.read();
            if (read == LINE_FEED) {
                // 문자열 중간 index 부터 타다가 처음 lf를 발견했을 때
                if (isChar(beforeRead) && beforeRead != 0) {
                    file.seek(file.getFilePointer());
                    break;
                } else if (!isChar(beforeRead)) {
                    file.seek(file.getFilePointer());
                    break;
                }
            } else if (read == CARRIAGE_RETURN) {
                if (isChar(beforeRead) && beforeRead != 0) {
                    file.seek(file.getFilePointer());
                    break;
                } else if ((beforeRead == CARRIAGE_RETURN)) {
                    file.seek(file.getFilePointer());
                    break;
                }
            }

            file.seek(file.getFilePointer() - 2);
            beforeRead = read;
        }
        filePointer = file.getFilePointer();
        return filePointer;
    }

    public static boolean isChar(int data) {
        return (data != LINE_FEED && data != CARRIAGE_RETURN);
    }
}
