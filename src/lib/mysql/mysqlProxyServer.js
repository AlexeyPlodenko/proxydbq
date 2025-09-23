import net from 'net';
import {d} from "../helpers.js";
import {MysqlPreparedStatements} from "./MysqlPreparedStatements.js";
import {QueryLogMessage} from "../logging/QueryLogMessage.js";
import {createProcessMySQLClientData} from "./processMySQLClientData.js";
import {handleStatementPrepareResponse} from "./handleStatementPrepareResponse.js";
import {MysqlClient} from "./MysqlClient.js";

// --- MySQL Constants ---
// protocol docs https://www.oreilly.com/library/view/understanding-mysql-internals/0596009577/ch04.html#orm9780596009571-CHP-4-TABLE-7
// Command bytes for MySQL protocol
const COM_QUIT = 0x01;
const COM_INIT_DB = 0x02;
const COM_QUERY = 0x03;
const COM_FIELD_LIST = 0x04;
const COM_CREATE_DB = 0x05;
const COM_DROP_DB = 0x06;
const COM_REFRESH = 0x07;
const COM_STATISTICS = 0x09;
const COM_PROCESS_INFO = 0x0a;
const COM_CONNECT = 0x0b;
const COM_PROCESS_KILL = 0x0c;
const COM_DEBUG = 0x0d;
const COM_PING = 0x0e;
const COM_CHANGE_USER = 0x11;
const COM_RESET_CONNECTION = 0x1f;
const COM_SET_OPTION = 0x1b;
const COM_STMT_PREPARE = 0x16; // 22
const COM_STMT_EXECUTE = 0x17; // 23
const COM_LONG_DATA = 0x18; // 24

/**
 * A callback function intended for logging purposes.
 * This variable can be assigned a function that processes or outputs
 * log information. It is initialized as `null` by default, implying
 * that no logging behavior is assigned.
 *
 * To utilize this, assign a function to `logCallback` that takes
 * relevant logging arguments as needed.
 *
 * @type {Function|null}
 * @default null
 */
let logCallback = null;

export const MYSQL_PROXY_ERRORS = {
    DB_SOCKET_NOT_WRITABLE: 1,
    CLIENT_SOCKET_NOT_WRITABLE: 2,
    CLIENT_SOCKET_ERROR: 3,
    DB_SOCKET_ERROR: 4,
    PROXY_ERROR: 5,
};

/**
 * A variable intended to store a callback function that will handle errors.
 * The function assigned to this variable should take an error object as its
 * argument and define how the error is managed or reported.
 *
 * @type {Function|null}
 * @default null
 */
let errorCallback = null;

/**
 * Sets the logging callback function to be used by the system.
 * This allows for custom handling of log messages.
 *
 * @param {Function} cb The callback function to be set for logging.
 *                      It should accept log messages as its argument.
 * @return {void}
 */
export function setLogCallback(cb) {
    logCallback = cb;
}

/**
 * Sets a callback function to handle errors.
 *
 * @param {Function} cb A callback function to be executed when an error occurs.
 * @return {void} This function does not return any value.
 */
export function setErrorCallback(cb) {
    errorCallback = cb;
}

/**
 * Logs the provided messages by invoking a callback function if it is defined.
 *
 * @param {{}} data The messages to be logged.
 * @return {void} Does not return any value.
 */
export function log(data) {
    if (logCallback) {
        (logCallback)(data);
    }
}

/**
 * Logs error messages using a specified error callback function.
 *
 * @param {{}} data - The messages to log as errors.
 * @return {void} Does not return any value.
 */
export function error(data) {
    if (errorCallback) {
        (errorCallback)(data);
    }
}

/**
 * @type {net.Server}
 */
let mysqlProxyServer;

/**
 * @type {boolean}
 */
let logNonQueries = true;

const preparedStatements = new MysqlPreparedStatements();

/**
 * @param {boolean} flag
 */
export function setLogNonQueries(flag) {
    logNonQueries = flag;
}

/**
 * Creates a MySQL proxy server that listens for client connections, intercepts MySQL protocol packets,
 * and forwards them to the specified MySQL server. It logs client interactions, such as executed SQL queries
 * and selected databases.
 *
 * @param {string} dbHost The hostname or IP address of the target MySQL server.
 * @param {number} dbPort The port number of the target MySQL server.
 * @param {string} proxyHost The hostname or IP address on which the proxy server should listen.
 * @param {number} proxyPort The port number on which the proxy server should listen.
 * @return {net.Server} Returns a Node.js `Server` instance configured as a MySQL proxy.
 */
export function createMySQLProxyServer(dbHost, dbPort, proxyHost, proxyPort) {
    const server = net.createServer(clientSocket => {
        const clientId = `[MySQL][${clientSocket.remoteAddress}:${clientSocket.remotePort}]`;
        if (logNonQueries) {
            log(`${clientId} Client connected.`);
        }

        const serverSocket = new net.Socket();
        let clientBuffer = Buffer.alloc(0);
        let serverConnected = false;

        // Create externalized client data processor with injected dependencies
        const hostPortKey = `${dbHost}:${dbPort}`;
        const processMySQLClientData = createProcessMySQLClientData({
            getClientBuffer: () => clientBuffer,
            setClientBuffer: (b) => { clientBuffer = b; },
            getLastClientCommand: () => lastClientCommand,
            setLastClientCommand: (v) => { lastClientCommand = v; },
            serverSocket,
            clientSocket,
            clientId,
            logNonQueries,
            log,
            error,
            QueryLogMessage,
            preparedStatements,
            constants: {
                COM_QUIT,
                COM_INIT_DB,
                COM_QUERY,
                COM_FIELD_LIST,
                COM_CREATE_DB,
                COM_DROP_DB,
                COM_REFRESH,
                COM_STATISTICS,
                COM_PROCESS_INFO,
                COM_CONNECT,
                COM_PROCESS_KILL,
                COM_DEBUG,
                COM_PING,
                COM_CHANGE_USER,
                COM_RESET_CONNECTION,
                COM_SET_OPTION,
                COM_STMT_PREPARE,
                COM_STMT_EXECUTE,
                COM_LONG_DATA,
            },
            MYSQL_PROXY_ERRORS,
            storeAuthPacket: (packet) => {
                try {
                    lastAuthPacketByHostPort.set(hostPortKey, Buffer.from(packet));
                    console.log(`${clientId} Stored latest authenticate packet for ${hostPortKey} (${packet.length} bytes).`);
                } catch (e) {
                    // ignore
                }
            },
        });

        serverSocket.connect(dbPort, dbHost, () => {
            if (logNonQueries) {
                log(`${clientId} Successfully connected to MySQL server ${dbHost}:${dbPort}.`);
            }
            serverConnected = true;
            if (clientBuffer.length > 0) {
                processMySQLClientData(clientBuffer);
                clientBuffer = Buffer.alloc(0);
            }
        });

        clientSocket.on('data', data => {
            if (!serverConnected) {
                clientBuffer = Buffer.concat([clientBuffer, data]);
                return;
            }
            processMySQLClientData(data);
        });

        // Buffer to store MySQL server response data
        let serverResponseBuffer = Buffer.alloc(0);
        let lastClientCommand = null;
        let lastStatementId = null;

        serverSocket.on('data', data => {
            // Forward the data to the client
            if (clientSocket.writable) {
                clientSocket.write(data);
            } else {
                console.error('MySQL client socket not writable for MySQL response.');

                error({ code: MYSQL_PROXY_ERRORS.CLIENT_SOCKET_NOT_WRITABLE, clientId, data,
                    message: `Client socket not writable for MySQL response.` });
                serverSocket.end();
                return;
            }

            // Process the response if it's for a COM_STMT_PREPARE command
            ({ serverResponseBuffer, lastClientCommand, lastStatementId } = handleStatementPrepareResponse({
                data,
                serverResponseBuffer,
                lastClientCommand,
                lastStatementId,
                preparedStatements,
                COM_STMT_PREPARE,
            }));
        });

        clientSocket.on('close', () => {
            if (logNonQueries) {
                log(`${clientId} Client disconnected.`);
            }
            if (serverSocket && !serverSocket.destroyed) {
                serverSocket.end();
            }
        });

        clientSocket.on('error', err => {
            console.error('MySQL client error:', err);

            error({ code: MYSQL_PROXY_ERRORS.CLIENT_SOCKET_ERROR, clientId, error: err,
                message: `Client socket error` });
            if (serverSocket && !serverSocket.destroyed) {
                serverSocket.destroy(err);
            }
        });

        serverSocket.on('close', hadError => {
            if (logNonQueries) {
                log(`${clientId} Disconnected from MySQL server ${hadError ? 'due to an error.' : 'gracefully.'}`);
            }
            if (clientSocket && !clientSocket.destroyed) {
                clientSocket.end();
            }
        });

        serverSocket.on('error', err => {
            console.error('MySQL server error:', err);

            error({ code: MYSQL_PROXY_ERRORS.DB_SOCKET_ERROR, clientId, error: err, message: `MySQL socket error` });
            if (clientSocket && !clientSocket.destroyed) {
                error(`${clientId} Closing client connection due to MySQL connection error.`);
                clientSocket.destroy(err); // More forceful close
            }
        });
    });

    server.on('error', err => {
        console.error('Proxy server error:', err);

        error({ code: MYSQL_PROXY_ERRORS.PROXY_ERROR, error: err, message: `MySQL Proxy Server error` });
        if (err.code === 'EADDRINUSE') {
            error(`MySQL Proxy port ${proxyPort} is already in use.`);
        }
    });

    server.listen(proxyPort, proxyHost, () => {
        console.log(`MySQL Proxy Server listening on ${proxyHost}:${proxyPort}`);
        log(`MySQL Proxy Server listening on ${proxyHost}:${proxyPort}`);
    });

    mysqlProxyServer = server;

    preparedStatements.startDeleteOutdatedStatements();

    return server;
}

/** @type {MysqlClient} */
let mysqlClient;

/** @type {string} */
let mysqlClientConfigString;

/**
 * @param {{}} config
 * @returns {Promise<MysqlClient>}
 */
async function getMysqlClient$(config) {
    const configString = JSON.stringify(config);
    if (!mysqlClient || mysqlClientConfigString !== configString) {
        if (mysqlClient) {
            await mysqlClient.close$();
        }
        mysqlClient = new MysqlClient(config);
        mysqlClientConfigString = configString;
    }
    return mysqlClient;
}

/**
 * @param {string} query
 * @param {string} host
 * @param {string} port
 * @param {string} login
 * @param {string} password
 * @param database
 * @returns {Promise<{rows: *[]}>}
 */
export async function sendSqlQuery$(query, host, port, login, password, database) {
    const client = await getMysqlClient$({ host, port, user: login, password, database });
    await client.connect$();
    return await client.query$(query);
}

/**
 * Shuts down the running proxy servers for MySQL.
 *
 * @return {void}
 */
export function shutdownProxyServers() {
    log('Shutting down proxy servers...');

    if (mysqlProxyServer) {
        mysqlProxyServer.close(() => {
            log('MySQL Proxy Server closed.');
        });
    }

    preparedStatements.stopDeleteOutdatedStatements();
}
