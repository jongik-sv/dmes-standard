package com.dongkuk.oasis.methodinvoker;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

final class BindingAttemptResult {
    private final PrioritizableMethodOrConstructorHolder holder;
    private final List<String> diagnosticLines;

    BindingAttemptResult(PrioritizableMethodOrConstructorHolder holder) {
        this(holder, Collections.emptyList());
    }

    BindingAttemptResult(PrioritizableMethodOrConstructorHolder holder, List<String> diagnosticLines) {
        this.holder = holder;
        this.diagnosticLines = diagnosticLines == null
                ? Collections.emptyList()
                : Collections.unmodifiableList(new ArrayList<>(diagnosticLines));
    }

    PrioritizableMethodOrConstructorHolder holder() {
        return holder;
    }

    List<String> diagnosticLines() {
        return diagnosticLines;
    }
}
