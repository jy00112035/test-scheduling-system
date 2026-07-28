package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.*;

/**
 * Merges duplicate field_config rows with the same field_name.
 * <p>
 * For each field_name group:
 * <ol>
 *   <li>Keeps the row with the lowest id as the survivor.</li>
 *   <li>Collects all comma-separated options from every row in the group,
 *       splits, trims, deduplicates (preserving first-seen order), and
 *       joins them back into a single comma-separated string.</li>
 *   <li>Updates the survivor's options with the merged value.</li>
 *   <li>Deletes all non-survivor rows.</li>
 * </ol>
 * Finally, adds a unique constraint on {@code field_name} so future
 * duplicates are rejected at the database level.
 */
public class V4__field_config_integrity extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();

        // ── 1. Read all rows, grouped by field_name (ordered by id) ──
        Map<String, List<Row>> groups = new LinkedHashMap<>();
        try (Statement stmt = connection.createStatement();
             ResultSet rs = stmt.executeQuery(
                 "SELECT id, field_name, options FROM field_config ORDER BY id")) {
            while (rs.next()) {
                Row row = new Row();
                row.id = rs.getLong("id");
                row.fieldName = rs.getString("field_name");
                row.options = rs.getString("options");
                groups.computeIfAbsent(row.fieldName, k -> new ArrayList<>()).add(row);
            }
        }

        // ── 2. Merge options per group ──
        for (List<Row> rows : groups.values()) {
            if (rows.size() <= 1) {
                continue; // no duplicates to merge
            }

            Row survivor = rows.get(0); // lowest id

            // Collect, split, trim, deduplicate (LinkedHashSet preserves order)
            LinkedHashSet<String> merged = new LinkedHashSet<>();
            for (Row row : rows) {
                if (row.options != null && !row.options.isEmpty()) {
                    for (String opt : row.options.split(",")) {
                        String trimmed = opt.trim();
                        if (!trimmed.isEmpty()) {
                            merged.add(trimmed);
                        }
                    }
                }
            }

            String mergedOptions = String.join(",", merged);

            // Update survivor
            try (PreparedStatement ps = connection.prepareStatement(
                "UPDATE field_config SET options = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")) {
                ps.setString(1, mergedOptions);
                ps.setLong(2, survivor.id);
                ps.executeUpdate();
            }

            // Delete non-survivors
            for (int i = 1; i < rows.size(); i++) {
                try (PreparedStatement ps = connection.prepareStatement(
                    "DELETE FROM field_config WHERE id = ?")) {
                    ps.setLong(1, rows.get(i).id);
                    ps.executeUpdate();
                }
            }
        }

        // ── 3. Add unique constraint on field_name ──
        try (Statement stmt = connection.createStatement()) {
            stmt.execute(
                "ALTER TABLE field_config ADD CONSTRAINT uk_field_config_field_name UNIQUE (field_name)");
        } catch (Exception e) {
            // Constraint may already exist — safe to ignore
        }
    }

    private static class Row {
        long id;
        String fieldName;
        String options;
    }
}
