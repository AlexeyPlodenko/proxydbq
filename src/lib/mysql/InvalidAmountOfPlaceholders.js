export class InvalidAmountOfPlaceholders extends Error {
    /**
     * @param {string} message
     * @param {string} query
     * @param {string[]} paramValues
     */
    constructor(message, query, paramValues) {
        super(message);
        this.name = 'InvalidAmountOfPlaceholders';
        this.query = query;
        this.paramValues = paramValues;
    }
}
