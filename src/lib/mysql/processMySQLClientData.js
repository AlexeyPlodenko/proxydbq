// Extracted processor for MySQL client data packets
// This module exposes a factory that accepts required dependencies and
// returns a function processMySQLClientData(dataChunk)

/**
 * @typedef {{
 *  COM_QUIT:number, COM_INIT_DB:number, COM_QUERY:number, COM_FIELD_LIST:number, COM_CREATE_DB:number,
 *  COM_DROP_DB:number, COM_REFRESH:number, COM_STATISTICS:number, COM_PROCESS_INFO:number, COM_CONNECT:number,
 *  COM_PROCESS_KILL:number, COM_DEBUG:number, COM_PING:number, COM_CHANGE_USER:number, COM_RESET_CONNECTION:number,
 *  COM_SET_OPTION:number, COM_STMT_PREPARE:number, COM_STMT_EXECUTE:number, COM_LONG_DATA:number
 * }} MySQLCommandConstants
 *
 * @typedef {{ DB_SOCKET_NOT_WRITABLE:number }} MysqlProxyErrors
 */

/**
 * Factory that creates the processMySQLClientData function with injected dependencies.
 *
 * @param {Object} deps
 * @param {() => Buffer} deps.getClientBuffer
 * @param {(b: Buffer) => void} deps.setClientBuffer
 * @param {() => any} deps.getLastClientCommand
 * @param {(v: any) => void} deps.setLastClientCommand
 * @param {import('net').Socket} deps.serverSocket
 * @param {import('net').Socket} deps.clientSocket
 * @param {string} deps.clientId
 * @param {boolean} deps.logNonQueries
 * @param {(data: any) => void} deps.log
 * @param {(data: any) => void} deps.error
 * @param {any} deps.QueryLogMessage
 * @param {{ getStatement: Function, deleteStatement: Function }} deps.preparedStatements
 * @param {MySQLCommandConstants} deps.constants
 * @param {MysqlProxyErrors} deps.MYSQL_PROXY_ERRORS
 * @returns {(dataChunk: Buffer) => void}
 */
export function createProcessMySQLClientData({
    getClientBuffer,
    setClientBuffer,
    getLastClientCommand,
    setLastClientCommand,
    serverSocket,
    clientSocket,
    clientId,
    logNonQueries,
    log,
    error,
    QueryLogMessage,
    preparedStatements,
    constants,
    MYSQL_PROXY_ERRORS,
    // Optional callback to store latest authenticate packet
    storeAuthPacket,
}) {
    const {
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
    } = constants;

    /**
     * @param {Buffer} dataChunk
     */
    function processMySQLClientData(dataChunk) {
        let clientBuffer = getClientBuffer();
        clientBuffer = Buffer.concat([clientBuffer, dataChunk]);
        setClientBuffer(clientBuffer);

        const knownCommands = new Set([
            COM_QUIT, COM_INIT_DB, COM_QUERY, COM_FIELD_LIST, COM_CREATE_DB,
            COM_DROP_DB, COM_REFRESH, COM_STATISTICS, COM_PROCESS_INFO, COM_CONNECT,
            COM_PROCESS_KILL, COM_DEBUG, COM_PING, COM_CHANGE_USER, COM_RESET_CONNECTION,
            COM_SET_OPTION, COM_STMT_PREPARE, COM_STMT_EXECUTE, COM_LONG_DATA,
        ]);

        while (clientBuffer.length >= 4) {
            const payloadLength = clientBuffer.readUIntLE(0, 3);
            const sequenceId = clientBuffer.readUInt8(3);
            const totalPacketLength = 4 + payloadLength;

            if (clientBuffer.length < totalPacketLength) {
                break;
            }

            const currentPacket = clientBuffer.subarray(0, totalPacketLength);
            const payload = currentPacket.subarray(4);
            if (payload.length > 0) {
                const commandByte = payload.readUInt8(0);

                // Try to detect an authenticate (handshake response) packet and store it.
                // Heuristic: not a known COM_* command, first sequence after handshake (seq=1), reasonably large payload.
                try {
                    if (typeof storeAuthPacket === 'function') {
                        const isKnownCommand = knownCommands.has(commandByte);
                        if (!isKnownCommand && sequenceId === 1 && payload.length >= 32) {
                            // Likely handshake response from client (authenticate)
                            storeAuthPacket(Buffer.from(currentPacket));
                        }/* else if (commandByte === COM_CHANGE_USER) {
                            // COM_CHANGE_USER carries credentials; store as latest auth as well.
                            storeAuthPacket(Buffer.from(currentPacket));
                        }*/
                    }
                } catch (_) {}

                // @TODO use strategy pattern
                if (
                    commandByte === COM_QUERY ||
                    commandByte === COM_STMT_PREPARE ||
                    commandByte === COM_STMT_EXECUTE ||
                    commandByte === COM_LONG_DATA
                ) {
                    if (payload.length > 1) {
                        switch (commandByte) {
                            case COM_QUERY:
                                log(new QueryLogMessage(COM_QUERY, payload.subarray(1).toString('utf8')));
                                break;

                            case COM_STMT_PREPARE: {
                                // remember the query to enrich with parameters later
                                const last = {
                                    payload,
                                    clientId,
                                    sequenceId,
                                    commandByte,
                                    query: payload.subarray(1).toString('utf8'),
                                };
                                setLastClientCommand(last);
                                break;
                            }

                            case COM_STMT_EXECUTE: {
                                const statementId = payload.readUInt32LE(1);
                                const statement = preparedStatements.getStatement(statementId);
                                if (!statement) {
                                    console.error(`Prepared statement ${statementId} does not exist.`);
                                    break;
                                }

                                statement.setExecuteStatementQuery(payload);

                                log(new QueryLogMessage(COM_STMT_EXECUTE, statement.getQueryWithParameters()));

                                preparedStatements.deleteStatement(statementId);
                                break;
                            }

                            case COM_LONG_DATA:
                                console.log('COM_LONG_DATA TODO:', payload);
                                break;
                        }
                    }
                } else if (logNonQueries) {
                    // Handle different MySQL command types
                    switch (commandByte) {
                        case COM_INIT_DB:
                            log({
                                payload,
                                clientId,
                                sequenceId,
                                commandByte,
                                dbName: payload.length > 1 ? payload.subarray(1).toString('utf8') : null,
                                message: 'Client selected database',
                            });
                            break;
                        case COM_QUIT:
                            log({ payload, clientId, sequenceId, commandByte, message: 'Client sent COM_QUIT' });
                            break;
                        case COM_PING:
                            log({ payload, clientId, sequenceId, commandByte, message: 'Client sent COM_PING' });
                            break;
                        case COM_FIELD_LIST:
                            log({ payload, clientId, sequenceId, commandByte, message: 'Client sent COM_FIELD_LIST' });
                            break;
                        case COM_CREATE_DB:
                            log({
                                payload,
                                clientId,
                                sequenceId,
                                commandByte,
                                dbName: payload.length > 1 ? payload.subarray(1).toString('utf8') : null,
                                message: 'Client creating database',
                            });
                            break;
                        case COM_DROP_DB:
                            log({
                                payload,
                                clientId,
                                sequenceId,
                                commandByte,
                                dbName: payload.length > 1 ? payload.subarray(1).toString('utf8') : null,
                                message: 'Client dropping database',
                            });
                            break;
                        case COM_REFRESH:
                            log({ payload, clientId, sequenceId, commandByte, message: 'Client sent COM_REFRESH' });
                            break;
                        case COM_STATISTICS:
                            log({ payload, clientId, sequenceId, commandByte, message: 'Client sent COM_STATISTICS' });
                            break;
                        case COM_PROCESS_INFO:
                            log({ payload, clientId, sequenceId, commandByte, message: 'Client sent COM_PROCESS_INFO' });
                            break;
                        case COM_CONNECT:
                            log({ payload, clientId, sequenceId, commandByte, message: 'Client sent COM_CONNECT' });
                            break;
                        case COM_PROCESS_KILL:
                            log({ payload, clientId, sequenceId, commandByte, message: 'Client sent COM_PROCESS_KILL' });
                            break;
                        case COM_DEBUG:
                            log({ payload, clientId, sequenceId, commandByte, message: 'Client sent COM_DEBUG' });
                            break;
                        case COM_CHANGE_USER:
                            log({ payload, clientId, sequenceId, commandByte, message: 'Client sent COM_CHANGE_USER' });
                            break;
                        case COM_RESET_CONNECTION:
                            log({ payload, clientId, sequenceId, commandByte, message: 'Client sent COM_RESET_CONNECTION' });
                            break;
                        case COM_SET_OPTION:
                            log({ payload, clientId, sequenceId, commandByte, message: 'Client sent COM_SET_OPTION' });
                            break;
                        default:
                            // Log other command types with their hex values for better debugging
                            log({
                                payload,
                                clientId,
                                sequenceId,
                                commandByte,
                                message: 'Unknown command',
                                data: payload.subarray(1).toString('utf8'),
                            });
                            break;
                    }
                }
            }

            if (serverSocket.writable) {
                    serverSocket.write(currentPacket);
            } else {
                console.error('MySQL server socket not writable. Cannot forward packet.');

                error({
                    code: MYSQL_PROXY_ERRORS.DB_SOCKET_NOT_WRITABLE,
                    payload,
                    clientId,
                    sequenceId,
                    message: 'MySQL socket not writable. Cannot forward packet.',
                });
                clientSocket.end();
                serverSocket.end();
                break;
            }
            // advance client buffer
            clientBuffer = clientBuffer.subarray(totalPacketLength);
            setClientBuffer(clientBuffer);
        }
    }

    return processMySQLClientData;
}
