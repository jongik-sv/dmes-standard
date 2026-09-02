package com.dongkuk.analogexpress.searcher;

import com.dongkuk.analogexpress.comparator.LoggingTimeComparator;
import com.dongkuk.analogexpress.io.RandomAccessibleLineReader;

import java.io.IOException;

public class RandomAccessFileHelper {
    public static final byte LINE_FEED = 0x0A;
    public static byte CARRIAGE_RETURN = 0x0D;

    public static long startIndex(RandomAccessibleLineReader file, LoggingTimeComparator comparator) throws IOException {
        long s = 0; //start index
        long e = file.length() - 1; //end index
        long h = 0; //head
        long l = -1; //last selected index

        // 날짜가 없는 Log 라인을 건너 뛴다.
        long tempS = 0;
        String removeInvalidLogString;
        while ((removeInvalidLogString = file.readLine()) != null) {
            if (comparator.canCompare(removeInvalidLogString)) {
                s = tempS;
                h = tempS;
                break;
            }
            tempS = file.getFilePointer();
        }

        // 로그를 다 읽었으나 의미 있는 로그행이 없음
        if (removeInvalidLogString == null)
            return l;

        int safeGuard = 0;
        int safeGuardStart;
        while (s != e && e >= 0 && h != l) {
            String s1;

            // 로그행의 시작점을 찾음
            safeGuardStart = 0;
            while (true) {
                file.seek(h);
                s1 = file.readLine();

                // 로그를 다 읽었나 범위 밖임
                if (s1 == null)
                    return l;
                // 헤더가 이미 한번 읽었던 라인 인 경우(h가 canCompare하지 않아 다음라인을 선택했는데 이미 읽은 라인임)
                if (h == l)
                    return l;

                if (comparator.canCompare(s1)) {
                    break;
                } else {
                    h = file.getFilePointer();
                }
                safeGuardStart++;
                if (Short.MAX_VALUE == safeGuardStart)
                    throw new RuntimeException("무한 루프 탐지");
            }

            int compare = comparator.compare(s1);
            if (compare < 0) {
                s = file.getFilePointer();
            } else if (compare == 0) {
                e = h;
                l = h;
            } else {
                e = h;
            }

            long bfh = h;

            h = ((e - s) / 2) + s;
            h = getCurrentLineStartPointer(h, file);
            // h를 선택했는데 이전 결과값이 같은 경우(마지막 라인에서 범위에 속하지 않아 다시 선택했는데 이전에 선택했던 라인)
            if (bfh == h)
                return l;

            safeGuard++;
            if (Short.MAX_VALUE == safeGuard)
                throw new RuntimeException("무한 루프 탐지");
        }
        return l;
    }

    public static long endIndex(RandomAccessibleLineReader file, LoggingTimeComparator comparator) throws IOException {
        long s = 0; //start index
        long e = file.length() - 1; //end index
        long h = file.length() - 1;
        long l = -1; //last selected index
        long lh = -1; //last middle index, 선택한 해더가 컴패어블 할 수 없는 라인일 때 최초 index

        // 날짜가 없는 Log 라인을 건너 뛴다.
        long tempS = 0;
        String removeInvalidLogString;
        while ((removeInvalidLogString = file.readLine()) != null) {
            if (comparator.canCompare(removeInvalidLogString)) {
                s = tempS;
                h = tempS;
                break;
            }
            tempS = file.getFilePointer();
        }

        // 로그를 다 읽었으나 의미 있는 로그행이 없음
        if (removeInvalidLogString == null)
            return l;

        int safeGuard = 0;
        int safeGuardStart;
        while (s != e && e >= 0 && h != l) {
            String s1;

            // 로그행의 시작점을 찾음
            safeGuardStart = 0;
            while (true) {
                file.seek(h);
                s1 = file.readLine();

                // 로그를 다 읽었나 범위 밖임
                if (s1 == null) {
                    return l;
                }
                // 헤더가 이미 한번 읽었던 라인 인 경우(h가 canCompare하지 않아 다음라인을 선택했는데 이미 읽은 라인임)
                if (h == l)
                    return l;

                if (comparator.canCompare(s1)) {
                    safeGuardStart++;
                    if (Short.MAX_VALUE == safeGuardStart)
                        throw new RuntimeException("무한 루프 탐지");
                    break;
                } else {
                    if (lh == -1)
                        lh = h; // canCompare 할 수 없는 행의 첫 번째 index 저장
                    h = file.getFilePointer();
                }

                // 마지막에 선택된 행이 없는데 여러행 중 중간에 선택되어
                // 읽기 범위를 초과 한 경우
                // 중간에 선택된 index에서 다시 검색 할 수 있도록 중간 선택된 index를 선택한 후 루프를 종료한다.
                if (lh > 0 && e < h && l < 0) {
                    e = lh;
                    break;
                }

                safeGuardStart++;
                if (Short.MAX_VALUE == safeGuardStart)
                    throw new RuntimeException("무한 루프 탐지");
            }

            // 중간에
            if (comparator.canCompare(s1)) {
                int compare = comparator.compare(s1);
                if (compare < 0) {
                    s = file.getFilePointer();
                } else if (compare == 0) {
                    long bfp;
                    l = h;
                    while (true) {
                        bfp = file.getFilePointer();
                        String s2 = file.readLine();
                        if (s2 == null)
                            break;

                        if (comparator.canCompare(s2)) {
                            break;
                        } else {
                            l = bfp;
                        }
                    }
                    s = bfp;
                } else {
                    if (e == h) {
                        h = lh;
                    }
                    e = h;
                }
            }

            long bfh = h;
            h = ((e - s) / 2) + s;
            h = getCurrentLineStartPointer(h, file);
            // h를 선택했는데 이전 결과값이 같은 경우(마지막 라인에서 범위에 속하지 않아 다시 선택했는데 이전에 선택했던 라인)
            if (bfh == h)
                return l;

            safeGuard++;
            if (Short.MAX_VALUE == safeGuard)
                throw new RuntimeException("무한 루프 탐지");

            lh = -1;
        }
        return l;
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
