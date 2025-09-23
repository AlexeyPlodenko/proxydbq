/**
 * Checks if a given SQL query string is a SELECT statement.
 * This function is intended for UI-level checks (e.g., deciding whether to show a results table)
 * and NOT for security purposes.
 *
 * @TODO use https://www.npmjs.com/package/js-sql-parser
 *
 * @param {string} sql The SQL query string.
 * @returns {boolean} True if the query is a SELECT statement, false otherwise.
 */
export function isSelectQuery(sql) {
    if (!sql || typeof sql !== 'string') {
        return false;
    }

    // Trim whitespace from the beginning of the query.
    // Then, check if it starts with 'SELECT' or 'WITH' (for CTEs),
    // optionally preceded by an opening parenthesis '('.
    const selectRegex = /^\s*\(?\s*(?:SELECT|WITH)\b/i;

    return selectRegex.test(sql);
}
