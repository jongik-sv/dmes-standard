package com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta;

import java.util.List;

/**
 * 스키마 하나의 딕셔너리 메타(스펙 2.1-4). 행 데이터는 담지 않는다. {@link ErdDbMetaReader} 가 만들고, 관계 추정기·가져오기·DB 차이가 읽는다.
 * 이름은 DB 그대로(대문자 물리명)다. 정렬: 표 이름 순, 컬럼 COLUMN_ID 순, 제약·인덱스 (표, 이름) 순.
 */
public record ErdDbMeta(String owner, List<Table> tables, List<Constraint> constraints, List<Index> indexes) {

    public ErdDbMeta {
        tables = List.copyOf(tables);
        constraints = List.copyOf(constraints);
        indexes = List.copyOf(indexes);
    }

    /** comment 는 ALL_TAB_COMMENTS 값(없으면 null). */
    public record Table(String name, String comment, List<Column> columns) {
        public Table {
            columns = List.copyOf(columns);
        }
    }

    /**
     * dataType 은 ALL_TAB_COLUMNS.DATA_TYPE 그대로다(예 TIMESTAMP(6)). 모델 타입으로 바꾸는 일은 가져오기가 한다.
     * length: CHAR_USED='C' 면 CHAR_LENGTH(문자 수), 'B' 이거나 RAW 면 DATA_LENGTH(바이트), 나머지 null.
     * precision·scale: DATA_PRECISION·DATA_SCALE 그대로. defaultValue: DATA_DEFAULT_VC 앞뒤 공백을 지운 값, IDENTITY 컬럼은 null.
     */
    public record Column(String name, int position, String dataType, Integer length, Integer precision, Integer scale,
                         boolean nullable, String defaultValue, String comment) {
    }

    /** type 은 P|U|R. columns 는 POSITION 순. refTable·refColumns 는 R 만 채운다(같은 위치끼리 짝). P·U 는 null·빈 목록. */
    public record Constraint(String name, String table, String type, List<String> columns, String refTable, List<String> refColumns) {
        public Constraint {
            columns = List.copyOf(columns);
            refColumns = refColumns == null ? List.of() : List.copyOf(refColumns);
        }
    }

    /** PK·UK 를 받치는 인덱스와 함수 기반·LOB 인덱스는 넣지 않는다. columns 는 COLUMN_POSITION 순. */
    public record Index(String name, String table, boolean unique, List<String> columns) {
        public Index {
            columns = List.copyOf(columns);
        }
    }
}
