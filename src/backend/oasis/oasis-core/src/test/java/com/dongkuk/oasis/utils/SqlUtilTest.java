package com.dongkuk.oasis.utils;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

class SqlUtilTest {

    @Test
    void testRemoveBlockComment() {
        String sql = "SELECT /* comment */ * FROM table";
        String expected = "SELECT   * FROM table";
        assertEquals(expected, SqlUtil.removeComments(sql));
    }

    @Test
    void testRemoveLineComment() {
        String sql = "SELECT * FROM table -- comment";
        String expected = "SELECT * FROM table  ";
        assertEquals(expected, SqlUtil.removeComments(sql));
    }

    @Test
    void testCommentInString() {
        String sql = "SELECT '/* not a comment */' FROM table";
        String expected = "SELECT '/* not a comment */' FROM table";
        assertEquals(expected, SqlUtil.removeComments(sql));
    }

    @Test
    void testLineCommentInString() {
        String sql = "SELECT '-- not a comment' FROM table";
        String expected = "SELECT '-- not a comment' FROM table";
        assertEquals(expected, SqlUtil.removeComments(sql));
    }

    @Test
    void testMultiLineBlockComment() {
        String sql = "SELECT /* multi\nline\ncomment */ 1";
        String expected = "SELECT   1";
        assertEquals(expected, SqlUtil.removeComments(sql));
    }

    @Test
    void testMultipleComments() {
        String sql = "/* start */ SELECT /* middle */ 1 -- end";
        String expected = "  SELECT   1  ";
        assertEquals(expected, SqlUtil.removeComments(sql));
    }

    @Test
    void testStringEscapedQuote() {
        String sql = "SELECT 'It''s a string -- not comment'";
        String expected = "SELECT 'It''s a string -- not comment'";
        assertEquals(expected, SqlUtil.removeComments(sql));
    }

    @Test
    void testComplexMix() {
        String sql = "/* comment */ SELECT 'string /* value */' /* comment 2 */ FROM table -- end";
        String expected = "  SELECT 'string /* value */'   FROM table  ";
        assertEquals(expected, SqlUtil.removeComments(sql));
    }

    @Test
    void testCommentWithQuotes() {
        String sql = "SELECT 1 /* comment with 'quotes' inside */";
        String expected = "SELECT 1  ";
        assertEquals(expected, SqlUtil.removeComments(sql));
    }
}
