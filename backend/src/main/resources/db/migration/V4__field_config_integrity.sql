CREATE TABLE field_config_v4_merge (
    field_name VARCHAR(255) PRIMARY KEY,
    survivor_id BIGINT NOT NULL,
    merged_options TEXT NOT NULL,
    expected_options_length BIGINT NOT NULL,
    CONSTRAINT ck_field_config_v4_merge_complete
        CHECK (expected_options_length = CHAR_LENGTH(merged_options))
);

INSERT INTO field_config_v4_merge (
    field_name,
    survivor_id,
    merged_options,
    expected_options_length
)
WITH RECURSIVE option_parts (
    field_name,
    row_id,
    option_position,
    option_value,
    remaining_options
) AS (
    SELECT
        field_name,
        id,
        1,
        TRIM(CASE
            WHEN LOCATE(',', options) > 0
                THEN SUBSTRING(options, 1, LOCATE(',', options) - 1)
            ELSE options
        END),
        CASE
            WHEN LOCATE(',', options) > 0
                THEN SUBSTRING(options, LOCATE(',', options) + 1)
            ELSE ''
        END
    FROM field_config
    WHERE options IS NOT NULL AND TRIM(options) <> ''

    UNION ALL

    SELECT
        field_name,
        row_id,
        option_position + 1,
        TRIM(CASE
            WHEN LOCATE(',', remaining_options) > 0
                THEN SUBSTRING(remaining_options, 1, LOCATE(',', remaining_options) - 1)
            ELSE remaining_options
        END),
        CASE
            WHEN LOCATE(',', remaining_options) > 0
                THEN SUBSTRING(remaining_options, LOCATE(',', remaining_options) + 1)
            ELSE ''
        END
    FROM option_parts
    WHERE remaining_options <> ''
),
ranked_options AS (
    SELECT
        field_name,
        row_id,
        option_position,
        option_value,
        ROW_NUMBER() OVER (
            PARTITION BY field_name, option_value
            ORDER BY row_id, option_position
        ) AS duplicate_rank
    FROM option_parts
    WHERE option_value <> ''
),
option_aggregates AS (
    SELECT
        field_name,
        GROUP_CONCAT(
            option_value ORDER BY row_id, option_position SEPARATOR ','
        ) AS merged_options,
        SUM(CHAR_LENGTH(option_value)) + COUNT(*) - 1 AS expected_options_length
    FROM ranked_options
    WHERE duplicate_rank = 1
    GROUP BY field_name
),
field_survivors AS (
    SELECT field_name, MIN(id) AS survivor_id
    FROM field_config
    GROUP BY field_name
)
SELECT
    survivors.field_name,
    survivors.survivor_id,
    COALESCE(aggregates.merged_options, ''),
    COALESCE(aggregates.expected_options_length, 0)
FROM field_survivors survivors
LEFT JOIN option_aggregates aggregates
    ON aggregates.field_name = survivors.field_name;

UPDATE field_config
SET options = (
    SELECT merged_options
    FROM field_config_v4_merge
    WHERE field_config_v4_merge.survivor_id = field_config.id
)
WHERE id IN (SELECT survivor_id FROM field_config_v4_merge);

DELETE FROM field_config
WHERE id NOT IN (SELECT survivor_id FROM field_config_v4_merge);

ALTER TABLE field_config
    ADD CONSTRAINT uk_field_config_field_name UNIQUE (field_name);

DROP TABLE field_config_v4_merge;
