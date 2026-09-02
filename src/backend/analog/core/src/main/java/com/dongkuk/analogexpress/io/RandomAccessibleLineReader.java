package com.dongkuk.analogexpress.io;

import java.io.IOException;

public interface RandomAccessibleLineReader extends AutoCloseable {
    long length() throws IOException;

    String readLine() throws IOException;

    long getFilePointer() throws IOException;

    void seek(long h) throws IOException;

    int read() throws IOException;

    void close() throws IOException;
}
