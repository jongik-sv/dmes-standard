package com.dongkuk.analogexpress.io;

import java.io.*;

public class LimitedFileInputStream extends FileInputStream {
    private final long limit;
    private long streamedSize = 0;

    public LimitedFileInputStream(FileDescriptor fdObj, long limit) {
        super(fdObj);
        this.limit = limit;
    }

    public LimitedFileInputStream(File file, long limit) throws FileNotFoundException {
        super(file);
        this.limit = limit;
    }

    @Override
    public int read()
            throws IOException {
        long availableSize = limit - streamedSize;
        if (availableSize == 0)
            return -1;

        int b = super.read();
        if (b >= 0)
            streamedSize += 1;
        return b;
    }

    @Override
    public int read(byte[] b) throws IOException {
        long availableSize = limit - streamedSize;
        if (availableSize == 0)
            return -1;

        if (b.length >= availableSize) {
            byte[] bytes = new byte[(int) availableSize];
            int read = super.read(bytes);
            System.arraycopy(bytes, 0, b, 0, bytes.length);
            return read;

        } else
            return super.read(b);
    }

    @Override
    public int read(byte[] b, int off, int len)
            throws IOException {
        int length = len;
        long availableSize = limit - streamedSize;
        if (availableSize == 0)
            return -1;
        if (len >= availableSize) {
            length = (int) availableSize;
        }
        int n = super.read(b, off, length);
        if (n > 0)
            streamedSize += n;
        return n;
    }

}
