import {LogMessage} from "./LogMessage.js";

export class QueryLogMessage extends LogMessage {
    /** @type {number} */
    commandByte;

    /** @type {string} */
    query;

    constructor(commandByte, query) {
        super();
        this.commandByte = commandByte;
        this.query = query;
    }
}
