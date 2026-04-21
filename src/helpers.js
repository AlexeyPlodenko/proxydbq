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

/**
 * SQL beautifier with indentation for subqueries and conditions.
 *
 * @param {string} sql
 * @returns {string}
 */
export function beautifySql(sql) {
    if (!sql || typeof sql !== 'string') {
        return sql;
    }

    const tab = '    ';
    let indentLevel = 0;

    const keywords = [
        'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'INSERT INTO', 'UPDATE', 'SET', 'VALUES',
        'LEFT JOIN', 'INNER JOIN', 'RIGHT JOIN', 'JOIN', 'HAVING', 'UNION', 'CREATE TABLE', 'DELETE FROM', 'DROP TABLE',
        'ALTER TABLE', 'TRUNCATE TABLE', 'DESCRIBE', 'EXPLAIN', 'SHOW', 'USE'
    ];
    const subKeywords = ['AND', 'OR', 'ON', 'USING'];

    // Normalize whitespace and handle basic formatting
    let formatted = sql.replace(/\s+/g, ' ').trim();

    // Replace keywords with markers to split into lines
    keywords.forEach(kw => {
        const regex = new RegExp(`\\b${kw}\\b`, 'gi');
        formatted = formatted.replace(regex, `\n${kw.toUpperCase()}`);
    });

    subKeywords.forEach(kw => {
        const regex = new RegExp(`\\b${kw}\\b`, 'gi');
        formatted = formatted.replace(regex, `\n${kw.toUpperCase()}`);
    });

    // Handle parentheses for subqueries and indentation
    formatted = formatted.replace(/\(/g, ' (\n').replace(/\)/g, '\n) ');

    const lines = formatted.split('\n');
    const result = [];

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        // If the line starts with a closing parenthesis, decrease indent level before rendering
        if (line.startsWith(')')) {
            indentLevel = Math.max(0, indentLevel - 1);
        }

        let currentIndent = indentLevel;
        
        // Indent sub-keywords (AND, OR, ON) one level deeper than the current context
        if (subKeywords.some(kw => line.toUpperCase().startsWith(kw))) {
            currentIndent++;
        }

        result.push(tab.repeat(currentIndent) + line);

        // If the line ends with an opening parenthesis, increase indent level for subsequent lines
        if (line.endsWith('(')) {
            indentLevel++;
        }
    }

    return result.join('\n').trim();
}

/**
 * Normalizes a SQL query for comparison purposes.
 * Removes comments, standardizes whitespace, and converts to lowercase.
 *
 * @param {string} sql
 * @returns {string}
 */
export function normalizeQuery(sql) {
    if (!sql || typeof sql !== 'string') {
        return '';
    }

    return sql
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove C-style comments
        .replace(/--.*$/gm, '')           // Remove SQL-style comments
        .replace(/\s+/g, ' ')             // Standardize whitespace
        .trim()
        .toLowerCase();
}
