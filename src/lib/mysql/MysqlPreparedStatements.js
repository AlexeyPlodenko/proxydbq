import {d} from "../helpers.js";
import {MysqlPreparedStatement} from "./MysqlPreparedStatement.js";

export class MysqlPreparedStatements {
    /**
     * Store prepared statements information.
     *
     * @type {Map<number, MysqlPreparedStatement>}
     */
    #store = new Map();

    /**
     * Delete outdated preparedStatements, every minute.
     *
     * @type {number}
     */
    #delOutdatedInterval = 0;

    /**
     * @param {number} statementId
     * @param {MysqlPreparedStatement} statement
     * @returns {MysqlPreparedStatements}
     */
    addStatement(statementId, statement) {
        this.#store.set(statementId, statement);
        return this;
    }

    /**
     * @param {number} statementId
     * @returns {MysqlPreparedStatements}
     */
    deleteStatement(statementId) {
        this.#store.delete(statementId);
        return this;
    }

    /**
     * @param {number} statementId
     * @returns {MysqlPreparedStatement}
     */
    getStatement(statementId) {
        return this.#store.get(statementId);
    }

    /**
     * @returns {MysqlPreparedStatements}
     */
    startDeleteOutdatedStatements() {
        this.#delOutdatedInterval = setInterval(() => this.deleteOutdatedStatements(), 60000);
        return this;
    }

    /**
     * @returns {MysqlPreparedStatements}
     */
    stopDeleteOutdatedStatements() {
        if (this.#delOutdatedInterval) {
            clearInterval(this.#delOutdatedInterval);
        }
        return this;
    }

    deleteOutdatedStatements() {
        const date = new Date();
        const now = date.getTime();
        const outdatedTime = 60000; // 1 min
        let deletedCount = 0;
        this.#store.forEach((statement, statementId) => {
            if (now - statement.date.getTime() > outdatedTime) {
                this.#store.delete(statementId);
                deletedCount++;
            }
        });
        console.log(date, `Deleted ${deletedCount} stored statements.`);
    }
}
