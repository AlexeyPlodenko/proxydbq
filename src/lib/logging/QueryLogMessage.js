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

    constructor(commandByte, query) {
        super();
        this.commandByte = commandByte;
        this.query = query;
    }
}
