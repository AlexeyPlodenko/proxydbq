import {Db} from "../services/Db.js";
import {useConnectionsStore} from "../../stores.js";

/** @type {Db} */
let db;

/**
 * @returns {Db}
 */
export function getRendererDb() {
    if (!db) {
        const connectionsStore = useConnectionsStore();
        db = new Db(connectionsStore);
    }

    return db;
}
