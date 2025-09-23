import net from 'net';

// --- Configuration ---

// PostgreSQL Configuration
// const PG_HOST = process.env.PG_HOST || '127.0.0.1'; // Target PostgreSQL server host
// const PG_PORT = parseInt(process.env.PG_PORT || '5432', 10); // Target PostgreSQL server port
// const PG_PROXY_PORT = parseInt(process.env.PG_PROXY_PORT || '5433', 10); // Port for the PostgreSQL proxy

// const PROXY_HOST = '0.0.0.0'; // Listen on all available network interfaces

// Message types (ASCII codes)
const PG_MSG_TYPE_QUERY = 'Q'.charCodeAt(0); // 81
const PG_MSG_TYPE_TERMINATE = 'X'.charCodeAt(0); // 88
// Add other PG message type constants if needed for more detailed parsing

// log(`Proxy Server starting...`);
// log(`PostgreSQL Proxy: ${PROXY_HOST}:${PG_PROXY_PORT} -> ${PG_HOST}:${PG_PORT}`);

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
 * @param {Function} cb - The callback function to be set for logging.
 *                        It should accept log messages as its argument.
 * @return {void}
 */
export function setLogCallback(cb) {
    logCallback = cb;
}

/**
 * Sets a callback function to handle errors.
 *
 * @param {Function} cb - A callback function to be executed when an error occurs.
 * @return {void} This function does not return any value.
 */
export function setErrorCallback(cb) {
    errorCallback = cb;
}

/**
 * Logs the provided messages by invoking a callback function if it is defined.
 *
 * @param {...any} messages The messages to be logged. Can accept multiple arguments of any type.
 * @return {void} Does not return any value.
 */
export function log(...messages) {
    if (logCallback) {
        (logCallback)(messages);
    }
}

/**
 * Logs error messages using a specified error callback function.
 *
 * @param {...any} messages - The messages to log as errors. Can include multiple arguments of any type.
 * @return {void} Does not return any value.
 */
export function error(...messages) {
    if (errorCallback) {
        (errorCallback)(messages);
    }
}

/**
 * @type {net.Server}
 */
let pgProxyServer;

/**
 * @type {boolean}
 */
let logNonQueries = false;

/**
 * @param {boolean} flag
 */
export function setLogNonQueries(flag) {
    logNonQueries = flag;
}

/**
 * Creates a PostgreSQL proxy server that listens for client connections and forwards their traffic
 * to a PostgreSQL server, while optionally handling and intercepting certain types of messages.
 *
 * @param {string} PG_HOST - The hostname or IP address of the target PostgreSQL server.
 * @param {number} PG_PORT - The port number on which the PostgreSQL server is listening.
 * @param {number} PG_PROXY_PORT - The port number on which the proxy server will listen for client connections.
 * @return {import('net').Server} The created proxy server instance.
 */
export function createPostgreSQLProxyServer(PG_HOST, PG_PORT, PG_PROXY_PORT) {
    const server = net.createServer(clientSocket => {
        const clientId = `[PgSQL][${clientSocket.remoteAddress}:${clientSocket.remotePort}]`;
        log(`${clientId} Client connected.`);

        const pgSocket = new net.Socket();
        let clientBuffer = Buffer.alloc(0);
        let pgConnected = false;

        pgSocket.connect(PG_PORT, PG_HOST, () => {
            log(`${clientId} Successfully connected to PostgreSQL server ${PG_HOST}:${PG_PORT}.`);
            pgConnected = true;
            if (clientBuffer.length > 0) {
                processPostgreSQLClientData(clientBuffer); // Process any buffered data
                clientBuffer = Buffer.alloc(0);
            }
        });

        clientSocket.on('data', data => {
            if (!pgConnected) {
                clientBuffer = Buffer.concat([clientBuffer, data]);
                return;
            }
            processPostgreSQLClientData(data);
        });

        function processPostgreSQLClientData(dataChunk) {
            clientBuffer = Buffer.concat([clientBuffer, dataChunk]);

            // PostgreSQL messages: 1-byte type, 4-byte length (big-endian, includes self)
            while (clientBuffer.length > 0) {
                const messageType = clientBuffer.readUInt8(0);

                // Startup packet is special: first 4 bytes are length, then protocol version.
                // It doesn't have a 1-byte type char before length.
                // For simplicity, we'll assume handshake completes and then look for 'Q'.
                // A robust parser would handle the startup message sequence explicitly.

                if (clientBuffer.length < 5) { // Need at least 1 byte for type and 4 for length
                    // log(`${clientId} PG: Incomplete message header (need 5 bytes, have ${clientBuffer.length}). Waiting for more data.`);
                    break;
                }

                // Length field is Int32BE, and it INCLUDES its own 4 bytes.
                const messageLengthIncludingSelf = clientBuffer.readInt32BE(1);
                const totalMessageBytesOnWire = 1 + messageLengthIncludingSelf; // Type byte + (Length field + Payload)

                if (clientBuffer.length < totalMessageBytesOnWire) {
                    // log(`${clientId} PG: Incomplete message body for type ${String.fromCharCode(messageType)} (need ${totalMessageBytesOnWire}, have ${clientBuffer.length}). Waiting for more.`);
                    break;
                }

                const currentMessage = clientBuffer.subarray(0, totalMessageBytesOnWire);
                const payload = currentMessage.subarray(5); // Payload starts after type (1) and length (4)

                if (messageType === PG_MSG_TYPE_QUERY) {
                    // The payload for a 'Q' message is a null-terminated string.
                    // The length field (messageLengthIncludingSelf) is for (length_bytes + string_bytes + null_terminator).
                    // So, the string itself is payload.length - 1 (for the null terminator).
                    const query = payload.subarray(0, payload.length -1).toString('utf8'); // Exclude null terminator for clean log
                    log(`\n-------------------- PostgreSQL Query --------------------`);
                    log(`${clientId} Extracted SQL Query:`);
                    log(query);
                    log(`----------------------------------------------------------\n`);
                } else if (messageType === PG_MSG_TYPE_TERMINATE) {
                    log(`${clientId} Client sent Terminate message.`);
                }
                // Add other message type handling if needed

                if (pgSocket.writable) {
                    pgSocket.write(currentMessage);
                } else {
                    error(`${clientId} ERROR: PostgreSQL socket not writable. Cannot forward message.`);
                    clientSocket.end();
                    pgSocket.end();
                    break;
                }
                clientBuffer = clientBuffer.subarray(totalMessageBytesOnWire);
            }
        }

        pgSocket.on('data', data => {
            if (clientSocket.writable) {
                clientSocket.write(data);
            } else {
                error(`${clientId} ERROR: Client socket not writable for PostgreSQL response.`);
                pgSocket.end();
            }
        });

        clientSocket.on('close', () => {
            log(`${clientId} Client disconnected.`);
            if (pgSocket && !pgSocket.destroyed) pgSocket.end();
        });

        clientSocket.on('error', err => {
            error(`${clientId} Client socket error:`, err.message);
            if (pgSocket && !pgSocket.destroyed) pgSocket.destroy(err);
        });

        pgSocket.on('close', hadError => {
            log(`${clientId} Disconnected from PostgreSQL server ${hadError ? 'due to an error.' : 'gracefully.'}`);
            if (clientSocket && !clientSocket.destroyed) clientSocket.end();
        });

        pgSocket.on('error', err => {
            error(`${clientId} PostgreSQL socket error:`, err.message);
            if (clientSocket && !clientSocket.destroyed) {
                error(`${clientId} Closing client connection due to PostgreSQL connection error.`);
                clientSocket.destroy(err);
            }
        });
    });

    server.on('error', err => {
        error(`[PgSQL Proxy] Server error:`, err);
        if (err.code === 'EADDRINUSE') {
            error(`PostgreSQL Proxy port ${PG_PROXY_PORT} is already in use.`);
        }
    });

    server.listen(PG_PROXY_PORT, PROXY_HOST, () => {
        log(`[PgSQL Proxy] Server listening on ${PROXY_HOST}:${PG_PROXY_PORT}`);
    });

    pgProxyServer = server;

    return server;
}

// // --- Start the proxy servers ---
// const pgProxyServer = createPostgreSQLProxyServer();

/**
 * Shuts down the running proxy servers for PostgreSQL.
 * Ensures both servers are properly closed before exiting the process.
 * If the servers fail to close within the allowed time, forces the shutdown.
 *
 * @return {void} Does not return a value, exits the process upon successful shutdown or timeout.
 */
export function shutdownProxyServers() {
    log('Shutting down proxy servers...');
    let pgClosed = false;

    function checkExit() {
        if (pgClosed) {
            log('All proxy servers closed.');
            // process.exit(0);
        }
    }

    if (pgProxyServer) {
        pgProxyServer.close(() => {
            log('[PgSQL Proxy] Server closed.');
            pgClosed = true;
            checkExit();
        });
    } else {
        pgClosed = true; // If server wasn't even started
    }

    // Force exit if servers don't close in time
    // setTimeout(() => {
    //     error('Timeout during shutdown. Forcing exit.');
    //     process.exit(1);
    // }, 5000);
}

// process.on('SIGINT', shutdown);
// process.on('SIGTERM', shutdown);
//
// log("---");
// log("Ensure your PostgreSQL client connects to the PostgreSQL proxy port.");
// log("Extracted SQL queries will be printed to the console.");
// log("NOTE: This is a simplified proxy. It may not handle all protocol features,");
// log("SSL encryption, or complex handshake scenarios correctly.");
// log("---");
