package kr.dongkuk.maru.mdm.engine.testsupport;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.ColumnDefinition;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider.BusinessFunction;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider.Body;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider.Param;
import kr.dongkuk.maru.mdm.engine.spi.MasterLookup;

/**
 * 테스트 전용 spi 구현 묶음(TSK-03-02 design.md §2.4). 행을 메모리에 두고 해석 없이 돌려준다.
 */
public final class InMemoryLookups {

    private final Map<String, CodeRows> codes = new HashMap<>();
    private final Map<String, ColumnDefinition> columns = new HashMap<>();
    private final List<BusinessFunction> functions = new ArrayList<>();
    private CodeEffLookup codeEff = CodeEffLookup.NONE;
    private MasterLookup masters = MasterLookup.NONE;

    private InMemoryLookups() {}

    public static InMemoryLookups create() {
        return new InMemoryLookups();
    }

    public InMemoryLookups code(CodeRows rows) {
        codes.put(rows.header().maruCodeId(), rows);
        return this;
    }

    public InMemoryLookups codeEff(CodeEffLookup lookup) {
        this.codeEff = lookup;
        return this;
    }

    public InMemoryLookups masters(MasterLookup lookup) {
        this.masters = lookup;
        return this;
    }

    public InMemoryLookups function(BusinessFunction function) {
        functions.add(function);
        return this;
    }

    public InMemoryLookups column(ColumnDefinition column) {
        columns.put(column.table() + "." + column.column(), column);
        return this;
    }

    public EngineLookups build() {
        Map<String, CodeRows> codeCopy = Map.copyOf(codes);
        Map<String, ColumnDefinition> columnCopy = Map.copyOf(columns);
        List<BusinessFunction> functionCopy = List.copyOf(functions);
        return new EngineLookups(definitions(columnCopy), id -> Optional.ofNullable(codeCopy.get(id)), codeEff, masters,
                () -> functionCopy);
    }

    /** 코드 행 묶음만 가진 {@link CodeLookup}. */
    public static CodeLookup codeLookup(CodeRows... rows) {
        Map<String, CodeRows> byId = new HashMap<>();
        Arrays.stream(rows).forEach(r -> byId.put(r.header().maruCodeId(), r));
        return id -> Optional.ofNullable(byId.get(id));
    }

    private static DefinitionLookup definitions(Map<String, ColumnDefinition> columns) {
        return new DefinitionLookup() {
            @Override
            public Optional<ColumnDefinition> column(String table, String column) {
                return Optional.ofNullable(columns.get(table + "." + column));
            }

            @Override
            public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) {
                return Optional.empty();
            }

            @Override
            public Optional<RuleSetDefinition> ruleSet(String setId) {
                return Optional.empty();
            }
        };
    }

    /** 인자가 모두 nullable 인 비즈니스 함수. */
    public static BusinessFunction fn(String name, Body body, String... params) {
        return new BusinessFunction(name, Arrays.stream(params).map(p -> new Param(p, true)).toList(), false, body);
    }

    /** 호출 횟수를 세는 본문. */
    public static final class CountingBody implements Body {
        private final AtomicInteger calls = new AtomicInteger();
        private final Body delegate;

        public CountingBody(Body delegate) {
            this.delegate = delegate;
        }

        @Override
        public Object apply(List<Object> args) {
            calls.incrementAndGet();
            return delegate.apply(args);
        }

        public int calls() {
            return calls.get();
        }
    }

    /** 받은 기준 시각을 기록하고 판정은 위임하는 {@link MasterLookup}. */
    public static final class RecordingMasterLookup implements MasterLookup {
        private final MasterLookup delegate;
        private final List<LocalDateTime> baseDts = new CopyOnWriteArrayList<>();

        public RecordingMasterLookup(MasterLookup delegate) {
            this.delegate = delegate;
        }

        @Override
        public boolean isValid(String maruDataId, String cateId, String key, LocalDateTime baseDt) {
            baseDts.add(baseDt);
            return delegate.isValid(maruDataId, cateId, key, baseDt);
        }

        @Override
        public Optional<String> attr(String maruDataId, String cateId, String key, LocalDateTime baseDt, int attrNo) {
            baseDts.add(baseDt);
            return delegate.attr(maruDataId, cateId, key, baseDt, attrNo);
        }

        /** 호출마다 받은 baseDt. 호출 횟수는 이 목록의 크기다. */
        public List<LocalDateTime> baseDts() {
            return baseDts;
        }
    }

    /** {@link FunctionProvider} 를 직접 만들 때. */
    public static FunctionProvider provider(BusinessFunction... functions) {
        List<BusinessFunction> list = List.of(functions);
        return () -> list;
    }
}
