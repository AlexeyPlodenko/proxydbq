import {MysqlPreparedStatement} from "./MysqlPreparedStatement.js";

/**
 * Handle MySQL server response for COM_STMT_PREPARE.
 * Externalized from mysqlProxyServer.js to keep file lean and focused.
 *
 * @param {Object} opts
 * @param {Buffer} opts.data Incoming chunk from MySQL server socket
 * @param {Buffer} opts.serverResponseBuffer Accumulated buffer of server responses
 * @param {{commandByte:number, payload?: Buffer, clientId?: string, sequenceId?: number, query?: string}|null} opts.lastClientCommand
 * @param {number|null} opts.lastStatementId
 * @param {import('./MysqlPreparedStatements.js').MysqlPreparedStatements} opts.preparedStatements
 * @param {number} opts.COM_STMT_PREPARE
 * @returns {{ serverResponseBuffer: Buffer, lastClientCommand: any, lastStatementId: number|null }}
 */
export function handleStatementPrepareResponse(opts) {
  let {
    data,
    serverResponseBuffer,
    lastClientCommand,
    lastStatementId,
    preparedStatements,
    COM_STMT_PREPARE,
  } = opts;

  // Only process when the last client command was COM_STMT_PREPARE
  if (!(lastClientCommand && lastClientCommand.commandByte === COM_STMT_PREPARE)) {
    return { serverResponseBuffer, lastClientCommand, lastStatementId };
  }

  serverResponseBuffer = Buffer.concat([serverResponseBuffer, data]);

  // Process the response buffer
  while (serverResponseBuffer.length >= 4) {
    const packetLength = serverResponseBuffer.readUIntLE(0, 3);
    const totalPacketLength = packetLength + 4;

    // If we don't have the complete packet yet, wait for more data
    if (serverResponseBuffer.length < totalPacketLength) {
      break;
    }

    const packet = serverResponseBuffer.subarray(0, totalPacketLength);
    const payload = packet.subarray(4);

    // Check if this is the first packet of the response (OK packet)
    if (payload[0] === 0x00) {
      // This is the OK packet for COM_STMT_PREPARE
      // Format:
      // 1 byte: 0x00 (OK)
      // 4 bytes: statement_id
      // 2 bytes: num_columns
      // 2 bytes: num_params
      // 1 byte: reserved (0x00)
      // 2 bytes: warning_count

      const statementId = payload.readUInt32LE(1);
      // const numColumns = payload.readUInt16LE(5);
      const paramCount = payload.readUInt16LE(7);

      // Store the statement information
      const statement = new MysqlPreparedStatement(statementId, paramCount);
      statement.payload = lastClientCommand.payload;
      statement.clientId = lastClientCommand.clientId;
      statement.sequenceId = lastClientCommand.sequenceId;
      statement.commandByte = lastClientCommand.commandByte;
      statement.query = lastClientCommand.query;

      preparedStatements.addStatement(statementId, statement);

      // Remember the statement ID for parameter metadata packets
      lastStatementId = statementId;
    }

    // Move to the next packet
    serverResponseBuffer = serverResponseBuffer.subarray(totalPacketLength);
  }

  // Reset after processing
  if (serverResponseBuffer.length === 0) {
    lastClientCommand = null;
    lastStatementId = null;
  }

  return { serverResponseBuffer, lastClientCommand, lastStatementId };
}
