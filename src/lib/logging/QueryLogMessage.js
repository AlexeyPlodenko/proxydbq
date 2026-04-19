import {LogMessage} from "./LogMessage.js";

export class QueryLogMessage extends LogMessage {
    /** @type {number} */
    commandByte;

    /** @type {string} */
    query;

    /** @type {number|null} */
    sendTime = null;

    /** @type {number|null} */
    processTime = null;

    /** @type {number|null} */
    responseTime = null;

    /** @type {string|null} */
    connectionId = null;

    constructor(commandByte, query, connectionId = null) {
        super();
        this.commandByte = commandByte;
        this.query = query;
        this.connectionId = connectionId;
    }
}
