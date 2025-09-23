export class Db {
    /** @type {Proxy} */
    #connectionsStore;

    /**
     * @param {Proxy} connectionsStore
     */
    constructor(connectionsStore) {
        this.#connectionsStore = connectionsStore;
    }

    /**
     * @param {string} sqlQuery
     * @returns {Promise<string>}
     */
    fetch$(sqlQuery) {
        // @TODO add the timeout option
        return new Promise((resolve, reject) => {
            window.electronAPI.fetchFromDb(
                sqlQuery,
                this.#connectionsStore.mysqlServerIp,
                this.#connectionsStore.mysqlServerPort,
                this.#connectionsStore.mysqlServerLogin,
                this.#connectionsStore.mysqlServerPassword,
                this.#connectionsStore.mysqlServerDatabase
            );

            window.electronAPI.onFetchFromDbResult(function(res) {
                if (typeof res !== 'object') {
                    throw new Error(
                        'Invalid variable type in onFetchFromDbResult() 1st argument. Expected an object, '
                      + `got "${typeof res}".`
                    );
                }
                if (typeof res.ok !== 'boolean') {
                    throw new Error(
                        'Invalid variable object structure in onFetchFromDbResult() 1st argument. Expected an object, '
                        + 'with structure { ok: boolean, result: ?object, error: ?string }.'
                    );
                }

                if (res.ok) {
                    resolve(res);
                } else {
                    reject(res);
                }
            });
        });
    }
}
