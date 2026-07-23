package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.Statement;

public class V3_1__raise_mysql_group_concat_limit extends BaseJavaMigration {

    private static final String SESSION_SQL =
        "SET SESSION group_concat_max_len = 1048576";

    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        if (!"MySQL".equalsIgnoreCase(
                connection.getMetaData().getDatabaseProductName())) {
            return;
        }
        try (Statement statement = connection.createStatement()) {
            statement.execute(SESSION_SQL);
        }
    }
}
