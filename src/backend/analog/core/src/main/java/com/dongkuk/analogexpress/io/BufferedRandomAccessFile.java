package com.dongkuk.analogexpress.io;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;

public class BufferedRandomAccessFile implements RandomAccessibleLineReader {
    private final RandomAccessFile raf;

    private final int defaultBufferSize;
    private int bufferPoint = 0;
    private int readBufferSize = 0;

    private final byte[] buffer;


    private long bufferBaseFilePoint;
    private long currentBaseFilePoint;

    public BufferedRandomAccessFile(File file, String mode) throws IOException {
        this(file, mode, 1000);
    }

    public BufferedRandomAccessFile(File file, String mode, int bufferSize) throws IOException {
        raf = new RandomAccessFile(file, mode);
        currentBaseFilePoint = raf.getFilePointer();
        bufferBaseFilePoint = -1;
        defaultBufferSize = bufferSize;

        buffer = new byte[defaultBufferSize];
    }

    private void readIntoBuffer() throws IOException {
        int diff = defaultBufferSize / 2;
        long l = currentBaseFilePoint - diff;

        if (l < 0) {
            diff = (int) currentBaseFilePoint;
        }

        currentBaseFilePoint = currentBaseFilePoint - diff;

        bufferBaseFilePoint = currentBaseFilePoint;
        bufferPoint = diff;
        raf.seek(bufferBaseFilePoint);
        readBufferSize = raf.read(buffer, 0, defaultBufferSize);
        raf.seek(bufferBaseFilePoint);

        if (readBufferSize < defaultBufferSize) {
            buffer[readBufferSize < 0 ? 0 : readBufferSize] = -1;
        }
    }

    @Override
    public int read() throws IOException {
        if (bufferBaseFilePoint != currentBaseFilePoint)
            readIntoBuffer();
        else if (bufferPoint == defaultBufferSize) {
            readIntoBuffer();
        }
        int value = buffer[bufferPoint];
        if (value == -1)
            return value;
        seek(bufferBaseFilePoint + bufferPoint + 1);
        return value;
    }

    @Override
    public long length() throws IOException {
        return raf.length();
    }

    @Override
    public long getFilePointer() throws IOException {
        if (bufferBaseFilePoint != currentBaseFilePoint)
            return raf.getFilePointer();
        else
            return bufferBaseFilePoint + bufferPoint;
    }

    @Override
    public void seek(long h) throws IOException {
        if (bufferBaseFilePoint <= h && bufferBaseFilePoint + readBufferSize > h && bufferBaseFilePoint == currentBaseFilePoint)
            bufferPoint = (int) (h - bufferBaseFilePoint);
        else {
            raf.seek(h);
            bufferPoint = 0;
            currentBaseFilePoint = h;
        }
    }

    @Override
    public String readLine() throws IOException {
        StringBuilder input = new StringBuilder();
        int c = -1;
        boolean eol = false;

        while (!eol) {
            switch (c = read()) {
                case -1:
                case '\n':
                    eol = true;
                    break;
                case '\r':
                    eol = true;
                    long cur = getFilePointer();
                    if ((read()) != '\n') {
                        seek(cur);
                    }
                    break;
                default:
                    input.append((char) c);
                    break;
            }
        }

        if ((c == -1) && (input.length() == 0)) {
            return null;
        }
        return input.toString();
    }

    @Override
    public void close() throws IOException {
        raf.close();
    }
}
