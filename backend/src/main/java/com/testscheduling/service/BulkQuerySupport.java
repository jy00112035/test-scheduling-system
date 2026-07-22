package com.testscheduling.service;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

final class BulkQuerySupport {

    static final int CHUNK_SIZE = 500;

    private BulkQuerySupport() {
    }

    static <I, O> List<O> fetchChunks(
            List<I> values, Function<List<I>, List<O>> query) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        List<O> result = new ArrayList<>();
        for (int start = 0; start < values.size(); start += CHUNK_SIZE) {
            int end = Math.min(start + CHUNK_SIZE, values.size());
            result.addAll(query.apply(new ArrayList<>(values.subList(start, end))));
        }
        return result;
    }
}
