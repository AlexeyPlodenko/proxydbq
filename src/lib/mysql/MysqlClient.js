import mysql from 'mysql2/promise';
import {EventEmitter} from 'events';
import {ConnectionNotWritable} from './errors/ConnectionNotWritable.js';

export class MysqlClient extends EventEmitter {
    /**
     * @param {import('mysql2').ConnectionOptions} [config]
     */
    constructor(config = {}) {
        super();
        this.config = config;
        this.connection = null;
        this.connected = false;
        this.connecting = false;
        this.connectPromise = null;
    }

    /**
     * Returns whether the client considers itself connected.
     *
     * @returns {boolean}
     */
    isConnected() {
        return !!this.connected && !!this.connection;
    }

    /**
     * Access the underlying mysql2 connection.
     *
     * @returns {import('mysql2/promise').Connection|null}
     */
    rawConnection() {
        return this.connection;
    }

    /**
     * Establish a connection if not connected.
     * Subsequent calls reuse the ongoing connection attempt.
     *
     * @returns {Promise<import('mysql2/promise').Connection>}
     */
    async connect$() {
        if (this.connection && this.connected) {
            return this.connection;
        }
        if (this.connecting && this.connectPromise) {
            return this.connectPromise;
        }
        this.connecting = true;
        this.connectPromise = mysql.createConnection(this.config)
            .then((conn) => {
                this.connection = conn;
                this.connected = true;
                this.connecting = false;

                // Bubble up low-level events
                conn.on('error', (err) => {
                    this.connected = false;
                    this.emit('error', err);
                });
                conn.on('end', () => {
                    this.connected = false;
                    this.emit('end');
                });
                // Some drivers emit 'close'; handle if present
                conn.on?.('close', () => {
                    this.connected = false;
                    this.emit('close');
                });

                this.emit('connect');
                return conn;
            })
            .catch((err) => {
                this.connecting = false;
                this.connectPromise = null;
                throw err;
            });
        return this.connectPromise;
    }

    /**
     * Ensure there is an active connection, otherwise throw ConnectionNotWritable.
     */
    ensureWritable() {
        if (!this.connection || !this.connected) {
            throw new ConnectionNotWritable('MySQL connection is not established or not writable');
        }
    }

    /**
     * Execute a SQL query. Lazily connects if needed.
     *
     * @param {string} sql
     * @param {any[]|Record<string, any>} [params]
     * @returns {Promise<{ rows: [], fields: import('mysql2').FieldPacket[] }>}
     */
    async query$(sql, params = []) {
        if (!this.isConnected()) {
            await this.connect();
        }
        this.ensureWritable();
        const [rows, fields] = await this.connection.query(sql, params);
        return {rows, fields};
    }

    /**
     * Execute a prepared statement.
     *
     * @param {string} sql
     * @param {any[]|Record<string, any>} [params]
     * @returns {Promise<{ rows: [], fields: import('mysql2').FieldPacket[] }>}
     */
    async execute$(sql, params = []) {
        if (!this.isConnected()) {
            await this.connect();
        }
        this.ensureWritable();
        const [rows, fields] = await this.connection.execute(sql, params);
        return {rows, fields};
    }

    /**
     * Ping the server to validate the connection.
     *
     * @returns {Promise<void>}
     */
    async ping$() {
        if (!this.isConnected()) {
            await this.connect();
        }
        this.ensureWritable();
        await this.connection.ping();
    }

    /**
     * Close the connection gracefully.
     *
     * @returns {Promise<void>}
     */
    async close$() {
        if (this.connection) {
            try {
                await this.connection.end();
            } finally {
                this.connected = false;
                this.connection = null;
                this.connectPromise = null;
                this.emit('close');
            }
        }
    }

    /**
     * Destroy the connection immediately (without waiting for in-flight queries).
     */
    destroy() {
        if (this.connection) {
            try {
                this.connection.destroy();
            } finally {
                this.connected = false;
                this.connection = null;
                this.connectPromise = null;
                this.emit('close');
            }
        }
    }
}
