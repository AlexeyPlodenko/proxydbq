import {d} from "../helpers.js";
import {InvalidAmountOfPlaceholders} from "./InvalidAmountOfPlaceholders.js";

// MySQL type constants
const MYSQL_TYPE_TINY = 0x01;       // TINYINT
const MYSQL_TYPE_SHORT = 0x02;      // SMALLINT
const MYSQL_TYPE_LONG = 0x03;       // INT
const MYSQL_TYPE_FLOAT = 0x04;      // FLOAT
const MYSQL_TYPE_DOUBLE = 0x05;     // DOUBLE
const MYSQL_TYPE_NULL = 0x06;       // NULL
const MYSQL_TYPE_TIMESTAMP = 0x07;  // TIMESTAMP
const MYSQL_TYPE_LONGLONG = 0x08;   // BIGINT
const MYSQL_TYPE_INT24 = 0x09;      // MEDIUMINT
const MYSQL_TYPE_DATE = 0x0A;       // DATE (10)
const MYSQL_TYPE_TIME = 0x0B;       // TIME (11)
const MYSQL_TYPE_DATETIME = 0x0C;   // DATETIME (12)
const MYSQL_TYPE_YEAR = 0x0D;       // YEAR (13)
const MYSQL_TYPE_VARCHAR = 0x0F;    // VARCHAR (15)
const MYSQL_TYPE_BIT = 0x10;        // BIT (16)
const MYSQL_TYPE_NEWDECIMAL = 0xF6; // DECIMAL (246)
const MYSQL_TYPE_BLOB = 0xFC;       // BLOB/TEXT (252)
const MYSQL_TYPE_VAR_STRING = 0xFD; // VARCHAR (253)
const MYSQL_TYPE_STRING = 0xFE;     // CHAR/BINARY (254)
const MYSQL_TYPE_GEOMETRY = 0xFF;   // GEOMETRY (255)

export class MysqlPreparedStatement {
    /** @type {Date} */
    date = new Date();

    /** @type {number} */
    statementId;

    /** @type {number} */
    paramCount;

    /** @type {number} */
    flags;

    /** @type {number} */
    iterationCount;

    /** @type {number} */
    newParamsBoundFlag;

    /** @type {[]} */
    paramTypes;

    /** @type {[]} */
    paramValues;

    /** @type {string} */
    paramValuesRaw;

    /** @type {string} */
    nullBitmap;

    /** @type {string} */
    rawData;

    /** @type {string} */
    error;

    payload;
    clientId;
    sequenceId;
    commandByte;
    query;

    /**
     * @param {number} statementId
     * @param {number} paramCount
     */
    constructor(statementId, paramCount) {
        this.statementId = statementId;
        this.paramCount = paramCount;
    }

    /**
     * @param {Buffer} payload COM_STMT_EXECUTE packet
     */
    setExecuteStatementQuery(payload) {
        // Parse COM_STMT_EXECUTE packet according to MySQL protocol
        // Format:
        // 1 byte: command (0x17)
        // 4 bytes: statement_id
        // 1 byte: flags
        // 4 bytes: iteration_count (always 1)
        // If there are parameters:
        //   null_bitmap (length depends on number of parameters)
        //   new_params_bound_flag (1 byte)
        //   if new_params_bound_flag == 1:
        //     parameter types (2 bytes per parameter)
        //   parameter values

        const flags = payload.readUInt8(5);
        const iterationCount = payload.readUInt32LE(6);

        try {
            // Get the prepared statement info
            if (this.paramCount > 0) {
                this.flags = flags;
                this.iterationCount = iterationCount;

                const paramCount = this.paramCount;

                // Calculate null bitmap size (1 bit per parameter, rounded up to bytes)
                const nullBitmapBytes = Math.floor((paramCount + 7) / 8);

                // Extract null bitmap (starts at offset 10)
                const nullBitmap = payload.subarray(10, 10 + nullBitmapBytes);

                // Extract new_params_bound_flag (1 byte after null bitmap)
                const newParamsBoundFlagOffset = 10 + nullBitmapBytes;
                const newParamsBoundFlag = payload.readUInt8(newParamsBoundFlagOffset);

                this.newParamsBoundFlag = newParamsBoundFlag;

                // Extract parameter types if new_params_bound_flag is 1
                const paramValues = [];

                if (newParamsBoundFlag === 1) {
                    const paramTypes = [];
                    let offset = newParamsBoundFlagOffset + 1;

                    // Extract parameter types (2 bytes per parameter)
                    for (let i = 0; i < paramCount; i++) {
                        const paramType = payload.readUInt16LE(offset);
                        paramTypes.push(paramType);
                        offset += 2;
                    }

                    this.paramTypes = paramTypes;

                    // Now extract parameter values
                    for (let i = 0; i < paramCount; i++) {
                        // Check if parameter is NULL using the null bitmap
                        const bytePos = Math.floor(i / 8);
                        const bitPos = i % 8;
                        const isNull = (nullBitmap[bytePos] & (1 << bitPos)) !== 0;
                        if (isNull) {
                            paramValues.push(null);
                        } else {
                            // Extract value based on parameter type
                            const paramType = paramTypes[i];

                            // Extract value based on type
                            switch (paramType & 0xFF) {
                                case MYSQL_TYPE_TINY:
                                    paramValues.push(payload.readInt8(offset));
                                    offset += 1;
                                    break;

                                case MYSQL_TYPE_SHORT:
                                    paramValues.push(payload.readInt16LE(offset));
                                    offset += 2;
                                    break;

                                case MYSQL_TYPE_LONG:
                                case MYSQL_TYPE_INT24:
                                    paramValues.push(payload.readInt32LE(offset));
                                    offset += 4;
                                    break;

                                case MYSQL_TYPE_LONGLONG:
                                    // JSON can't precisely represent 64-bit integers during stringify
                                    paramValues.push(payload.readBigUInt64LE(offset)/*.toString()*/);

                                    offset += 8;
                                    break;

                                case MYSQL_TYPE_FLOAT:
                                    paramValues.push(payload.readFloatLE(offset));
                                    offset += 4;
                                    break;

                                case MYSQL_TYPE_DOUBLE:
                                    paramValues.push(payload.readDoubleLE(offset));
                                    offset += 8;
                                    break;

                                case MYSQL_TYPE_STRING:
                                case MYSQL_TYPE_VARCHAR:
                                case MYSQL_TYPE_VAR_STRING:
                                case MYSQL_TYPE_BLOB:
                                    // Length-encoded string
                                    const strLen = payload.readUInt8(offset);
                                    offset += 1;
                                    if (strLen < 251) {
                                        paramValues.push(payload.subarray(offset, offset + strLen).toString('utf8'));
                                        offset += strLen;
                                    } else if (strLen === 252) {
                                        const len = payload.readUInt16LE(offset);
                                        offset += 2;
                                        paramValues.push(payload.subarray(offset, offset + len).toString('utf8'));
                                        offset += len;
                                    } else if (strLen === 253) {
                                        const len = payload.readUInt32LE(offset) & 0xFFFFFF;
                                        offset += 3;
                                        paramValues.push(payload.subarray(offset, offset + len).toString('utf8'));
                                        offset += len;
                                    } else {
                                        // 254 (8-byte length)
                                        const len = Number(payload.readBigUInt64LE(offset));
                                        offset += 8;
                                        paramValues.push(payload.subarray(offset, offset + len).toString('utf8'));
                                        offset += len;
                                    }
                                    break;

                                case MYSQL_TYPE_DATE:
                                case MYSQL_TYPE_DATETIME:
                                case MYSQL_TYPE_TIMESTAMP:
                                    // Date/time values are complex, for now just extract the raw bytes
                                    const dateLen = payload.readUInt8(offset);
                                    offset += 1;
                                    paramValues.push('0x' + payload.subarray(offset, offset + dateLen).toString('hex'));
                                    offset += dateLen;
                                    break;

                                case MYSQL_TYPE_TIME:
                                    // Time values are complex, for now just extract the raw bytes
                                    const timeLen = payload.readUInt8(offset);
                                    offset += 1;
                                    paramValues.push('0x' + payload.subarray(offset, offset + timeLen).toString('hex'));
                                    offset += timeLen;
                                    break;

                                default:
                                    // For other types, just store the hex representation
                                    paramValues.push('0x' + payload.subarray(offset, offset + 8).toString('hex'));
                                    offset += 8; // Assume 8 bytes for unknown types
                                    break;
                            }
                        }
                    }

                    this.paramValues = paramValues;

                    // Also include the raw data for debugging
                    this.paramValuesRaw = payload.subarray(newParamsBoundFlagOffset + 1 + paramCount * 2).toString('hex');
                }

                // Include null bitmap in hex format
                this.nullBitmap = nullBitmap.toString('hex');
            } else {
                // If we don't have statement info, include raw data for debugging
                this.rawData = payload.subarray(1).toString('hex');
            }
        } catch (err) {
            this.error = err.message;
        }
    }

    /**
     * @returns {string}
     */
    getQueryWithParameters() {
        if (!this.paramValues) {
            return this.query;
        }

        let query = this.query;
        const paramValues = this.paramValues.map((value) => this.decorateParamValue(value));
        for (let i = 0; i < paramValues.length; i++) {
            const placeholderPos = query.indexOf('?');
            if (placeholderPos === -1) {
                throw new InvalidAmountOfPlaceholders(
                    'Amount of parameters and placeholders in query is different.',
                    this.query,
                    this.paramValues
                );
            }

            query = query.substring(0, placeholderPos) + paramValues[i] + query.substring(placeholderPos + 1);
        }

        return query;
    }

    /**
     * @param {*} value
     * @returns {string|number}
     * @protected
     */
    decorateParamValue(value) {
        if (typeof value === 'string') {
            // @TODO properly escape strings
            return ['"', value, '"'].join('');
        }
        if (value === null) {
            return 'NULL';
        }
        if (value === true) {
            return 'TRUE';
        }
        if (value === false) {
            return 'FALSE';
        }
        return value;
    }
}
