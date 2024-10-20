export const notProcessedTorrents = `SELECT DISTINCT
    "T_Out"."movieId",
    "T_Out"."quality",
    "T_Top"."id"
FROM
    "Torrents" "T_Out"
JOIN LATERAL (
    SELECT
        "id"
    FROM
        "Torrents" "T_In"
    WHERE
        "T_In"."movieId" = "T_Out"."movieId"
        AND "T_In"."quality" = "T_Out"."quality"
        AND "T_In"."processed" = false AND  "T_In"."skip" = false
    ORDER BY "T_In"."seeders" * 5 + "T_In"."peers" DESC
    LIMIT 2
) "T_Top" ON true
WHERE
    "T_Out"."processed" = false AND  "T_Out"."skip" = false
ORDER BY "T_Out"."movieId" ASC, "T_Out"."quality" DESC`;

export const notProcessedTorrentsForMovie = `SELECT DISTINCT
    "T_Out"."quality",
    "T_Top"."id"
FROM
    "Torrents" "T_Out"
JOIN LATERAL (
    SELECT
        "id"
    FROM
        "Torrents" "T_In"
    WHERE
        "T_In"."movieId" = "T_Out"."movieId"
        AND "T_In"."quality" = "T_Out"."quality"
        AND "T_In"."processed" = false AND  "T_In"."skip" = false
    ORDER BY "T_In"."seeders" * 5 + "T_In"."peers" DESC
    LIMIT 2
) "T_Top" ON true
WHERE
    "T_Out"."processed" = false AND  "T_Out"."skip" = false AND "T_Out"."movieId" = :movieId
ORDER BY "T_Out"."quality" DESC`;
